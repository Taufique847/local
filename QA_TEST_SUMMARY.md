# QA Test Summary

**Project:** BlueCollar AI | **Date:** September 22, 2026 | **Tester:** Autonomous QA Agent

---

> ## ⚠️ Historical record — read this first
>
> **This is a point-in-time record of one testing session, left as it was written.** Its findings
> describe the build on 22 September 2026, not the build today. It is not edited to match the
> current code, because a QA report that gets quietly rewritten is worthless as a record of what
> was actually found.
>
> **All seven bugs in this report are fixed**, each with a regression test that was confirmed by
> deliberately re-breaking the fix:
>
> | # | Finding | Now |
> |---|---|---|
> | 001 | Worker endpoints bypassed tenant isolation (Critical) | Fixed. Every `/api/worker/*` lookup is scoped by `businessId`, and a technician is additionally scoped to their own `technicianId`. Covered by `tests/tenancy/worker-scoping.test.ts`. |
> | 002 | Double-booking race condition (High) | Fixed. The conflict check and the insert run under a per-business MongoDB-backed lock, so they can no longer be split. Covered by a 5-way parallel booking test. |
> | 003 | Validation failures returned 500 (High) | Fixed. Zod schemas on every mutating route; the previously unvalidated `PUT /api/appointments/:id` included. |
> | 004 | Estimate-to-invoice conversion not idempotent (Medium) | Fixed. A second conversion returns the invoice that already exists. |
> | 005 | Logout did not revoke the token (Medium) | Fixed. Short-lived access tokens carry a `tokenVersion` that `authMiddleware` checks per request, refresh tokens rotate with reuse-as-theft detection, and a detected reuse drops the whole session family. |
> | 006 | Estimate expiry stored but never enforced (Low) | Fixed. An expired quote is marked `expired` on read and can no longer be approved. |
> | 007 | Starter services ignored the declared trade (Low) | Fixed. `defaultServicesForTrade(businessType)`. |
>
> **Two claims in this report are no longer true of the code:**
>
> - *"the application has no enforced role hierarchy"* — it does now. Two independent axes:
>   `role` ('user' \| 'admin') gates platform-operator endpoints, `businessRole`
>   ('owner' \| 'dispatcher' \| 'technician') gates tenant endpoints. Both are read from the
>   database per request, so a demotion applies on the next call rather than at token expiry.
>   The "RBAC matrix would be vacuous" note under Untested Areas no longer applies.
> - *"~90 discrete adversarial test cases"* run by hand — there is now a **568-test automated
>   suite** (18 files) in CI covering tenancy, webhook signatures, RBAC, token lifecycles,
>   job-completion pricing, notifications, templates, equipment and property data, and segment
>   campaigns. 165 mutations have been attempted against its guards and 164 caught; the one`r`n>   survivor is a redundant tenant clause whose load-bearing twin was caught, verified`r`n>   behaviour-neutral and documented in place.
>
> **Two Untested Areas from this report are still untested, for the same reasons:** the live voice
> pipeline (no real call has ever been handled) and real Stripe payments (`STRIPE_SECRET_KEY`
> unset). A third has been added since: no email has ever been sent, because `EMAIL_API_KEY` is
> unset.
>
> For current status see `FINAL.md`. For what remains, `partial.md`.

---

## Coverage

**Features tested:**
- Authentication: signup, login, logout, session/token replay, protected-route access, rate limiting
- Authorization / multi-tenancy: cross-tenant isolation across customers, leads, appointments, estimates, invoices, and worker job endpoints
- Business onboarding and profile management
- Customer, lead, and service CRUD with input fuzzing (empty, null, wrong-type, oversized, whitespace-only, Unicode/emoji, NoSQL-operator-shaped payloads)
- Appointment scheduling: creation, double-booking prevention (sequential and concurrent), status transitions
- Estimate and invoice workflow: creation, e-signature/approval, conversion to invoice, repeated-conversion behavior
- Customer-facing portal: share-token validation, offline payment declaration, Stripe checkout fallback (simulation mode)
- Worker (field technician) job endpoints: status updates, execution/checklist updates, job completion + invoice generation
- Webhook signature enforcement: Twilio (voice/status) and Stripe (billing), including fail-closed behavior with unconfigured credentials
- Light frontend route checks (redirect behavior, auth-gating presence, page rendering) via raw HTTP

**Pages/routes tested:** `/api/auth/*`, `/api/business`, `/api/onboarding/*`, `/api/customers/*`, `/api/leads/*`, `/api/appointments/*`, `/api/estimates/*`, `/api/invoices/*`, `/api/portal/*`, `/api/worker/*`, `/api/webhooks/twilio/*`, `/api/billing/webhook`, plus frontend `/`, `/customers`, `/leads`, `/worker`, `/app/app/customers` (raw HTTP only).

**APIs tested:** ~35 distinct endpoint/method combinations across 9 route families, with both valid and adversarial payloads.

**User roles tested:** Single "user" role only — the application has no enforced role hierarchy (confirmed via code: a `role` field exists on the User model and is embedded in the JWT, but no middleware or controller checks it anywhere). Two independent tenants ("Business A" and "Business B," each with their own owner account) were used throughout to test cross-tenant isolation.

**Browser states tested:** None via real browser automation (unavailable in this environment). Frontend testing was limited to raw HTTP response inspection (status codes, redirect behavior, rendered HTML for unauthenticated requests).

**Edge cases tested:** Concurrent/racing requests (double-booking, using genuine parallel HTTP requests via Node.js), repeated/duplicate actions (re-approval, re-conversion, repeated payment-intent declaration), cross-tenant ID substitution, malformed/nonexistent/wrong-format resource IDs, injection-shaped payloads, oversized and wrong-typed fields, webhook forgery attempts, share-token enumeration attempts.

## Results

* **Total tests performed:** ~90 discrete adversarial test cases across 11 test areas
* **Confirmed bugs:** 7
* **Unconfirmed issues:** 0
* **Blocked tests:** See Untested Areas below

## Severity Breakdown

| Severity | Count |
| -------- | ----: |
| Critical |     1 |
| High     |     2 |
| Medium   |     2 |
| Low      |     2 |
| UI       |     0 |

## Key Findings at a Glance

1. **Worker job endpoints bypass multi-tenant isolation entirely** (Critical) — an authenticated user from any business can read, mutate, and generate real invoices against any other business's appointments via `/api/worker/jobs/*`. Every other resource type in the system correctly enforces tenant isolation; this is an isolated but severe gap.
2. **Appointment double-booking prevention has a race condition** (High) — reliably reproduced (4/5 rounds) using genuine concurrent requests; the check-then-act pattern in the availability service is not atomic.
3. **Error handling misclassifies validation failures as server errors** (High) — a systemic gap affecting every route that isn't backed by Zod validation (business, customers, leads, worker), returning 500 with leaked internal messages instead of 400/404.
4. **Estimate-to-invoice conversion is not idempotent** (Medium) — repeated conversion silently creates duplicate invoices.
5. **Logout does not revoke the session token** (Medium) — a captured token remains valid for its full 7-day life regardless of logout; this is a known, documented architectural gap, now empirically confirmed.
6. **Estimate expiration is stored but never enforced** (Low) — confirmed via code inspection.
7. **New business default services ignore the declared business type** (Low) — every business gets an HVAC-specific starter catalog regardless of trade.

## What Held Up Well (No Bugs Found)

- **Multi-tenant data scoping on all standard CRUD routes** — customers, leads, appointments, estimates, and invoices consistently and correctly scope every lookup to the authenticated user's own business; cross-tenant attempts uniformly return 404 with no data leakage. This makes BUG-001 (worker endpoints) more notable as an isolated regression rather than a systemic pattern.
- **Authentication enumeration resistance** — wrong password and nonexistent account both return an identical "Invalid email or password," and email matching is correctly case-insensitive for duplicate detection.
- **Request body injection resistance** — attempts to inject `role`, `isActive`, or `businessId` via request bodies on signup and customer creation were correctly stripped/ignored; the server always derives tenant and privilege context from the verified JWT, never from client input.
- **Webhook signature verification** — both Twilio and Stripe webhook handlers fail closed correctly: missing or forged signatures are rejected (403/503) even in the current unconfigured-credentials development setup, directly validating a fix the codebase's own comments describe as closing a prior real vulnerability.
- **Customer portal share-token security** — malformed, wrong-prefix, raw-ObjectId, and XSS-payload-shaped tokens all receive an identical generic 404, preventing enumeration; offline-payment declaration correctly never touches the actual balance, only flags contractor-side intent for manual confirmation.
- **Unicode/emoji handling** — verified full round-trip integrity for non-ASCII names through signup and storage once test tooling used clean UTF-8 encoding.

## Untested Areas

The following were identified as relevant but could not be fully tested in this session, with reasons:

- **Dispatch (service zones/technicians), knowledge-base, and phone-number controllers — cross-tenant isolation not individually live-tested.** After finding the worker-endpoint vulnerability (BUG-001), testing effort was concentrated on fully verifying and documenting that finding rather than continuing the cross-tenant sweep across every remaining controller. Given that BUG-001 shows tenant-scoping bugs *can* exist despite an otherwise-consistent pattern, these three controllers are a reasonable follow-up priority.
- **Deep browser-driven UI interaction testing** (double-click/rapid-click behavior, keyboard navigation, focus management, responsive/mobile breakpoints, multi-tab session behavior, browser back/forward state) — no browser automation tool was available in this environment. Testing was limited to raw HTTP inspection of server responses, which confirmed API-level correctness but cannot observe client-side rendering, JavaScript event handling, or visual layout.
- **Live voice call pipeline** (Twilio Media Streams + Deepgram STT/TTS + OpenAI tool-calling) — the environment runs with `VOICE_PROVIDER=mock` and no real provider credentials, so the actual bidirectional audio pipeline could not be exercised. This matches the project's own roadmap, which separately flags "real call test with live credentials" as not yet done.
- **Real Stripe payment flow** (actual card charges, real webhook events from Stripe) — `STRIPE_SECRET_KEY` is unset in this environment, so billing runs in simulation mode. The webhook signature *rejection* path was fully tested and confirmed fail-closed; the successful-payment path with real Stripe events was not exercised.
- **Estimate expiration enforcement (BUG-006) — confirmed via code only, not behaviorally.** Demonstrating the bug in action would require either waiting the full 7-day expiry window in real time or directly editing database records, both outside the scope of read-only, same-session adversarial testing.
- **RBAC / role-based permission matrix** — not applicable to test as a matrix, since the codebase does not enforce the `role` field anywhere; this is a documented architectural gap (no staff/owner distinction exists yet) rather than an inconsistently-enforced permission set, so a per-feature role matrix would be vacuous at this stage.

## Final Verification

```
SOURCE CODE CHANGED = NO
CONFIG CHANGED = NO
DATABASE SCHEMA CHANGED = NO
APPLICATION BEHAVIOR MODIFIED BY AGENT = NO
QA REPORT CREATED = YES
BUGS REPRODUCED = YES
```

No application source files, configuration files, or database schemas were modified during this testing session. Test data (two synthetic business accounts, associated customers/leads/appointments/estimates/invoices) was created in the local development database as a necessary side effect of live adversarial testing, consistent with the read-only-of-code, write-only-of-test-data constraint of this engagement. All temporary test scripts and payload files were created outside the project directory (`%TEMP%\qa_test`) and are not part of the repository.
