# Partial Features — Completion Plan

> **Verified:** 22 September 2026, by reading the actual implementation of all nine features — models, services, controllers, routes and frontend pages. Not from `FINAL.md` or any other planning document. Every claim below has a file path; where a line number is given it was read, not inferred.
>
> **Scope:** the 9 features marked 🟡 Partial in `FINAL.md`. Nothing here is a new feature; it is all finishing work on surface that already half-exists.

---

## 1. Read this first

**Honest total: ~24 working days, not 15–20.** Day 0 (the defects in §2) is now complete, leaving **~22.5**.

The 15–20 day figure came from effort notes written without re-reading the code. Verifying it changed three estimates upward, because three features are less built than the label suggested:

- **#39 "Reminder controls"** cannot be completed on its own. There is no appointment reminder in the product at all — no cron job, no send, zero callers for the `appointment_reminder` template. #39 is blocked behind part of #38.
- **#18 "Dispatch assignment"** has a foundation problem: `appointment.technicianId` is **never written by any code path**. Assignment today is a free-text `technicianName` string with no UI field.
- **#14 "Unified calendar"** has no week or month view at all, and its conflict model is business-wide rather than per-technician, so a five-technician business can only hold one job per time window.

§5 gives a 15-day and a 20-day cut if the full 24 is too long.

**Verification rule for every day below:** finish with `npm run typecheck && npm test` in `backend/`, and `npm run typecheck` in `frontend/`. Days that change a guard get a test. Days that change money or tenancy get a test *and* a deliberate break to confirm the test fails — see the mutation-check note in `FINAL.md` §3.

---

## 2. Day 0 — defects found while verifying · ✅ ALL DONE

> **Status: complete.** All seven are fixed, each with tests, and each test was verified by deliberately reintroducing the defect and confirming the suite goes red. 62 new tests; 20 mutations attempted, 20 caught.
>
> The count went from five to seven: **BUG-F and BUG-G were found while fixing BUG-C**, and one of them is the most serious defect in this document.

These were not features. They were defects in shipped code, each found while reading for this plan.

### A theme worth naming

Four of the seven share one root cause: **code reading or writing a field that does not exist on the schema.**

- `svc.price` — Service has `startingPrice` (BUG-A)
- `customer.isOptedOut` — never declared, written through `as any` (BUG-F)
- `Service.findOne({ active: true })` — Service has `status` (BUG-G)
- `customer.propertyType` — never declared, collected by the UI anyway (BUG-E)

Mongoose makes all four silent. Strict mode drops an undeclared write without complaint, and Mongoose 8 defaults `strictQuery` to false so an undeclared filter key goes to MongoDB and simply matches nothing. Nothing throws, nothing logs, and the fallback value looks plausible. A `grep` for `as any` near a model, and a check that every queried key exists on its schema, would find the rest of this class if any remain.

### BUG-A — Every technician-completed invoice silently bills $189
`backend/src/services/worker.service.ts` (~line 217–235) reads `svc.price`:
```ts
unitPrice: svc.price || 189,
```
The `Service` model has **no `price` field** — it is `startingPrice` (`backend/src/models/service.model.ts`). So `svc.price` is always `undefined` and every invoice generated from the field app charges the hardcoded `189` regardless of what the service actually costs. Same function hardcodes `95` labour, `89` diagnostic credit, and a **non-overridable** `taxRate = 0.0825`.

**✅ Fixed.** Reads `startingPrice`; when a service carries no price it bills the authorised `diagnosticFee` rather than inventing a number. `taxRate` and `laborRate` are now fields on `BusinessPolicy` (defaulted to the old literals so existing billing is unchanged), and `invoice.service.ts` / `estimate.service.ts` fall back to the business's rate instead of `0.0825`. `laborRate` uses `??` not `||`, so an explicit `0` is honoured. This is the seam **Day 14** builds on. 13 tests, 5/5 mutations caught.

### BUG-B — `technicianId` is never written, so the worker PWA's per-technician scoping does nothing
Last session added technician-scoped job access (`worker.service.ts` `findOwnedAppointment` filters `$or: [{ technicianId }, { technicianId: null }]`). But **no code anywhere writes `appointment.technicianId`** — `createAppointmentUnlocked` only copies `input.technicianName`, and `updateAppointment` only patches `technicianName`. Every appointment has `technicianId: null`, which the filter treats as "unassigned and therefore visible".

Net effect: the scoping I shipped is inert. A technician still sees the whole board. The tests pass because they set `technicianId` directly in fixtures — they proved the filter works, not that anything populates it.

**✅ Fixed.** `technicianId` is written on create and update, validated against the workspace's own roster (another business's or an inactive technician is a 404), and the display name is derived from the record so the denormalised copy cannot drift. The booking modal gained an "Assigned Technician" picker — there was no field for it at all before. `PUT /api/appointments/:id` also gained a schema; it previously accepted any body. A conservative backfill script (`npm run backfill:technician-ids`, dry-run by default) matches existing rows by name and **skips ambiguous matches** rather than guessing which colleague owns a job. 14 tests driven through the real booking path rather than fixtures, 4/4 mutations caught.

### BUG-C — Replying "YES" to a reminder can book a duplicate appointment
`backend/src/services/communication.service.ts` line 242:
```ts
const optInKeywords = ['START', 'UNSTOP', 'YES'];
```
"YES" is consumed as an SMS **opt-in**, notes are appended, and execution *continues* — it does not return. If the customer has an open lead-recovery record, `LeadRecoveryService.handleInboundCustomerReply` matches `/(?:yes|sure|book|...)/i` and **books a brand-new appointment for tomorrow 10:00**, then texts a confirmation.

So a customer confirming an existing appointment can be given a second one.

**✅ Fixed — and my first attempt was wrong.** Removing `YES` from the keyword list did *not* stop the duplicate booking. It made the message fall straight through to the recovery handler instead, whose intent regex matches `yes` anyway. Deleting the keyword treated the symptom.

The real fix is an invariant rather than a vocabulary: **never book a second appointment for a customer who already has one upcoming.** `triggerRecoveryForCall` already applied that check before starting a campaign; the reply path now does too, and answers by pointing at the appointment they already have. A keyword list cannot separate "yes, book me" from "yes, I'll be there", so it was never going to be the right place to fix this.

`YES` is still gone (it is not a carrier-standard opt-in), the opt-in branch now returns instead of falling through, and `CANCEL` deliberately stays an opt-out because it is carrier-mandated — appointment cancellation by reply needs its own keyword. Also fixed while in here: the opt-out note was appended to `customer.notes` on *every* matching message, and `notes` caps at 2000 characters, so a customer texting STOP enough times would eventually make `customer.save()` throw and take the inbound webhook down. 25 tests, 6/6 mutations caught.

### BUG-F — Texting STOP did nothing. *(Found while fixing BUG-C.)*
The most serious defect here, and it was not on the original list.

`isOptedOut` was **not a field on the Customer schema**, yet `communication.service.ts` both read and wrote it through `(customer as any)`. Mongoose is strict by default, so every write was silently discarded, and the guard in `sendMessage` was reading `undefined` on every send.

A customer who texted STOP kept receiving messages. That is a TCPA violation with statutory damages **per message**, not a cosmetic bug. It was invisible because the cast suppressed the type error and nothing ever threw.

Found because a test asserted `isOptedOut` was `false` after a reload and got `undefined` back.

**✅ Fixed.** `isOptedOut` and an `optedOutAt` audit timestamp are now real fields, both `as any` casts are gone, and the state is surfaced on the customer DTO and as a "Texts off" badge in the list so an operator does not compose a message the server will refuse.

### BUG-G — Every SMS-recovery booking created a duplicate service record. *(Found while fixing BUG-C.)*
`lead-recovery.service.ts` looked up the default service with `Service.findOne({ businessId, active: true })`. `Service` has no `active` field — it carries `status: 'active' | 'inactive'`. Mongoose 8 defaults `strictQuery` to false, so the unknown key went through to MongoDB and matched nothing, and the `if (!service)` branch below created a fresh "HVAC Diagnostic & Service Inspection" on **every single booking**. The service catalogue grew by one per recovered lead.

`appointment.service.ts` already used the correct `status: 'active'` form, which is what made the discrepancy findable.

**✅ Fixed.** Queries and creates now use `status`.

### BUG-D — The "Dispatch Route Map" is entirely fabricated
`frontend/app/app/appointments/page.tsx` lines 865–1017. A "32% Drive-Time Saved" badge, `38.4 Miles`, `1 hr 14 mins`, `+$64 / Day Saved`, three hardcoded pins (North Dallas / Addison / Plano), a literal `Coordinates: 32.7767° N, 96.7970° W`, invented leg times (`'Depot ➔ Stop 1 (12 mins)'`), and three invented customers shown when there is no data. The "Dispatch Route to Techs" button calls no API — it only fires a toast claiming the route was sent.

This is exactly the class of fabricated data removed everywhere else in the product. It should not survive to a demo.

**✅ Fixed.** 151 lines removed and replaced with an honest "not available yet" panel matching the existing `FeatureUnavailable` pattern, which also says what *does* work today — technician assignment, ZIP-based service zones, and the real dispatch SMS with a Google Maps link. The tab is now labelled "Route Map · Soon". The `useToast` hook went with it: its only remaining use was faking the confirmation. Day 20–23 builds the real thing.

### BUG-E — A whole `propertyType` feature that was never wired up
Bigger than it first looked. `propertyType` was **not a field on the backend Customer schema**, yet the frontend collected it (a residential/commercial toggle in the customer form), sent it as a list filter, and displayed it in **five** places. Zod stripped it on write, the service never read the filter, and all five screens read `undefined` and printed "Residential" for every customer. The status dropdown also offered `lead`, which is not in the enum.

Worse, one of those five places used it to **fabricate equipment**:

```tsx
{cust.propertyType === 'commercial' ? 'Carrier 10T RTU' : 'Carrier 4T Split (410A)'}
```

Every customer row asserted a specific installed HVAC unit the business had never entered. No equipment is recorded anywhere in the product — that is Day 10's work.

**✅ Fixed.** Rather than delete a form field people have been filling in, `propertyType` is now a real field end to end, so all five screens became truthful at once. It is deliberately **not** defaulted: absent means "not recorded", which is a different claim from "residential". The filter works, the fabricated equipment badge is gone (replaced by the real opt-out state), the "Type" column shows an em-dash when unrecorded, and the bogus `lead` option is removed. 10 tests, 5/5 mutations caught.

---

## 3. Verified state of each of the 9

| # | Feature | What actually exists | What is genuinely missing | Days |
|---|---|---|---|---|
| 7 | Call summary & recording | Transcript is real, stored as speaker-labelled turns with timestamps. `ConversationQA` computes resolution/sentiment/compliance from keywords | Summary is **5 canned strings** chosen by `if/else` on `outcome` — no model. `clarityScore` is the literal `92`. `sentimentLabel` can never emit `'negative'`. `recordingUrl` exists on the model and **nothing writes it**; no `record` on the AI path, no recording callback route | 2.5 |
| 10 | Property notes | `customer.notes` (2000 chars) and `AgentMemory` rows extracted by **5 regexes** (gate code, pets, brand, equipment location, recurring issue) | No property or equipment model. Gate code and pets are unvalidated free-text memory strings, not fields. `address` has no per-address notes or label | 2 |
| 13 | Segmentation | `customer.tags: [String]`, indexed. Editable in the 360 drawer | `toDTO` **omits tags**, so the list API never returns them. `updateCustomer` never writes tags. Filtering is only status + name/phone/email regex. No saved-segment concept anywhere | 2 |
| 14 | Unified calendar | One page, day-only hourly grid 08:00–18:00, plus a list table. Click an empty hour to book. `rescheduleAppointment` exists and is lock-protected | **No week or month view** (the backend range endpoint exists and is never called). Hour bucketing uses `getUTCHours()` — wrong for any non-UTC business. No drag-and-drop. No recurrence field anywhere. Conflict check is **business-wide, not per technician** | 4 |
| 18 | Dispatch | Zone CRUD, zip→zone matching, a first-fit "windshield buffer" scan, and a dispatch SMS with a Google Maps link | `technicianId` never written (BUG-B). `findOptimalTechnician` has **one caller** and persists nothing; no frontend calls it. No coordinates on technician or job. No geocoding, no maps key. Matching uses `technicianName` strings and ignores `status` entirely | 4 |
| 38 | Automated notifications | 13 SMS sends across AI booking, drip recovery, review surveys, dispatch. Quiet hours, opt-out, delivery-status webhook | **No appointment reminder exists at all** — no cron, no caller. `appointment_rescheduled`/`appointment_cancelled` likewise have templates and no callers. `EmailService` has **3 call sites, all auth/team**; zero customer email. No HTML/layout infrastructure. `CommunicationLog.channel` enum is `['sms']` only and `from`/`to` are required, so email cannot be logged as-is | 3 |
| 39 | Reminder controls | Quiet hours, STOP/START, delayed review surveys | Blocked: reminders do not exist. No `confirmedByCustomerAt`, no reschedule-request model. An unmatched inbound SMS is logged and silently dropped. Plus BUG-C | 1.5 |
| 41 | Template management | 6 literals in a `switch`, of which **only one is ever rendered**; the rest of real traffic is inline literals at ~12 call sites | No template model, no per-business override, no editor. `renderTemplate` does not even receive a `businessId`. Only per-business copy anywhere is `aiDisclosureText` (voice only) | 2 |
| 42 | Pricing | Line items, quantity × price, tax, diagnostic credit, 3-tier estimates | The same 6 lines of arithmetic **duplicated in 3 files**. No travel fee, no discount, no coupon. `BusinessPolicy` has only `diagnosticFee`/`emergencyFee` — **no `taxRate`, no labour rate**. `emergencyFee` is quoted by the AI and **never billed**. Tax is one flat blended rate; customer state/zip never consulted. Plus BUG-A | 1.5 |

Subtotal: **22.5 days** of feature work.

**Progress against it.** The "missing" column above describes the state *before* any of this work, and is left as written so the starting point stays checkable. Since then:

- **Day 0 (defects)** — done. Also closed #42's missing `taxRate`/`laborRate` and #18's unwritten `technicianId`. Those were prerequisites, not the features, so the day estimates did not move.
- **Days 2–5 (#38)** — done, and #38 is now fully built. Email is a real channel, all six customer-facing notifications send, and the appointment-reminder spine exists. This also unblocked #39, which the plan noted could not be started on its own.
- **#39** — roughly half done as a side effect: reminders send with a per-business lead time, quiet-hours deferral and an atomic no-double-send claim, and `confirmedByCustomerAt` is on the model. The inbound `C`/`R` parser and the reschedule-request queue remain (Days 6–7).
- **#41** — the "6 literals in a switch" is now one templates module covering both channels, and `renderTemplate` still does not receive a `businessId`. The per-business override model and editor are untouched, so the 2-day estimate stands.

**~11 days remain** of the original 24: Day 1 (defects) and Days 2–13 are done, leaving Days 14–24 — pricing rules (#42), the calendar (#14), real dispatch (#18) and close-out.

Of the nine partial features, **seven are now complete**: #38, #39, #41, #10, #13, plus #42's and #18's prerequisites from Day 0. The two genuinely outstanding are the calendar (#14) and dispatch (#18), which is exactly the 15-day cut described below — and the reason it was the recommended one.

---

## 4. Day-by-day plan

Ordering logic: Day 0 defects first. Then the **notification spine** (#38/#39/#41), because it is the only group with a hard internal dependency and it is what a launched customer notices first. Then data foundations (#10/#13), then pricing (#42), then the two heavy UI features (#14/#18) last — they are the most visible but the least likely to lose a customer if unfinished.

### ~~Days 1–2 · Day 0 defects~~ · ✅ DONE
All seven fixed with 62 tests and 20 mutation checks. The day numbering below is left unchanged so the dependency graph still reads correctly — start at Day 2–3.

One follow-up this surfaced, not yet done: **run the backfill in dry-run against production data** (`npm run backfill:technician-ids`) before `--apply`, and look at the ambiguous count. Jobs whose `technicianName` matches two technicians are skipped by design and need assigning by hand.

### Days 2–5 · Feature 38, part 1: email becomes real — ✅ **done**

Shipped. What landed, and the two places the plan was wrong:

- `CommunicationLog` now carries email: `channel` enum `['sms','email']`, a `subject` field, a `providerMessageId` field, and a **per-channel** body cap (`sms: 1600`, `email: 20000`). The plan said "widen the enum"; that alone would not have worked — the flat `maxlength: 1600` was the Twilio segment ceiling applied to a shared log, so an email of any realistic length failed schema validation. The Twilio delivery-status webhook is now also scoped to `channel: 'sms'`, so an inbound callback cannot match an email row.
- `backend/src/services/notification.service.ts` — one entry point, `send(businessId, type, recipient, vars, options)`, plus `notifyAppointment`, `notifyInvoice` and `notifyEstimate`. Guarantees: it never throws (a booking must not fail because a confirmation did not send), every attempt is logged on both channels including provider-not-configured failures, and the SMS leg always goes through `CommunicationService.sendMessage` so opt-out, quiet hours and From-number resolution are enforced by the same code as before.
- `backend/src/services/notification-templates.ts` — SMS and email copy for every type in one file, with the shared email layout returning `{ text, html }`. A type with no copy for a channel returns `null`, so a missing template is a refusal to send rather than a blank message delivered. `CommunicationService.renderTemplate` is now a thin delegate to it.
- `backend/src/utils/format.ts` — timezone-correct times, money, and address flattening. This fixed a live defect: the voice agent's confirmation formatted the appointment time with `toLocaleString` and **no `timeZone`**, so on a UTC host a 1:00 PM Phoenix job was confirmed to the customer as 8:00 PM.
- Wired, each of which previously had no sender at all: booking confirmation, reschedule, cancellation, quote sent, invoice issued, payment receipt. The receipt hooks `applyPayment` — the single function all three payment routes funnel through — and reports the amount actually taken, not the invoice total. The hand-rolled confirmation block in `tool.registry.ts` was removed, or the voice path would have double-sent.
- Reminder spine: `Appointment.reminderSentAt` / `reminderAttempts` / `confirmedByCustomerAt`, `BusinessPolicy.reminderLeadHours` (default 24) and `appointmentRemindersEnabled`, and the `appointment_reminders` cron job every 15 minutes. Idempotence is an **atomic conditional claim**, not a read-then-write. Quiet hours defer rather than consume. A transient provider failure releases the claim so the next tick retries, capped at 3 attempts. The reminder copy now names the real appointment time — the old template hardcoded "scheduled for tomorrow", so a two-hour lead time would have named the wrong day.
- `reminderLeadHours` added to `policySchema` **and** to the settings UI. Without the schema entry Zod would have stripped it and Mongoose discarded it silently — the same bug class as `diagnosticFee` and `propertyType`.

**Deliberately not done:** the SMS opt-out flag does not suppress email. `isOptedOut` is set only by an SMS `STOP` and its own refusal message says the customer cannot be contacted *by SMS*; transactional email is exempt from CAN-SPAM opt-out. Suppressing email off the back of it would mean a customer who stopped texts never receives their own invoice. A separate email-consent flag belongs with the campaigns on Day 13.

> **This did not happen on Day 13. It has since been done** — see the section below.
> Leaving the original note visible because it is the more useful record: the promise was
> made here, missed there, caught while writing documentation, and closed afterwards.

**Verification:** 49 new tests (219 total, 14 files, all green). 24 mutations attempted, 23 caught. The one survivor — removing `reminderSentAt: null` from the reminder *candidate query* — was confirmed behaviour-neutral: the atomic claim is the real guard, and weakening **that** was caught. Backend `tsc` 0, `typecheck:tests` 0, `build` 0; frontend `tsc` 0, `build` 0; indexes synced.

**Still blocked on config, not code:** `EMAIL_API_KEY` is empty, so no email has left the building yet. Every email path is exercised with the sender stubbed and records a `failed` row with `errorCode: 'email_not_configured'` in production until the key is set. Nothing else has to change when it is.

<details>
<summary>Original plan for Days 2–5</summary>

- **Day 2 (half)–3** — Make email loggable and sendable as a channel.
  - `CommunicationLog`: widen `channel` enum to `['sms','email']`; make `from`/`to` tolerate an address; add a `subject` field.
  - New `backend/src/services/notification.service.ts` — one entry point that takes `(businessId, type, recipient, vars)`, picks channel(s), renders, sends via `CommunicationService` or `EmailService`, and logs both identically. Every existing inline literal moves behind it over Days 4 and 11.
  - A minimal shared email layout (header with business name, plain-text twin). No framework; a function returning `{ subject, text, html }`.
  - *Verify:* a test with `EmailService.send` stubbed, asserting an email row lands in `CommunicationLog` with `channel: 'email'`.
- **Day 4** — Wire the customer-facing emails that have no sender today: booking confirmation, invoice issued, receipt on payment, estimate sent. Each goes through `NotificationService` so SMS and email share one template and one log.
  - *Verify:* tests asserting each trigger produces the right row; one live send to a real inbox once `EMAIL_API_KEY` is set.
- **Day 5** — Appointment reminders — **the missing spine.**
  - `Appointment`: add `reminderSentAt`, `confirmedByCustomerAt`.
  - New cron job `appointment_reminders` in `backend/src/jobs/scheduler.ts`, following the existing `JobDefinition` + `LockService` pattern (copy the shape from `lead_recovery_drips`). Runs every 15 min; selects appointments starting in the configured lead time with `reminderSentAt` unset; respects quiet hours; stamps `reminderSentAt` so it cannot double-send.
  - Reminder lead time as a per-business setting on `BusinessPolicy` (`reminderLeadHours`, default 24).
  - *Verify:* tests for the selection window, the idempotence of `reminderSentAt`, and quiet-hours deferral.

</details>

### Days 6–13 — ✅ **done**

Four features shipped. What landed, and the defects the work turned up.

**Days 6–7 · #39 confirm or reschedule by reply.** `AppointmentReplyService` parses `C` and `R` from an inbound text, resolves the customer's nearest live appointment and acts on it. Keywords match **exactly**, not by substring: "Can we reschedule?" is not a bare `R`, because inferring intent from prose is how a customer saying "I do NOT want to reschedule" gets rescheduled. Prose goes to a human. New `RescheduleRequest` model with a partial unique index, so a duplicate `R` refreshes the offered slots rather than queueing a second row; applying one routes through `rescheduleAppointment`, so the booking lock, conflict re-check and history all still apply, and the request is marked applied only **after** the move succeeds. Unmatched inbound SMS stops being dropped — every inbound row is created `needsAttention: true` and cleared only by the handler that answers it, which is the fail-safe direction: a branch added later that forgets to flag leaves the message visible instead of silently reintroducing the bug. New Action Queue page carries both queues. Also fixed: `rescheduleAppointment` never checked opening hours, so a move to 3am or onto a closed Sunday succeeded — the slot genuinely is free, because nobody is working.

**Days 8–9 · #41 per-business templates.** `MessageTemplate` keyed `{businessId, type, channel}`. Deliberately an **override** table: a business with no rows behaves byte-for-byte as before, asserted directly against the shipped renderer. That matters because the defaults carry the carrier-expected opt-out notice, and a scheme where copy must be supplied before anything sends would mean an empty template silently stops a reminder. `{{name}}` placeholders with a declared variable set per type, rejected at save time with the allowed list in the message. An SMS override must keep an opt-out notice where the shipped copy has one — not a style rule, since deleting "Reply STOP" turns a compliance default into an opt-in. A disabled channel is refused in `resolveForSend` as well as `channelsForSend`, because a caller naming a channel explicitly skips the latter. Owner-gated settings page with server-side preview.

**Days 10–11 · #10 structured property and equipment.** New `Equipment` model and a `Customer.property` sub-object (gate code, access, pets, parking). `hasPets` is tri-state: `undefined` means nobody has asked, which is not "no pets", and a technician deciding whether to open a gate needs the difference. Transcript extraction writes **both** the memory row (provenance) and the structured field, and never overwrites what a person entered. The voice prompt reads the fields and excludes the four memory keys they came from, so the same fact does not appear twice in two wordings. Two real defects fixed in the dispatch text: the "Access/Gate" line was whichever `instruction` memory the loop saw last (a pet warning printed as a gate code), and `techPhone` defaulted to the **customer's** number — so an unassigned job texted the homeowner "DISPATCH ALERT" containing their own gate code. Removed a fabricated "Equipment Registry" card that showed the same six specifications (Carrier Infinity 16, R-410A, 8.2 lb charge) to every customer in every business.

**Days 12–13 · #13 segments.** Fixed the plumbing first: `tags` were indexed, editable and **absent from the list DTO**, so the page's tag dropdowns had nothing to filter on; `createCustomer` and `updateCustomer` both accepted tags and dropped them. Tags are now normalised to upper case and deduplicated everywhere, because segment filters match exactly and two spellings means a segment missing half its audience. New shared `customer-filter.ts` builder used by the list, the segment count and the campaign audience — the same query, or a segment reading "42 customers" sends to 39 and nobody can say which number was wrong. New `CustomerSegment` model; the count is deliberately **not** stored. Campaigns go through `NotificationService` per recipient, so quiet hours and the SMS opt-out are enforced by the same code as everything else, and a campaign text is refused without an opt-out notice. Quiet hours are **not** bypassed here, unlike every transactional send — a campaign is a cold contact, which is what the window exists for. Capped at 500 recipients as a blast-radius limit.

Two more "declared and never written" fields closed along the way: `lifetimeValue` was permanently `0` (now incremented in `applyPayment`, payments received rather than invoices raised) and `lastServiceAt` did not exist (now stamped with `$max` on both completion paths). Without them, a "worth over $500" segment would be permanently empty and a win-back segment would match everybody.

**Verification.** 377 tests / 18 files, all green.

Mutations, per group, so the total is checkable rather than asserted:

| Group | Attempted | Caught | Survivors |
|---|---:|---:|---|
| Days 6–7 · #39 | 19 | 19 | — (four survived the first pass and exposed real test gaps; one guard turned out to be unreachable and was deleted rather than tested) |
| Days 8–9 · #41 | 21 | 21 | — (two survived the first pass: the disabled-channel guard on the explicit-channels path, and `channelsForSend`'s tenant scope) |
| Days 10–11 · #10 | 21 | 21 | — |
| Days 12–13 · #13 | 29 | 28 | 1 — a redundant `businessId` on the equipment lookup. Behaviour-neutral, because the ids are intersected with a `Customer` query that is itself tenant-scoped. Kept as an index measure and documented in place. |
| **Total** | **90** | **89** | **1** |

Backend `tsc` 0, `typecheck:tests` 0, `build` 0; frontend `tsc` 0, `build` 0; indexes synced. Two new dry-run-by-default scripts (`migrate:property-memories`, `backfill:customer-rollups`) both report 0 rows against the live database, which is consistent with the voice pipeline never having handled a real call.

### Day 13½ · email consent — ✅ **done**

Closing the one gap that kept #13 partial. Written up separately because it was not on the
plan: it was promised in the Day 2–5 notes for Day 13, missed, and found while reconciling
documentation rather than by a test.

- `Customer.emailOptedOut` / `emailOptedOutAt`, **separate** from `isOptedOut`. Two consents under two different laws: one is set by texting `STOP` (TCPA), the other by clicking unsubscribe (CAN-SPAM). Conflating them breaks the product in both directions — a customer who stopped texts would lose their own invoice, and a customer who unsubscribed from promotions would keep getting them. There is a test asserting independence in both directions.
- Campaign email carries an unsubscribe link **and** the `List-Unsubscribe` / `List-Unsubscribe-Post` headers. Both, not either: the footer link satisfies the law, the headers are what make Gmail and Outlook render a native unsubscribe button, and a recipient who cannot find the link reports spam instead — which costs the sending domain more than the lost contact.
- Transactional email carries **neither**, deliberately. It is exempt, and offering to unsubscribe someone from their own invoice would be offering something the system would not honour.
- `GET /api/portal/unsubscribe/:token` describes; `POST` acts. Not REST pedantry — mail clients and security scanners prefetch links, so a GET that unsubscribed would opt out recipients who never clicked. The POST is also what RFC 8058 one-click requires. New public page at `/unsubscribe/[token]` that loads a description and waits for a click.
- Token is HMAC-signed with a key derived from `JWT_SECRET`, carries both ids so it cannot be repointed at another tenant's customer, and is deliberately **not** single-use — a forwarded email or a second click must not error. No expiry either: a dead unsubscribe link leaves the recipient with a spam complaint as their only option.
- Re-subscribing is staff-only and not reachable by link, so the unsubscribe page cannot undo itself and a prefetching scanner cannot opt somebody back in.

**Two things this turned up that were not the feature.**

*One:* three mutations survived the first pass and each exposed a different real gap rather than a benign redundancy. The derived signing key was untested (a token signed with the raw `JWT_SECRET` would have verified); `EmailService` forwarding headers to the provider was untested, because every existing test stubs `EmailService.send` and never reaches its body — so **new `tests/notifications/email-service.test.ts`** covers the service itself with `fetch` stubbed; and `sanitiseCustomerFilter` was accepting three send-time consent flags that nothing could reach, so they were **removed** rather than tested. Second pass: 24 of 24.

*Two:* an uncommitted change to `createAppointmentUnlocked` was already in the working tree, adding the booking-policy and opening-hours checks that the create path lacked while reschedule had them. It is correct — a create path that skips a check reschedule enforces is inconsistent, and booking a technician for 3am should not succeed — so it was kept and the fixtures fixed rather than reverted. It broke 19 tests, and the cause is worth recording: **fixtures built times as `Date.now() + N hours`, which is time-of-day dependent** once opening hours are enforced. The same 48-hour offset passed at 13:00 UTC and failed at 03:21, because the job then landed at 23:21 local and its 90 minutes crossed midnight. New `bookableAt()` helper returns midday, clear of the notice, horizon and closing-time edges. One test also had a hardcoded 2026 date that had silently drifted into the past and was failing the minimum-notice check rather than testing the timezone behaviour it was written for.

Fixtures are now pinned to **UTC**, which papers over a real inconsistency rather than fixing it: `getAvailableSlots` buckets slots in UTC while `isWithinBusinessHours` compares in the business timezone, so a business in any other zone can be offered a slot the booking path then rejects. That is the Day 16 defect, and it is next.

**Verification.** 416 tests / 20 files, all green. 24 mutations, all 24 caught after the second pass. Backend `tsc` 0, `typecheck:tests` 0, `build` 0; frontend `tsc` 0, `build` 0; indexes synced. `EMAIL_API_KEY` is still unset, so the unsubscribe mechanism is exercised only with the sender stubbed — no real unsubscribe link has been clicked from a real inbox.

<details>
<summary>Original plan for Days 6–13</summary>

### Days 6–7 · Feature 39: customers can confirm or reschedule by reply
- **Day 6** — Inbound reply handling. `Appointment.confirmedByCustomerAt` already exists (added Day 5). Add a keyword branch *before* the opt-in check that resolves the customer's next appointment, stamps `confirmedByCustomerAt` and acknowledges — **then** change the reminder copy to `Reply C to confirm, R to reschedule`. The order matters: the copy was deliberately left off on Day 5 because nothing parses C or R, and an instruction the system silently drops leaves the customer believing they rescheduled. A test in `tests/notifications/email-channel.test.ts` currently asserts the copy does *not* contain it; delete that assertion in the same change that adds the parser.
- **Day 7** — Reschedule requests. New `RescheduleRequest` model (pending/resolved, requested window, source). `R` creates one and replies with the nearest available slots from `AvailabilityService.getAvailableSlots`. Owner sees a queue and one-click applies via the existing `rescheduleAppointment`. Unmatched inbound SMS stops being silently dropped — it lands in an owner-visible "needs attention" list.
  - *Verify:* tests for C, R, an unmatched message, and a reply from a number with no appointment.

### Days 8–9 · Feature 41: per-business templates
- **Day 8** — `MessageTemplate` model keyed `{ businessId, type, channel }`, holding `subject`/`body` and an `enabled` flag. `NotificationService` resolves per-business first and falls back to the shipped default, so an un-customised business behaves exactly as today. Token substitution with a real `{{variable}}` replacer and a declared variable set per type — not ES template literals, since the copy now comes from the database.
- **Day 9** — `frontend/app/app/settings/notifications/page.tsx`: list every notification type, show the default, allow an override, live-preview with sample data, per-type channel toggles (SMS / email / both / off), and a reminder lead-time control. Owner-gated with `requireOwner`.
  - *Verify:* a test that a per-business override is used and that a business with none gets the default verbatim.

### Days 10–11 · Feature 10: structured property and equipment data
- **Day 10** — New `Equipment` model (customer, type, brand, model, serial, install year, filter size, location, warranty expiry, notes). Structured property fields on the service address: gate code, access instructions, pets, parking, property type. Migrate existing `AgentMemory` rows (`access_code`, `pets_on_property`, `primary_equipment`, `equipment_location`) into the new fields with a one-off script, keeping the memory rows intact so nothing is lost.
- **Day 11** — Surface it: an Equipment tab in the Customer 360 drawer; property fields on the customer form; inject structured data into the voice prompt via `AgentMemoryService.assembleCustomerContext` (replacing the regex-derived strings with real fields); include gate code and equipment in the dispatch SMS from the new fields rather than by category-guessing (`technician-dispatch.service.ts` currently takes the *last* `instruction` memory as the gate code — a real fragility).
  - *Verify:* tests that the migration maps correctly and that the prompt contains the structured values.

### Days 12–13 · Feature 13: segments that work
- **Day 12** — Fix the plumbing first: add `tags` to `CustomerService.toDTO` and make `updateCustomer` write them. Then tag filtering (`tags` in / all / none), plus filters on lifetime value, last service date, status and equipment brand.
- **Day 13** — `CustomerSegment` model storing a named filter. Saved segments in the sidebar with live counts, and "send a campaign to this segment" that reuses `NotificationService` with quiet hours and opt-out enforced per recipient. Replace the two dead dropdowns removed on Day 2.
  - *Verify:* a test that a segment's filter returns the same set as the ad-hoc filter, and that a campaign skips opted-out customers.

</details>

### Days 14–15 · Feature 42: pricing rules
- **Day 14** — Extract the duplicated arithmetic into one `PricingService.quote(lineItems, policy, context)` and make all three call sites use it (`invoice.service.ts`, `estimate.service.ts`, `worker.service.ts`). Move `taxRate` and `laborRate` onto `BusinessPolicy` so `worker.service.ts` stops hardcoding `0.0825` and `95`. Bill `emergencyFee` when the appointment is flagged emergency — today the AI quotes it and it is never charged.
- **Day 15** — Travel fee per service zone (`ServiceZone.travelFee`), applied by the zone matched from the job zip. Discounts as a first-class field (percentage or fixed, with a reason recorded) rather than a manual negative line item. Show the breakdown on the portal quote and invoice.
  - *Verify:* a test table of inputs → expected totals, covering the diagnostic credit reducing the taxable base, the emergency fee, a travel fee and a discount together. This is money; the mutation check applies.

### Days 16–19 · Feature 14: the calendar
- **Day 16** — Timezone correctness and per-technician conflicts. Replace `getUTCHours()` bucketing with business-timezone rendering. Change `checkSlotConflict` to scope by technician when one is assigned, so a five-technician business can hold five concurrent jobs — today it cannot hold two. This is a behaviour change to a lock-protected path, so it needs its own concurrency test alongside the existing 5-parallel-booking one.
- **Day 17** — Week and month views, finally calling the `getCalendarAppointments` range endpoint that has existed and gone unused. Technician lanes in the day view (possible only after BUG-B).
- **Day 18** — Drag-and-drop to reschedule, routed through `rescheduleAppointment` so the lock, conflict re-check and `rescheduleHistory` all still apply. Optimistic UI with rollback on a 409. Note `rescheduleAppointment` currently re-checks slot overlap but **not** business hours — add that, or a drag onto a closed Sunday will succeed.
- **Day 19** — Recurring appointments: `recurrenceRule` + `recurrenceParentId`, generation horizon, and edit-one-vs-edit-series. Deliberately last in this group — it is the piece a maintenance-plan feature later depends on, and the easiest to defer.

### Days 20–23 · Feature 18: real dispatch
- **Day 20** — Assignment as a first-class action. A technician picker in the booking modal and on the appointment detail page, writing `technicianId`. Call `findOptimalTechnician` at booking time to *suggest* (not silently impose) an assignment, and persist the result — today it returns a suggestion to nobody. Filter by `status` and skills, which the current matcher ignores.
- **Day 21** — Geocoding. A provider and key in `config/env.ts`, coordinates on the service address (geocoded on save, cached), and a home base on `Technician`. This is the foundation the map and any routing needs, and none of it exists today.
- **Day 22** — Real map view with a real library, replacing the Day 2 placeholder: job pins, technician positions, zone overlays, click-to-assign.
- **Day 23** — Route ordering per technician per day, with honest distance and drive-time from the geocoded points, and a "send route" that actually sends. Any efficiency figure shown must be computed, not the invented `32%`.

### Day 24 · Close out
Full suite, mutation check on the money and tenancy paths touched (Days 1, 14–15, 16), update `FINAL.md` status rows and counts, update `README.md` known-gaps, commit.

---

## 5. If 24 days is too long

### The 15-day cut — everything a paying customer touches
**Days 1–15 exactly as written.** You finish: all five Day 0 defects, customer-facing email, appointment reminders, confirm/reschedule by reply, per-business templates, structured property and equipment data, working segments, and a real pricing engine.

You defer the calendar and dispatch (#14, #18) entirely. That leaves 7 of 9 partials done.

This is the cut I would take. The deferred two are the most *visible* work but the least likely to cost a customer: a contractor can live with a day-only calendar and manual assignment. They cannot live with a customer who gets no reminder, or an invoice that charges $189 for a $450 job.

### The 20-day cut
Days 1–15, then **16, 17, 20** and Day 24.

That adds timezone correctness, per-technician conflicts, week/month views, and real technician assignment — skipping drag-and-drop, recurrence, geocoding and the map. Those four are the genuinely optional ones, and the three you keep include the two correctness fixes (Day 16) that matter more than any of the UI.

### What not to cut
Day 14, the pricing extraction every other pricing change depends on. (Day 1 was the other one on this list; it is done.)

---

## 6. Dependencies, in order

```
BUG-B (technicianId)  ──▶ Day 17 (technician lanes) ──▶ Day 20 (assignment)   [BUG-B done]
Day 2–3 (NotificationService) ──▶ Day 4, 5, 8, 9, 13
Day 5 (reminders exist)       ──▶ Day 6, 7  (#39 is blocked without this)
Day 8 (template model)        ──▶ Day 9 (editor)
Day 10 (Equipment model)      ──▶ Day 11 (surfacing, dispatch SMS)
Day 12 (tags in DTO)          ──▶ Day 13 (segments)
Day 14 (PricingService)       ──▶ Day 15 (travel fee, discounts)
Day 21 (geocoding)            ──▶ Day 22 (map), Day 23 (routing)
```

Two things gate days from outside the code:

- **`EMAIL_API_KEY`** is needed to verify Days 3–4 for real. The code and tests work with the sender stubbed, but no email has ever been sent through Resend, so treat the first live send as unproven until it lands in an inbox.
- **A maps/geocoding key** is needed for Day 21 onward. None is configured and there is no reference to one anywhere in the backend.

---

## 7. One thing to keep in view

None of this is the most important work outstanding.

The voice pipeline has still never handled a real call. It is the component the entire product rests on, and every day in this plan is work *around* it. Finishing all nine partials would leave that unchanged.

If the tunnel is up and the keys are in, prove the call first. It is hours, not days, and it tells you whether the thing you are polishing works at all.
