# BlueCollar AI — Final Feature Status

> **Verified:** 22 September 2026, by reading `backend/src` and `frontend/app` directly and by running the built server against a live database. Plan documents were not trusted on their own.
>
> Reference vision: `targetFeaturesIdea.md` (86 numbered features, sections A–J).
> This file supersedes the status sections of `PROJECT_STATUS_AND_ROADMAP.md`, which was written before the Week 1–4 hardening, Tier 1/Tier 2 work and QA bug fixes landed.

---

## 1. Headline numbers

| Measure | Value |
|---|---|
| Features **fully built and verified** | **26 of 86** (~30%) |
| Features **partially built** (usable but incomplete) | **13 of 86** (~15%) |
| Features **not started** | **47 of 86** (~55%) |
| Weighted completion against the full vision | **~35%** |
| Completion against a **launchable MVP** (§7 of the vision doc) | **~85%** |

Two different questions, two different answers:

- **"Is the 86-feature enterprise platform done?"** No — roughly a third.
- **"Is there a product a contractor could pay for?"** Nearly. The MVP slice is almost complete; what blocks it is verification and two auth gaps, not missing features.

The previous estimate in `PROJECT_STATUS_AND_ROADMAP.md` was 18–20%. The rise to ~35% is mostly hardening and correctness work rather than new surface area: the voice pipeline became real, the security holes closed, and a large amount of fabricated data was removed.

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
| 59 | Role-based access control | 🟡 Partial | `requireRole` middleware exists and gates platform-operator endpoints. **No staff accounts** — see §4. |
| 61 | Dashboard analytics | ✅ Built | Real KPIs, nullable when there is no data. All fabricated fallbacks removed. |
| 66 | Integration health | ✅ Built | `/api/health/ready` reports database, telephony, billing, voice engine and scheduler state. ✓runtime |

### Platform work not numbered in the vision doc

| Item | Status |
|---|---|
| Per-call provider cost + margin vs plan revenue | ✅ Built |
| Distributed lock (booking races, multi-replica cron) | ✅ Built ✓runtime |
| Refresh tokens, rotation, reuse detection, revocation | ✅ Built ✓runtime |
| Email verification flow | ✅ Built (send path unexercised) |
| Data retention sweep + per-customer data erasure | ✅ Built |
| AI/recording disclosure spoken before the assistant answers | ✅ Built |
| Docker, compose, CI (typecheck/build/secrets/image) | ✅ Built |
| Atomic invoice/estimate numbering | ✅ Built ✓runtime |

---

## 3. What to build next — ordered

### Tier A — blocks launch. Nothing else matters until these are done.

| # | Item | Why it blocks | Effort |
|---|---|---|---|
| A1 | **Run the voice pipeline on a real call** | The entire product rests on it and it has never handled one call. Needs Deepgram + OpenAI + Twilio keys and a public HTTPS tunnel. | Hours, once keys exist |
| A2 | **Password reset flow** | There is no recovery path. A user who forgets their password is permanently locked out. `EmailService` already exists, so this is the send + token + page. | ~½ day |
| A3 | **Commit the work** | 214 files are uncommitted against the initial commit. One bad `git checkout` loses everything. | Minutes |
| A4 | **Rotate the leaked credential** | `backend/cookies.txt` is still in git history at commit `6465794`. | Minutes |
| A5 | **Tests for the money and tenancy paths** | Stripe webhook signature, Twilio webhook signature, portal share-token auth, worker tenant scoping. The QA report found a critical cross-tenant hole precisely because nothing guarded these. | 2–3 days |

### Tier B — high value, moderate effort. Build after launch is safe.

| # | Item | Why | Effort |
|---|---|---|---|
| B1 | **Real AI post-call summary and coaching** | Today's "AI Summary" is an if/else on outcome producing canned sentences. One extra structured OpenAI call on the existing transcript makes it real. Highest demo impact per hour spent. | 1 day |
| B2 | **Staff accounts + real RBAC** | Right now a contractor's dispatcher and technicians must share the owner login, which also means they can see billing. Needs `User.businessId`, invites, a user-management screen. | 3–4 days |
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
| **Technician logins** | Technicians are records, not users. The worker PWA runs on the owner's session. |
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
| Stripe webhook signature | Live forged webhook, rejected |
| Rate limiting | Live burst, 429 at the expected attempt |
| **Voice pipeline end to end** | ❌ Never — no provider keys |
| **Email delivery** | ❌ Never — no `EMAIL_API_KEY` |
| **Live card payment** | ❌ Never — Stripe in simulation mode |
| **Frontend in a browser** | ❌ Compile and build verified only; not clicked through |
| **Automated tests** | ❌ None exist |

---

## 6. Honest summary

The foundation is genuinely good now. The security holes that mattered are closed, the fabricated data that made the product look further along than it was has been removed, and the parts that exist mostly do what they claim.

The gap between ~35% of the vision and a shippable product is smaller than it looks, because the remaining 65% is largely enterprise scale-out that a first customer does not need. What actually stands between this and revenue is short: prove the voice pipeline on a real call, add password reset, cover the money paths with tests, and commit the work.

The honest risk is not missing features. It is that the single most important component — the AI answering a phone call — has never once done so.
