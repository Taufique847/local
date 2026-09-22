# QA Bug Report

## Testing Information

* **Project:** BlueCollar AI (AI phone receptionist + CRM/ops platform for home-service contractors)
* **Date:** September 22, 2026
* **Tester:** Autonomous QA Agent
* **Environment:** Local development — backend (Express/TypeScript/Mongoose) on `http://localhost:5000`, frontend (Next.js 14) on `http://localhost:3000`, MongoDB running as a local Windows service. `VOICE_PROVIDER=mock`, `STRIPE_SECRET_KEY` unset (billing simulation mode), Twilio credentials unset (webhook signature verification exercised in its fail-closed configuration).
* **Browser:** N/A — no browser automation tool was available in this environment. All HTTP-level testing was performed directly against the API with `curl`/Node `fetch`; frontend testing was limited to raw HTTP responses (see Untested Areas).
* **Test Scope:** Authentication & session lifecycle, authorization/multi-tenant isolation, input validation across CRUD routes, appointment scheduling concurrency, estimate/invoice billing workflow, customer-portal share-token security, worker (field technician) endpoints, Twilio/Stripe webhook signature enforcement, and light frontend route/rendering checks.

---

# Summary

* **Total confirmed bugs:** 7
* **Critical:** 1
* **High:** 2
* **Medium:** 2
* **Low:** 2
* **UI:** 0
* **Unconfirmed:** 0

---

# Bug List

## BUG-001 — Worker job endpoints have no tenant/business scoping (cross-tenant read, write, and billing-record creation)

**Severity:** CRITICAL

**Status:** CONFIRMED

**Feature:**
Field Technician / Worker PWA API (`/api/worker/jobs/:appointmentId/*`)

**Environment:**
Local development, MongoDB-backed

**Preconditions:**
Two separate businesses/tenants each with their own authenticated user account (any authenticated user works; no special role needed since RBAC is not enforced anywhere in this application).

**Steps to Reproduce:**
1. Create Business A with an appointment (e.g. `POST /api/appointments`) and note its `_id`.
2. Log in as an unrelated Business B user.
3. As Business B, call `PATCH /api/worker/jobs/<BUSINESS_A_APPOINTMENT_ID>/status` with `{"status":"en_route"}`.
4. Observe the response, then re-fetch the appointment as Business A via `GET /api/appointments/<id>` to confirm persistence.
5. As Business B, call `POST /api/worker/jobs/<BUSINESS_A_APPOINTMENT_ID>/complete`.

**Expected Behavior:**
Business B should receive a 404 (or 403), identical to every other resource type in the system (customers, leads, appointments via their standard routes all correctly return "not found" for cross-tenant access).

**Actual Behavior:**
Business B's request succeeds with `200 OK` in every case. Step 3 changed Business A's real appointment status and persisted the change (confirmed via Business A's own session afterward). Step 5 went further: it changed the appointment to `completed`, returned Business A's customer PII (full name, phone, email) in the response payload to Business B, and **created a real invoice record** (`INV-1001`, $204.59, with a live customer-portal share token) under Business A's business — entirely from Business B's unauthorized session.

**Reproduction Rate:**
2/2 (both `status` and `complete` sub-routes tested; `execution` shares the identical code path and is inferred affected by code inspection)

**Conditions:**

| Condition | Result |
|---|---|
| Same-tenant worker status update | Works correctly |
| Cross-tenant worker status update (different business) | **Bug — succeeds, should be blocked** |
| Cross-tenant worker "complete & generate invoice" | **Bug — succeeds, creates real invoice under victim's business, leaks victim customer PII** |
| Equivalent cross-tenant attempt via standard `/api/appointments/:id` routes | Correctly blocked (404) |
| Equivalent cross-tenant attempt via `/api/customers/:id`, `/api/leads/:id` | Correctly blocked (404) |

**Evidence:**
- `PATCH /api/worker/jobs/6ab2152bc03428846df8e9ee/status` from Business B session → `200 OK`, appointment status changed from `scheduled` to `en_route`.
- Re-fetched via Business A's own session (`GET /api/appointments/6ab2152bc03428846df8e9ee`) → confirmed `status: "en_route"` persisted.
- `POST /api/worker/jobs/6ab2152bc03428846df8e9ee/complete` from Business B session → `200 OK`, response included Business A customer `Jane Doe` (phone `5125551111`, email `jane.doe@example.com`) and created invoice `_id: 6ab215ecc03428846df8ea23`, `invoiceNumber: "INV-1001"`, `totalAmount: 204.59`, live `shareToken`.
- Confirmed the created invoice remains live and fetchable (`GET /api/invoices/6ab215ecc03428846df8ea23`), unpaid, with a working customer-portal payment link.

**Affected Components:**
- `backend/src/controllers/worker.controller.ts` — `updateJobStatus`, `updateJobExecution`, `completeJobAndGenerateInvoice` never call the controller's own `getBusinessId(req)` helper (which every other method in the same file does), so no tenant boundary is derived from the request at all.
- `backend/src/services/worker.service.ts` — `updateJobStatus`, `updateJobExecution`, `completeJobAndGenerateInvoice` all use `Appointment.findById(appointmentId)`, a bare lookup by ID with no `businessId` filter, unlike every other service in the codebase (`customer.service.ts`, `appointment.service.ts`, `lead.service.ts`, `estimate.service.ts`, `invoice.service.ts` all consistently use `findOne({ _id, businessId })`).
- Frontend: `frontend/app/worker/page.tsx` (the Worker PWA UI) has no auth guard at all — it renders fully for a completely anonymous visitor and never redirects to `/login`, so there is also no client-side signal that this surface requires authentication. This doesn't leak data by itself (the page loads to an empty "no technician selected" state), but it means any authenticated user of *any* business could point their own logged-in session at this page (or call the API directly, as demonstrated) and act on another business's jobs.

**Potential Impact:**
A user of any one business could read another business's customer PII, tamper with another business's appointment/job status, and generate billing documents (invoices with live payment links) against another business without authorization. This is a full confidentiality and integrity breach of the core multi-tenant guarantee the rest of the application otherwise enforces correctly, and it directly creates fraudulent-looking billing records.

**Suggested Investigation Area:**
`worker.service.ts` and `worker.controller.ts` — every method needs to derive `businessId` from the authenticated request (as `WorkerController.getBusinessId` already does for `getTechnicians`/`getTodayJobs`) and scope every `Appointment` lookup by `{ _id, businessId }`.

---

## BUG-002 — Appointment double-booking guard has a race condition (TOCTOU); double-booking occurs reliably under concurrency

**Severity:** HIGH

**Status:** CONFIRMED

**Feature:**
Appointment scheduling (`POST /api/appointments`)

**Environment:**
Local development, MongoDB-backed

**Preconditions:**
An authenticated business with at least one customer and two or more services.

**Steps to Reproduce:**
1. Pick an open time slot.
2. Fire two `POST /api/appointments` requests **concurrently** (genuinely parallel, not sequential) for the same `startAt`, different `serviceId`, same customer. (Used Node.js `Promise.all(fetch(...), fetch(...))` to guarantee real concurrency — sequential requests do not reproduce this.)
3. Repeat for several different time slots.
4. Inspect `GET /api/appointments/calendar` afterward for the affected date range.

**Expected Behavior:**
Exactly one of the two concurrent requests should succeed (`201`); the other should be rejected with `409 Conflict`, matching the behavior already correctly observed for sequential (non-concurrent) double-booking attempts.

**Actual Behavior:**
In 4 out of 5 concurrent test rounds, **both** requests succeeded with `201 Created`, producing two separate appointment documents at the identical `startAt`/`endAt` for the same customer/business. The single-request case (verified separately, non-concurrently) works correctly and returns `409`.

**Reproduction Rate:**
4/5 rounds under genuine concurrency (highly reliable, not a rare fluke)

**Conditions:**

| Condition | Result |
|---|---|
| Single sequential double-booking attempt | Correctly blocked, 409 |
| Two genuinely concurrent requests, same slot | **Bug — both succeed, 4/5 rounds** |
| Two genuinely concurrent requests, same slot (1/5 rounds) | Both correctly blocked, 409/409 (race can also resolve safely by chance) |

**Evidence:**
Confirmed via `GET /api/appointments/calendar?from=2026-10-08&to=2026-10-09` after the concurrent test: two distinct appointment documents (`_id: 6ab217ac2fa1b651ba46310f` and `_id: 6ab217ac2fa1b651ba463111`) both exist with identical `startAt: "2026-10-08T10:00:00.000Z"`, `endAt: "2026-10-08T11:00:00.000Z"`, same customer, both `status: "scheduled"`. The same duplication pattern repeated at the `11:00`, `12:00`, and `13:00` slots tested in subsequent rounds.

**Affected Components:**
- `backend/src/services/availability.service.ts` — `checkSlotConflict()` performs a standalone `Appointment.findOne(filter)` read.
- `backend/src/services/appointment.service.ts` — `createAppointment()` performs the conflict check and the `Appointment.create()` write as two separate, non-atomic operations with no transaction and no covering unique index, so two concurrent requests can both pass the "no conflict" check before either write commits.
- Related, same root-cause pattern (not separately reproduced but sharing the identical check-then-act shape): `invoice.service.ts createInvoice()` and `estimate.service.ts createEstimate()`/`convertToInvoice()` compute the next sequential `INV-####`/`EST-####` number via `Model.countDocuments()` followed by a separate `Model.create()`, which is vulnerable to the same kind of race producing duplicate invoice/estimate numbers under concurrent creation.

**Potential Impact:**
A contractor's calendar can end up with two technicians (or the same technician) double-booked for the same time slot with no warning, most likely to occur exactly when it matters most — multiple staff or automated flows (e.g. the AI phone receptionist booking a slot at the same moment a human staff member books it via the dashboard) racing to grab the same appointment slot. This also matches and explains the documented product gap "no double-booking conflict warning in the UI" — the underlying issue is not just a missing UI warning, it's that the API-level guard itself is not safe under concurrency.

**Suggested Investigation Area:**
Wrap the conflict-check + create in a MongoDB transaction, or add a partial/compound unique index that the database itself enforces atomically, rather than relying on an application-level read-then-write check.

---

## BUG-003 — Converting an estimate to an invoice is not idempotent; repeated conversion creates duplicate invoices

**Severity:** MEDIUM

**Status:** CONFIRMED

**Feature:**
Estimates → Invoice conversion (`POST /api/estimates/:id/convert`)

**Environment:**
Local development, MongoDB-backed

**Preconditions:**
An approved (or even just existing) estimate belonging to the authenticated business.

**Steps to Reproduce:**
1. Create an estimate, e.g. `EST-1001`.
2. Call `POST /api/estimates/<id>/convert`. Note the returned `invoice._id` and `invoiceNumber`.
3. Call `POST /api/estimates/<id>/convert` again on the **same** estimate.

**Expected Behavior:**
The second call should either return the existing invoice unchanged (matching the idempotent pattern already used by `approveEstimate`, which correctly no-ops if the estimate is already `approved`/`converted`) or reject the request with a clear "already converted" error.

**Actual Behavior:**
The second call creates a **second, entirely new invoice** for the same estimate, and silently overwrites `estimate.convertedInvoiceId` to point only at the newest invoice — orphaning the first invoice, which remains live, unpaid, and fully payable via its own portal share link.

**Reproduction Rate:**
2/2 (reproduced twice: once as a direct repeat, confirmed the orphaned invoice remains fetchable)

**Conditions:**

| Condition | Result |
|---|---|
| Convert an estimate once | Works correctly, invoice created |
| Approve an already-approved estimate again (different signer name/signature) | Correctly idempotent — early-return preserves original signature, no bug |
| Convert an already-converted estimate again | **Bug — creates a second duplicate invoice** |

**Evidence:**
Converting estimate `EST-1001` (`_id: 6ab21985d6a9178941d79b6b`) twice produced:
- First call: invoice `INV-1002` (`_id: 6ab21a07d6a9178941d79b76`), `totalAmount: 4200.10`, `status: "unpaid"`.
- Second call: invoice `INV-1003` (`_id: 6ab21a1cd6a9178941d79b7e`), same `totalAmount: 4200.10`, same `status: "unpaid"`.
- `estimate.convertedInvoiceId` after the second call pointed only at `INV-1003`.
- `GET /api/invoices/6ab21a07d6a9178941d79b76` (the orphaned `INV-1002`) still returns a full, live, unpaid invoice with an active portal share token.

**Affected Components:**
`backend/src/services/estimate.service.ts` — `convertToInvoice()` has no guard checking `estimate.status === 'converted'` before unconditionally calling `Invoice.create()`, unlike `approveEstimate()` in the same file, which correctly has this guard.

**Potential Impact:**
A contractor accidentally double-clicking "Convert to Invoice" (or retrying after a slow/ambiguous network response, a common real-world pattern) would generate two real invoices for the same job, both independently payable, risking double-billing a customer and requiring manual cleanup.

**Suggested Investigation Area:**
Add the same early-return guard used in `approveEstimate()` (`if (estimate.status === 'converted') return { estimate, invoice: existing }`) to `convertToInvoice()`.

---

## BUG-004 — Error handler misclassifies client-side validation failures as HTTP 500, leaking internal error details

**Severity:** HIGH

**Status:** CONFIRMED

**Feature:**
Cross-cutting — affects most CRUD write routes (Business profile, Customers, Leads, Worker job execution/status)

**Environment:**
Local development (non-production `NODE_ENV`, so the error handler's production message-masking does not apply — see Suggested Investigation Area for the production-specific risk)

**Preconditions:**
None — reproducible with any authenticated session against an unvalidated write route.

**Steps to Reproduce (representative sample; many variants reproduce the same class of bug):**
1. `PATCH /api/business/me` with `{"phone": 5125551234}` (number instead of string).
2. `POST /api/customers` with `{"firstName": "A".repeat(200), "lastName": "Doe", "phone": "5125551111"}` (exceeds the 60-character schema limit).
3. `POST /api/customers` with `{"firstName": "Jane", "lastName": "Doe", "phone": "5125551111", "email": "not-an-email"}`.
4. `POST /api/leads` with `{"customerId": "not-a-valid-object-id", "title": "Test"}`.
5. `POST /api/leads` with a `customerId` belonging to a different tenant.
6. `PATCH /api/worker/jobs/:id/status` with `{"status": "not_a_real_status"}`.

**Expected Behavior:**
Each of these is a client-side mistake (bad input type, oversized field, invalid format, malformed/nonexistent/foreign ID) and should return a `400 Bad Request` or `404 Not Found` with a clean, generic client-facing message — matching how the same kinds of errors are already handled correctly on routes that use the `ZodError` path (e.g. `/api/auth/signup`).

**Actual Behavior:**
Every one of the above returns `500 Internal Server Error`, and the response body includes the raw internal exception message, e.g.:
- `"data.phone.trim is not a function"`
- `"Customer validation failed: firstName: First name cannot exceed 60 characters"`
- `"Customer validation failed: email: Please enter a valid email address"`
- `"Invalid customer ID format"`
- `"Customer does not exist or does not belong to your business"`
- `"Appointment validation failed: status: \`not_a_real_status\` is not a valid enum value for path \`status\`."`

**Reproduction Rate:**
6/6 tested variants, across 3 different route families (business, customers, leads) plus worker execution/status routes — fully systemic, not isolated to one endpoint.

**Conditions:**

| Condition | Result |
|---|---|
| Validation failure on a Zod-validated route (`/api/auth/signup`) | Correctly returns 400 with field-level messages |
| Validation failure on a non-Zod route relying on Mongoose schema validation | **Bug — returns 500** |
| Validation failure on a non-Zod route relying on a manual `throw new Error(...)` (not `AppError`) | **Bug — returns 500** |
| Cross-tenant reference rejected by a manual service-layer check | **Bug — correctly blocked, but reported as 500 instead of 404** |

**Evidence:**
Confirmed via direct HTTP responses (status + body) for all 6 reproduction steps above, and by reading `backend/src/middleware/errorHandler.ts`, which explicitly special-cases only `ZodError` (→400) and Mongo duplicate-key `code 11000` (→409); every other thrown error — including Mongoose's own `ValidationError`/`CastError` and any plain `throw new Error(...)` not constructed as an `AppError` with a `.statusCode` — falls through to the generic `statusCode = (err as AppError).statusCode || 500` branch.

**Affected Components:**
- `backend/src/middleware/errorHandler.ts` (root cause)
- `backend/src/routes/business.routes.ts`, `customer.routes.ts`, `lead.routes.ts`, `worker.routes.ts` (no `validateBody` middleware, so these routes depend entirely on the mis-handled error paths)
- `backend/src/services/business.service.ts`, `customer.service.ts`, `lead.service.ts`, `worker.service.ts` (source of the un-typed thrown errors)

**Potential Impact:**
Client applications (including the shipped frontend) cannot reliably distinguish "you made a mistake" from "the server is broken," which breaks normal error-handling UX (retry logic, form-field error highlighting, etc. all key off status code). It also leaks internal implementation details (exact field-validation messages, Mongoose internals) to any authenticated caller. Per the error handler's own code, this leak is bounded to non-`500`-safe messages by `config.isProduction` for status `500` specifically — meaning **if this server runs in production with `NODE_ENV` unset or not exactly `"production"`**, the same internal messages would leak in a live environment too; this is worth confirming as a deployment-configuration check, not just a code fix.

**Suggested Investigation Area:**
Add explicit handling in `errorHandler.ts` for Mongoose's `ValidationError` and `CastError` (→400), and audit service-layer `throw new Error(...)` call sites to use `AppError` with an explicit status code instead.

---

## BUG-005 — Logging out does not invalidate the session token; a captured token remains valid until natural expiry

**Severity:** MEDIUM

**Status:** CONFIRMED

**Feature:**
Authentication / session lifecycle (`POST /api/auth/logout`)

**Environment:**
Local development

**Preconditions:**
A valid authenticated session (cookie or bearer token).

**Steps to Reproduce:**
1. Log in and capture the `auth_token` cookie value.
2. Call `POST /api/auth/logout`.
3. Replay the **original, pre-logout** token value directly against `GET /api/auth/me` and `GET /api/auth/protected-test` (bypassing the browser, which would have had its cookie cleared).

**Expected Behavior:**
The replayed token should be rejected (`401`), since the user explicitly logged out.

**Actual Behavior:**
Both requests succeed with `200 OK` and return the full user object, exactly as if the user were still logged in.

**Reproduction Rate:**
2/2 (reproduced against two different protected routes)

**Conditions:**

| Condition | Result |
|---|---|
| Valid token, before logout | Works (expected) |
| Same token, replayed after logout, on `/api/auth/me` | **Bug — still authenticates** |
| Same token, replayed after logout, on `/api/auth/protected-test` | **Bug — still authenticates** |
| Garbage/tampered token (never valid) | Correctly rejected, 401 |
| No token at all | Correctly rejected, 401 |

**Evidence:**
- `POST /api/auth/logout` correctly clears the cookie client-side (`Set-Cookie: auth_token=; Expires=Thu, 01 Jan 1970...`).
- The same JWT value, replayed manually with `Cookie: auth_token=<original value>`, returned `200 OK` with the full user payload on both `/api/auth/me` and `/api/auth/protected-test` after logout.

**Affected Components:**
`backend/src/utils/token.ts` (`setAuthCookie`/`clearAuthCookie`), `backend/src/middleware/auth.middleware.ts` — the JWT is purely stateless with a 7-day expiry and no server-side revocation list/session store, so "logout" only ever clears the client's copy of the cookie; the token itself remains cryptographically valid until it naturally expires.

**Potential Impact:**
If a token is captured (XSS, a shared/public computer, a proxy log, etc.), logging out does **not** protect the account — the stolen token continues to work for up to 7 days regardless. This is a known, documented architectural gap (see `PROJECT_STATUS_AND_ROADMAP.md` §2.1 "No refresh tokens / token revocation") and this testing pass empirically confirms it holds exactly as described.

**Suggested Investigation Area:**
A token revocation/denylist (e.g. a short-lived server-side store of invalidated token IDs, or moving to shorter-lived access tokens plus revocable refresh tokens) would close this gap; this is explicitly flagged as a pre-launch priority in the project's own roadmap document.

---

## BUG-006 — Estimate expiration date is stored but never enforced

**Severity:** LOW

**Status:** CONFIRMED (via code inspection; not behaviorally reproduced within this session — see note)

**Feature:**
Customer-facing quote/estimate portal (`GET /api/portal/quotes/:token`, `POST /api/portal/quotes/:token/approve`)

**Environment:**
Local development

**Preconditions:**
An estimate created via `POST /api/estimates`.

**Steps to Reproduce (code-level):**
1. Create an estimate and observe it is stored with `expiresAt` set to 7 days from creation.
2. Read `EstimateService.getPublicEstimate()` and `EstimateService.approveEstimate()` in full.
3. Observe that neither function contains any comparison of `estimate.expiresAt` (or any date) against the current time.

**Expected Behavior:**
An estimate whose `expiresAt` has passed should not be viewable/approvable by the customer, matching the "Estimate valid for 30 days" language shown in the estimate's own `terms` text.

**Actual Behavior:**
The estimate can be viewed and e-signed/approved by the customer at any time, indefinitely, regardless of `expiresAt`. This was confirmed by reading both functions in full: there is no `Date` comparison against `expiresAt` anywhere in the estimate-viewing or estimate-approval code path.

**Reproduction Rate:**
N/A — this is a confirmed absence of a check via direct code reading, not a behaviorally-timed reproduction. Demonstrating it live would require either waiting the full 7-day expiry window or directly editing the database record's `expiresAt`/`createdAt` field, both of which were out of scope for a read-only, same-session QA pass. The finding is nonetheless CONFIRMED (not UNCONFIRMED) because the absence of any date check is unambiguous in the source.

**Conditions:**

| Condition | Result |
|---|---|
| View/approve estimate within its validity window | Works correctly (tested live) |
| View/approve estimate after `expiresAt` has passed | Not behaviorally tested; code contains no enforcement, so this is expected to also "work" (incorrectly) |

**Evidence:**
`backend/src/services/estimate.service.ts`, `getPublicEstimate()` (reads the estimate by `shareToken`, updates `status` to `viewed`, returns it — no date check) and `approveEstimate()` (validates signer name/signature format, checks `status`, sets `approved` — no date check).

**Affected Components:**
`backend/src/services/estimate.service.ts` — `getPublicEstimate()`, `approveEstimate()`.

**Potential Impact:**
A customer could approve/e-sign a stale quote well after its stated 30-day validity window, locking in outdated pricing (e.g. before a price increase) with no warning to the contractor. Low severity since it requires the customer to still have/use an old link, but it directly contradicts customer-facing terms text.

**Suggested Investigation Area:**
Add an `if (new Date() > estimate.expiresAt) throw new AppError('This quote has expired', 410)` (or similar) check to both `getPublicEstimate()` and `approveEstimate()`.

---

## BUG-007 — New business's default service catalog ignores the selected business type

**Severity:** LOW

**Status:** CONFIRMED

**Feature:**
Business onboarding / profile creation (`POST /api/business`)

**Environment:**
Local development

**Preconditions:**
None — reproducible on any fresh signup.

**Steps to Reproduce:**
1. Sign up and create a business with `businessType: "Plumbing"`.
2. Fetch the seeded default services via `GET /api/services`.
3. Repeat steps 1–2 with a second account using `businessType: "Electrical"`.

**Expected Behavior:**
A plumbing business should be seeded with plumbing-relevant default services; an electrical business with electrical-relevant defaults, etc.

**Actual Behavior:**
Both businesses — one explicitly "Plumbing," one explicitly "Electrical" — were seeded with the **identical** default service catalog: AC Repair, AC Installation, AC Maintenance & Tune-up, Heating Repair, Heating Installation, Ductwork & Airflow, Indoor Air Quality, Emergency HVAC Service. This is an HVAC-specific catalog applied regardless of the declared `businessType`.

**Reproduction Rate:**
2/2 (reproduced identically on two independently created businesses with different declared types)

**Conditions:**

| Condition | Result |
|---|---|
| businessType = "Plumbing" | Gets HVAC service catalog (bug) |
| businessType = "Electrical" | Gets identical HVAC service catalog (bug) |

**Evidence:**
`GET /api/services` for both the "QA Alpha Plumbing Co" and "QA Beta Electric Co" test businesses returned byte-for-byte identical service name/description/category lists (only IDs and `businessId` differed).

**Affected Components:**
`backend/src/services/business.service.ts` — the default-services seeding logic used by `saveBusinessProfile()`.

**Potential Impact:**
A new plumbing or electrical contractor signing up would see a dashboard full of irrelevant HVAC services on day one (e.g. "AC Repair," "Ductwork & Airflow") and would have to manually delete/replace all of them before the product reflects their actual trade — a poor first-run experience directly at onboarding, the most trust-sensitive moment of the product.

**Suggested Investigation Area:**
The default-services seed should branch on `data.businessType` (or the equivalent onboarding field) rather than using one hardcoded HVAC-specific array for every new business.

---

# Condition Matrix (Cross-Cutting Summary)

| Condition | Result |
|---|---|
| Cross-tenant access via standard CRUD routes (customers, leads, appointments, estimates, invoices) | Correctly blocked (404) |
| Cross-tenant access via Worker job routes | **BUG-001 — succeeds** |
| Sequential double-booking attempt | Correctly blocked (409) |
| Concurrent double-booking attempt | **BUG-002 — succeeds in 4/5 rounds** |
| Single estimate-to-invoice conversion | Works correctly |
| Repeated estimate-to-invoice conversion | **BUG-003 — duplicate invoice created** |
| Zod-validated route with bad input | Correctly returns 400 |
| Non-Zod route with bad input (type confusion, oversized, malformed ID) | **BUG-004 — returns 500, leaks internals** |
| Token replay before logout | Works (expected) |
| Token replay after logout | **BUG-005 — still authenticates** |
| View/approve estimate within validity window | Works correctly |
| View/approve estimate past validity window | **BUG-006 — not enforced (code-confirmed)** |
| Business signup with businessType "Plumbing"/"Electrical" | **BUG-007 — gets generic HVAC service defaults** |
| Webhook request with missing/forged Twilio signature | Correctly rejected (403), fails closed |
| Webhook request with forged Stripe signature (Stripe unconfigured) | Correctly rejected (503), fails closed |
| Portal token: malformed / wrong-prefix / raw ObjectId / XSS payload / nonexistent | Correctly rejected (404), no enumeration signal |
| `businessId`/`role` injected via request body on signup/customer-create | Correctly ignored — server always derives from JWT |

---

# Notes on False-Positive Avoidance

Two suspected issues raised during initial static review were investigated further and found **not** to be bugs:
1. **Suspected unguarded duplicate `/customers` and `/leads` pages** — these are simple server-side redirect stubs to `/app/customers`/`/app/leads` (Next.js `redirect()`, HTTP 307), not unauthenticated data-bearing pages.
2. **Garbled Unicode/emoji characters in test output** — this was a PowerShell console/`Invoke-RestMethod` encoding artifact in the testing tooling, not a backend defect. Re-tested with `curl.exe` sending genuine UTF-8 bytes, and the name `"QA 测试 🚀 Öwner"` round-tripped through signup and storage perfectly intact.

Both are documented here for transparency but are excluded from the confirmed bug count above.
