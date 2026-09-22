# BlueCollar AI — Final Feature Status

> **Verified:** 22 September 2026, by reading `backend/src` and `frontend/app` directly, by running the built server against a live database, and — as of the latest revision — by a 107-test automated suite.
>
> Reference vision: `targetFeaturesIdea.md` (86 numbered features, sections A–J).
> This file supersedes the status sections of `PROJECT_STATUS_AND_ROADMAP.md`, which was written before the Week 1–4 hardening, Tier 1/Tier 2 work and QA bug fixes landed.

---

## 1. Headline numbers

| Measure | Value |
|---|---|
| Features **fully built and verified** | **32 of 86** (~37%) |
| Features **partially built** (usable but incomplete) | **9 of 86** (~10%) |
| Features **not started** | **45 of 86** (~52%) |
| Weighted completion against the full vision | **~38%** |
| Completion against a **launchable MVP** (§7 of the vision doc) | **~90%** |

Two different questions, two different answers:

- **"Is the 86-feature enterprise platform done?"** No — a bit over a third.
- **"Is there a product a contractor could pay for?"** Nearly. What blocks it now is one thing: the voice pipeline has never handled a real call.

> **Counting note.** An earlier revision of this file claimed 26 built / 13 partial. That headline never matched its own tables — counting the numbered rows below gives 32 and 9. The tables were right; the summary was wrong. Numbers here are now derived from the tables rather than written alongside them.

The estimate in `PROJECT_STATUS_AND_ROADMAP.md` was 18–20%. The rise is mostly hardening and correctness rather than new surface area: the voice pipeline became real, the security holes closed, a large amount of fabricated data was removed, and the product gained the two things that stop it being single-user — staff accounts and a password recovery path.

---

## 2. What is built and verified

Each row was confirmed in code, and where marked ✓runtime, exercised against a running server.

### A. AI phone, chat and lead capture

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | 24/7 AI voice receptionist | ✅ Built | Deepgram Nova-2 STT + Aura TTS + OpenAI tool-calling over Twilio Media Streams, μ-law barge-in. **Never run against live provider keys** — see §5. |
| 2 | AI call booking | ✅ Built | `book_appointment` tool with availability check, policy limits and a per-business booking lock. ✓runtime |
| 3 | Missed-call auto text-back | ✅ Built | 3-step SMS drip on a real cron, TCPA quiet hours, STOP/START handling. |
| 6 | Human handoff | ✅ Built | `transfer_call` performs a real Twilio call update. Target is the business's own escalation number, never a model-supplied one. |
| 7 | Call transcription and summary | 🟡 Partial | Transcripts are real and stored. **No audio recording exists** — `CallLog.recordingUrl` is never populated. "Summary" is a rule-based template, not AI-generated (see §4). |

### B. Leads, CRM and customers

| # | Feature | Status | Notes |
|---|---|---|---|
| 8 | Lead pipeline | ✅ Built | Status machine with validated transitions. |
| 9 | Customer CRM profile | ✅ Built | Customer 360 view aggregating appointments, invoices, calls, memories. |
| 10 | Property notes | 🟡 Partial | Free-text notes and agent memories exist. No structured gate-code/pet/equipment fields, no per-field access control. |
| 12 | Lost-lead follow-up | ✅ Built | Drip campaign with backoff, attempt cap and honest failure recording. |
| 13 | Customer segmentation | 🟡 Partial | Tags exist and are editable. No saved segments or segment-driven campaigns. |

### C. Calendar, booking and dispatch

| # | Feature | Status | Notes |
|---|---|---|---|
| 14 | Unified calendar | 🟡 Partial | Day/week/month views and a calendar API. No drag-and-drop, no recurring appointments. |
| 16 | Service catalog | ✅ Built | Duration, price, category, skill, emergency flag. Starter catalogue now matches the trade. ✓runtime |
| 17 | Booking rules | ✅ Built | Hours, minimum notice, booking horizon, emergency keywords, service-zone check. |
| 18 | Dispatch assignment | 🟡 Partial | Zip-zone + skill matching and a dispatch SMS. **No route optimisation, no map UI.** |
| 20 | Live job board | ✅ Built | Full status lifecycle through the worker PWA. |

### D. Estimates, quotes and e-signatures

| # | Feature | Status | Notes |
|---|---|---|---|
| 21 | Digital estimates | ✅ Built | Line items, tax, diagnostic credit, validity window (now enforced). ✓runtime |
| 22 | Customer quote portal | ✅ Built | Share-token only; raw ObjectIds are rejected. ✓runtime |
| 23 | E-signature | ✅ Built | Canvas signature + signer name + timestamp + IP. |
| 24 | Quote-to-job conversion | ✅ Built | Now idempotent — a double click returns the same invoice. ✓runtime |

### E. Worker PWA and field operations

| # | Feature | Status | Notes |
|---|---|---|---|
| 26 | Worker mobile PWA | ✅ Built | Today's schedule, job detail, navigation link, call/message actions. |
| 27 | Job status updates | ✅ Built | Now tenant-scoped — this was the critical QA bug. ✓runtime |
| 28 | GPS check-in/out | ✅ Built | Real geolocation. Fabricated "downtown Dallas" fallback coordinates removed. |
| 30 | Job checklist | ✅ Built | Default checklist + completion capture. |
| 31 | Before/after photos | ✅ Built | Real camera capture in the PWA. |
| 32 | Parts and materials | ✅ Built | Flows into the generated invoice. |

### F. Communication and automation

| # | Feature | Status | Notes |
|---|---|---|---|
| 35 | Two-way SMS inbox | ✅ Built | Threads, send, inbound handling, failure reasons shown inline. |
| 38 | Automated notifications | 🟡 Partial | SMS covered (booking, reminder, review request, dispatch). **Email notifications not wired** beyond verification. |
| 39 | Reminder controls | 🟡 Partial | Quiet hours, opt-out and delayed review surveys work. No customer-facing confirm/reschedule reply handling. |
| 41 | Template management | 🟡 Partial | Templates exist in code with variables. No per-business template editor. |

### G. Pricing, invoicing and payments

| # | Feature | Status | Notes |
|---|---|---|---|
| 42 | Pricing engine | 🟡 Partial | Fixed price, hourly labour, parts, tax, diagnostic credit, emergency fee. No travel fee or discount rules. |
| 43 | Worker final pricing | ✅ Built | Technician enters hours/parts; invoice generated on completion (now idempotent). |
| 44 | Digital invoices | ✅ Built | Line items, tax, balance, partial payment, aging. Numbers now allocated atomically. ✓runtime |
| 45 | Stripe online checkout | ✅ Built | Real Checkout session from the portal. The previous fake card form was deleted. |
| 48 | Cash/check/manual payment | ✅ Built | Homeowner can declare intent; only the contractor can settle. |
| 49 | Customer link experience | ✅ Built | No customer account anywhere; 32-byte share tokens only. ✓runtime |

### H. Reviews and reputation

| # | Feature | Status | Notes |
|---|---|---|---|
| 50 | Post-job review request | ✅ Built | Delayed 120 minutes after completion, quiet-hours aware. |
| 53 | Private feedback and recovery | ✅ Built | 1–3★ shielded, owner alerted, 24h SLA sweep with breach escalation. |
| 54 | Policy-compliant review flow | ✅ Built | Only a real configured Google URL is ever sent; no fabricated place-id links. |

### I. Admin, analytics and integrations

| # | Feature | Status | Notes |
|---|---|---|---|
| 59 | Role-based access control | ✅ Built | Two independent role axes. `user.role` ('user' \| 'admin') gates platform-operator endpoints; `user.businessRole` ('owner' \| 'dispatcher' \| 'technician') gates tenant endpoints. Invite-by-email, team management screen, billing owner-only, technicians scoped to their own jobs. Role and membership are read from the database per request, so a demotion takes effect immediately rather than at token expiry. ✓tested |
| 61 | Dashboard analytics | ✅ Built | Real KPIs, nullable when there is no data. All fabricated fallbacks removed. |
| 66 | Integration health | ✅ Built | `/api/health/ready` reports database, telephony, billing, voice engine and scheduler state. ✓runtime |

### Platform work not numbered in the vision doc

| Item | Status |
|---|---|
| Per-call provider cost + margin vs plan revenue | ✅ Built |
| Distributed lock (booking races, multi-replica cron) | ✅ Built ✓runtime |
| Refresh tokens, rotation, reuse detection, revocation | ✅ Built ✓runtime |
| Email verification flow | ✅ Built (send path unexercised) |
| Password reset by email, single-use, revokes all sessions | ✅ Built ✓tested (send path unexercised) |
| Staff invitations — email link, single use, tenant-bound | ✅ Built ✓tested (send path unexercised) |
| Media-stream WebSocket authorization (single-use signed token) | ✅ Built ✓tested |
| Automated test suite — 107 tests over tenancy, money and auth | ✅ Built, wired into CI |
| Data retention sweep + per-customer data erasure | ✅ Built |
| AI/recording disclosure spoken before the assistant answers | ✅ Built |
| Docker, compose, CI (typecheck/build/secrets/image) | ✅ Built |
| Atomic invoice/estimate numbering | ✅ Built ✓runtime |

---

## 3. What to build next — ordered

### Tier A — blocks launch. Nothing else matters until these are done.

| # | Item | Status | Why it blocks | Effort |
|---|---|---|---|---|
| A1 | **Run the voice pipeline on a real call** | ⬜ Open | The entire product rests on it and it has never handled one call. Needs Deepgram + an LLM key + Twilio keys and a public HTTPS tunnel. | Hours, once keys exist |
| A2 | **Password reset flow** | ✅ Done | There was no recovery path at all — a forgotten password meant permanent lockout. | — |
| A3 | **Commit the work** | ✅ Done | Committed in four logical commits on `feat/staff-accounts-rbac-and-tests` and pushed. Verified no `.env`, key material or temp file entered any commit. | — |
| ~~A4~~ | ~~**Rotate the leaked credential**~~ | ❌ **Withdrawn — was never true** | See below. | — |
| A5 | **Tests for the money and tenancy paths** | ✅ Done | The QA pass found a critical cross-tenant hole precisely because nothing guarded these. 107 tests now cover worker tenant + per-technician scoping, portal share tokens, Stripe and Twilio webhook signatures, RBAC, password reset, invitations and the media-stream token. | — |

**On A5 — what the tests are actually worth.** Passing tests prove nothing on their own, so each guard was deliberately broken and the suite re-run to confirm it fails. Seven mutations were tried (dropping `businessId` from the appointment filter, honouring a caller-supplied `technicianId` on writes, removing the billing owner gate, disabling Twilio signature checks, re-allowing an ObjectId as a portal share token, making password reset reveal whether an email is registered, and skipping the stream token's signature comparison). Six were caught immediately. The seventh was not, which exposed a real coverage gap — a technician naming a colleague via query parameter on a *mutation* — and a test was added for it. All seven are now caught.

That exercise also caught something worth recording: the first draft of the portal tests used `/api/portal/estimates/:token`, but the route is `/api/portal/quotes/:token`. Every negative assertion passed, because a mistyped route returns 404 for everyone. A green suite is not evidence until you have seen it go red.

**On A4 — this item was wrong and is withdrawn.** Earlier revisions of this file, and several rounds of verbal advice, said a credential was leaked in `backend/cookies.txt` and had to be rotated, with git history rewritten. That was never checked against the file's contents. It has now been checked. The file has exactly one blob in the entire history:

```
blob c31d9899   131 bytes   non-comment lines: 0
```

The whole content is the three-line header libcurl writes when it creates a cookie jar:

```
# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
# This file was generated by libcurl! Edit at your own risk.
```

No cookie, no token, no session. **There is nothing to rotate and no reason to rewrite history.** The commit hash cited was also wrong: the file was added in `4056d2e`, not `6465794`.

Committing a cookie jar is still poor hygiene, and the CI check that fails on tracked credential files is worth keeping — it is cheap and it guards the case where such a file *does* hold a session. But it was not an incident, and treating it as one for several rounds was a mistake of the same kind this document exists to prevent: a claim about the system asserted from a filename rather than from reading it.

### Tier B — high value, moderate effort. Build after launch is safe.

| # | Item | Why | Effort |
|---|---|---|---|
| B1 | **Real AI post-call summary and coaching** | Today's "AI Summary" is an if/else on outcome producing canned sentences. One extra structured OpenAI call on the existing transcript makes it real. Highest demo impact per hour spent. | 1 day |
| ~~B2~~ | ~~**Staff accounts + real RBAC**~~ | ✅ **Done.** See feature 59. Dispatchers and technicians have their own logins, billing is owner-only, and a technician sees only their own jobs. | — |
| B3 | **Auto follow-up on unsold estimates** | The drip infrastructure already exists; point it at estimates with no response after 7 days. | ½ day |
| B4 | **Equipment and unit registry** | Brand, model, install year, filter size per customer property. Foundational — pre-job briefs and upsell suggestions both depend on it. | 1–2 days |
| B5 | **Stripe Connect / per-business payouts** | Contractors cannot actually collect their own customers' money into their own account yet. | 3–5 days |
| B6 | **Emergency triage confidence score** | Turn the keyword list into a context-aware `assess_urgency` tool. Reduces missed-emergency liability. | 1 day |
| B7 | **Email notifications** | Booking confirmations, invoices and receipts by email. `EmailService` exists; only templates and triggers are missing. | 1–2 days |
| B8 | **Double-booking warning in the UI** | The backend now refuses the conflict, but the calendar does not warn before submitting. | ½ day |

### Tier C — differentiation once the basics hold

| # | Item | Depends on |
|---|---|---|
| C1 | AI pre-job brief for the technician | B4 |
| C2 | Smart upsell suggestions during a call | B4 |
| C3 | Recurring maintenance plan automation | B4 |
| C4 | Weekly AI business insights email | B7 |
| C5 | Google Business Profile OAuth (real review fetch and reply) | — |
| C6 | Route optimisation + map view | — |
| C7 | Mileage and travel expense tracking | — |
| C8 | Voice sentiment / escalation risk score | B1 |
| C9 | Audit logging across pricing, payments, exports, impersonation | — |
| C10 | MFA | — |

### Tier D — deliberately deferred

Multi-location and branches · Super Admin platform console (vision items 68–86) · Google/Outlook calendar sync · QuickBooks · Zapier and outbound webhooks · WhatsApp · Workflow automation builder · Competitor benchmarking · Website review widget · Social/testimonial drafts · Outbound AI re-engagement calling · Photo-based AI diagnostics · Voice biometric caller recognition.

These are scale-out features. They matter when there are many paying customers, not before the first one.

---

## 4. Things that look built but are not

Worth knowing before a demo, because each one reads as finished in the UI.

| Thing | Reality |
|---|---|
| **"AI Summary & Coaching Notes"** on calls | `conversation-intelligence.service.ts` picks a canned sentence based on the call outcome. No model is involved. The sentiment score and flagging rules around it *are* real keyword/heuristic logic, but the prose is a template. |
| **Call "recordings"** | No audio is ever stored. The playback control on the calls page is the browser reading the transcript aloud. Labels were corrected, but there is no recording to produce if a customer or lawyer asks. |
| **Landing page voice demo** | A scripted transcript with a play button, labelled "Scripted example". It is honest now, but it is not the product. |
| **Multi-location and integrations settings** | Honest "not available yet" placeholders. No location model, no calendar OAuth. |
| **Technician logins** | ~~Technicians are records, not users.~~ **Fixed.** Technicians can now hold their own accounts, linked to a dispatch record, and the field app scopes to their own jobs. One gap remains: `frontend/app/worker/page.tsx` still has no client-side auth guard, so an unauthenticated visitor gets a page that renders and then fails its API calls. The data is safe — every `/api/worker/*` route is behind authentication — but the page should redirect rather than break. |
| **Voice at scale** | `VoiceStreamHandler` and `VoiceSessionService` hold sessions in in-process `Map`s, so voice works on exactly one instance. The cron scheduler is now multi-replica safe; voice is not. |

---

## 5. Verification state

| Path | Verified how |
|---|---|
| Auth, refresh, revocation, RBAC gates | Live HTTP probes |
| Tenant isolation (worker, portal, customer reads) | Live cross-tenant attack attempts |
| Booking concurrency | 5 parallel requests, 1 created, DB confirmed |
| Estimate expiry and conversion idempotency | Live, with a backdated expiry |
| Validation and error statuses | Live malformed payloads |
| Document numbering | Live sequential creates |
| Stripe webhook signature | Live forged webhook, rejected · **now also automated** |
| Rate limiting | Live burst, 429 at the expected attempt |
| Twilio webhook signature | Automated — unsigned, forged, wrong-token and altered-parameter requests all rejected |
| Worker per-technician scoping | Automated — including a technician naming a colleague explicitly |
| Portal share tokens | Automated — raw ObjectId, wrong document type and unknown token all refused |
| Tenant-level RBAC | Automated — dispatcher and technician refused billing, team management and profile edits |
| Password reset lifecycle | Automated — single use, expiry, email-change invalidation, session revocation, no enumeration |
| Staff invitations | Automated — single use, revocation, expiry, cross-tenant technician link refused, privilege escalation via request body refused |
| Media-stream token | Automated — tampered, re-signed, expired and replayed tokens all refused |
| **Automated tests** | ✅ 107 tests, 8 files, in CI. Mutation-checked: all 7 deliberate regressions caught |
| **Voice pipeline end to end** | ❌ Never — no provider keys |
| **Email delivery** | ❌ Never — no `EMAIL_API_KEY`. Reset and invite flows are tested with the sender stubbed, so the token lifecycle is proven and the Resend call is not |
| **Live card payment** | ❌ Never — Stripe in simulation mode |
| **Frontend in a browser** | ❌ Compile and build verified only; not clicked through |

---

## 6. Honest summary

The foundation is genuinely good now. The security holes that mattered are closed, the fabricated data that made the product look further along than it was has been removed, the parts that exist mostly do what they claim, and for the first time there is a test suite that would notice if that stopped being true.

The gap between ~38% of the vision and a shippable product is smaller than it looks, because the remaining 62% is largely enterprise scale-out that a first customer does not need.

What still stands between this and revenue is now a single item:

1. **Prove the voice pipeline on a real call.**

The work is committed and pushed. The credential item turned out not to exist. Provider keys are in place and verified — the Azure OpenAI deployment answers, Deepgram is configured, Twilio is configured, and `/api/health/ready` reports `voiceEngine.ready: true` with `llm.active: "azure"`. What remains is a live HTTPS tunnel and one phone call.

The honest risk has not changed, and no amount of the work above has reduced it: the single most important component — the AI answering a phone call — has never once done so. Everything around it is in good shape, which makes it easy to mistake for progress on the thing that matters. It is not. The next meaningful milestone is one phone call.
