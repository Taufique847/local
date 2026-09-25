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
- **Days 14–15 (#42)** — done. The duplicated arithmetic is one `PricingService`; travel fees, discounts and the never-billed `emergencyFee` all work. One line of that row's "missing" column is deliberately **not** closed: *"tax is one flat blended rate; customer state/zip never consulted"*. A per-jurisdiction tax table is a different feature from a pricing engine, and guessing a rate from a ZIP is worse than using the rate the business entered. It is recorded in the Day 24 close-out instead.

**~5 days remain** of the original 24: Day 1 (defects), Days 2–13, Day 13½, Days 14–15 and Days 16–19 are done, leaving Days 20–24 — real dispatch (#18) and close-out.

Of the nine partial features, **seven are now complete**: #38, #39, #41, #10, #13 and #42, plus #18's `technicianId` prerequisite from Day 0. The two genuinely outstanding are the calendar (#14) and dispatch (#18), which is exactly the 15-day cut described below — and the reason it was the recommended one.

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

### Days 14–15 · Feature 42: pricing rules — ✅ **done**

`PricingService` is now the only thing in the codebase that does money. Everything below is in `backend/src/services/pricing.service.ts`, with **81 tests** in `backend/tests/money/pricing-rules.test.ts` and **68 distinct mutations attempted**: 66 caught, one guard deleted as unreachable, one survivor documented as behaviour-neutral. Suite total **497 tests across 21 files**.

**What was planned and shipped**

- `PricingService.quote(input, policy)` replaced the arithmetic in `invoice.service.ts`, `estimate.service.ts` (including its separate tier loop) and `worker.service.ts`. There turned out to be a **fifth** copy, in the browser — see below.
- `emergencyFee` is billed, resolved from `appointment.priority === 'urgent'`. `BusinessPolicy.emergencyFee` had existed since the beginning, the AI was authorised to quote it on the phone, and no invoice path had ever charged it.
- `ServiceZone.travelFee`, matched on the customer's ZIP the same way `TechnicianDispatchService.findZoneForZip` matches it, so the fee an invoice charges cannot disagree with the zone a technician was dispatched from.
- Discounts as a real field — `discountType` / `discountValue` / `discountAmount` / `discountReason` on both models — instead of a manual negative line item.
- Breakdown on `portal/invoice/[id]` and `portal/quote/[id]`.

**Design decisions worth keeping**

- **Integer cents throughout.** Float sums produce totals like `419.99999999999994`, and `toFixed(2)` at each step compounds the error rather than removing it. The tests pin this with prices chosen for their representation error: `8.29 * 100` is `828.9999999999999`, and `(2.675).toFixed(2)` is `"2.67"` where doing it in cents gives `2.68`.
- **Order of operations is a policy decision, so it is documented and tested as one.** `subtotal → less diagnostic credit → less discount → tax → total`. The credit reduces the *taxable base* rather than paying down the total, because the customer already paid that money and was already taxed on it. The discount lands after the credit (otherwise the business hands back a percentage of money already received) and before tax (otherwise it collects tax it does not intend to remit). Two tests exist purely to distinguish these from the plausible alternatives.
- **A tax rate above 1 is rejected, not coerced.** `8.25` and `0.0825` mean the same thing to a person; guessing would occasionally guess wrong on a real invoice.
- **A fixed discount is capped at the bill, not rejected.** A $200 goodwill credit on a $150 job zeroes it; it does not go negative and the business does not owe tax on a negative base.
- **Line item `total` is always recomputed.** The old code did `part.totalCost || part.quantity * part.unitCost`, so a part whose stored total disagreed with its own quantity and price billed the stored figure while printing the other two beside it.

**Defects found while doing this — all pre-existing, none in scope**

- **Approving an estimate tier left the old tax.** `approveEstimate` copied `items`, `subtotal` and `totalAmount` from the chosen tier and left `taxAmount` at the base items' value. So the total came from the "best" tier and the tax from the cheapest, `convertToInvoice` copied both, and the invoice's own figures did not add up to the amount demanded. Fixed by storing `discountAmount` and `taxAmount` on the tier — the only three figures that vary between tiers — and copying all of them.
- **`convertToInvoice` dropped the fees and the discount.** An approved quote carrying a travel charge and a 10% discount became an invoice whose `travelFee` and `discountAmount` columns read `0` while the line items and the total still contained them.
- **The estimates page posted `taxRate: 8.25`** into a field the request schema bounds at 1. Every estimate created from the dashboard was being rejected with a validation error; had it got through it would have billed 825% tax. Removed, so the business's configured rate applies.
- **The worker PWA posted `diagnosticFeeCredit: 89` and `additionalLaborHours: 1` on every tap.** The 89 was the last surviving hardcoded price and overrode whatever the business had configured. The invented hour was worse: no technician had said they worked it, and it was billed at the labour rate on every job closed from the field.
- **The quote page recomputed tier tax in the browser**, falling back to `0.0825` for any business that had not set a rate, and knowing nothing about the discount — so a discounted quote displayed tax on the undiscounted amount. This was the fifth copy of the arithmetic. It now renders what the server stored.
- **`createZone` did `data.travelBufferMinutes || 30`**, silently overriding a zone deliberately configured with no buffer.
- **`z.coerce.boolean()` was the wrong tool for `emergency`.** It turns the string `"false"` — which is what a form posts — into `true`, so an owner explicitly waiving the emergency fee would have been charged it. Replaced with an explicit union that rejects anything that is neither.

**Two mutation survivors, resolved rather than left**

- `Math.max(0, …)` on the taxable base was **unreachable**: `resolveDiscount` already caps a percentage at 100 and clamps a fixed amount to the base. An untestable guard on a money path is not insurance, it is a claim nobody can check, so it was removed and the cap is asserted at both of its actual boundaries instead.
- Replacing the derived total with `Number((taxable + tax).toFixed(2))` is **genuinely behaviour-neutral**, and the reason is written into the code: the true value always sits exactly on a whole cent, so the ~1e-13 error in the float addition can never cross a rounding boundary. The derived form is kept because it needs no such argument — and that argument is what would quietly stop holding if anyone added a third addend.

### Days 16–19 · Feature 14: the calendar

#### Day 16 · timezone correctness and per-technician conflicts — ✅ **done**

45 tests in `backend/tests/scheduling/availability-timezone.test.ts`; **61 distinct mutations attempted, 61 caught** after three passes.

**The missing primitive.** `backend/src/utils/format.ts` had `zonedParts` — instant → local wall clock — and nothing going the other way. So `getAvailableSlots`, needing an instant for "08:00 where the business is", reached for `Date.UTC(y, m, d, 8, 0)`: eight in the morning in Greenwich. `zonedWallClockToUtc` is now that inverse, plus `zonedDayBounds` and `zonedDateKey` built on it.

It generates two candidate instants and **verifies each by reading it back**, rather than correcting the first with the second's offset. Correcting is what an earlier draft did and it is wrong: across a spring-forward gap the two corrections oscillate, and the version that looked right returned 01:30 for a requested 02:30. The two inherent ambiguities are resolved explicitly — a time that does not exist yields the instant the clock actually reached, and a time that happens twice yields the earlier — and slot generation round-trips every slot so a 02:30 that is really 03:30 is dropped rather than offered.

**What the split was actually costing.** A New York shop open 08:00–18:00 was offered slots covering 03:00–13:00 Eastern. `isWithinBusinessHours` compared the same strings in `business.timezone` and rejected everything before 08:00 local, so roughly half of every offered day was a 409 waiting to happen — through the booking modal, the voice AI's `check_availability`, and the SMS reschedule offers. There is now a test that asserts the invariant directly: **every slot offered must pass `isWithinBusinessHours`.**

**Per-technician conflicts.** `checkSlotConflict` filtered on `businessId` alone, so a five-technician company could hold exactly one job at any instant — a scheduling product that could not schedule a crew. Now two questions, because they are different ones:

- **A job with someone assigned** asks "is this person free?", and the refusal names them. "Dana is already booked" is a decision a dispatcher can act on; "already booked" is not.
- **An unassigned job** asks "is anyone left?" — overlapping jobs against active technicians. Not skipped, because an unassigned job still needs a body, and accepting six for a crew of three is the same broken promise as double-booking one person. No technician records means a crew of one, which is the shop the old behaviour actually suited.

The technician is now resolved **before** the conflict check on the create path. The old order asked the capacity question for a job that already had a named owner, which would have left the limitation in place.

**Other defects fixed, all pre-existing**

- **`getTodayAppointments` and the `date` list filter built a UTC day.** For a Dallas business that window runs 19:00 the previous evening to 19:00, so the evening's jobs were filed under tomorrow — on the page and the endpoint that exist to answer "what is happening today". `call.service.ts` had the identical bug. Windows are now half-open on the local day, so a job at exactly local midnight belongs to one day rather than both.
- **`rescheduleAppointment` never checked the booking horizon**, so a job could be moved five years out and vanish from every list. Now enforced. Minimum notice deliberately is **not**: notice protects the business from a job it has no time to prepare for, which an owner moving work already on the books is not. Both halves of that asymmetry have a test so it stays a decision.
- **Lead timeline notes used `toLocaleString()` with no zone**, so on a UTC host a 2:00 PM Dallas job was recorded as 7:00 PM on the note a salesperson reads back to the customer.
- **The frontend grid was wrong in four ways at once.** Rows were a hardcoded 8–18 in UTC; jobs were bucketed with `getUTCHours()`; card times used `toLocaleTimeString()` with no zone, so the row label and the text inside it disagreed by four to eight hours; and the date arrows round-tripped through `toISOString()`, which for a viewer behind Greenwich lost a day. Rows now come from the business's published hours for that weekday, widened to cover any job outside them so an out-of-hours callout is visible rather than dropped, and the zone is stated once in the header.
- **The frontend's double-booking badge never fired.** It grouped by `${techName}_${getUTCHours(startAt)}` — neither necessary nor sufficient for an overlap — and read `appt.technician`, a field the API does not return, so everything fell through to `'Unassigned'` and was skipped. Now a real half-open overlap check per `technicianId`, matching the backend.

**Two mutation survivors, both resolved by deleting the thing that survived**

- The read-back check compared year, month, day and minutes. The day clause could not fire — the offset is at most ±14 hours, so a candidate whose minutes match is never on another date — so the check is now stated as its own definition, `instant + offset(instant) === requested`, with every part load-bearing.
- Resolving the weekday through the business timezone was indistinguishable from resolving it in UTC, because a weekday is a property of a calendar date and not of an instant. Two `Intl` calls implying a zone-dependence that does not exist; replaced with the calendar arithmetic it always was, and a comment saying why it looks like it should need a zone.

Two survivors also exposed a real gap rather than dead code: nothing asserted that a **crewless** business gets *available* slots. A capacity of zero would have made `overlapping < capacity` false everywhere and reported an empty calendar as fully booked — for the default account, which has no technician records at all.

#### Day 17 · week and month views — ✅ **done**

The range endpoint now has a caller, and 13 more tests (58 in the scheduling file), **13 mutations attempted, 13 caught**.

**The endpoint had two defects nobody had ever seen**, because nothing called it:

- `new Date('2026-09-21')` parses as UTC midnight, so the range was a UTC one. For a Dallas business a "week" began at 19:00 the previous Sunday.
- `$lte: toDate` put the upper boundary at midnight *starting* the `to` date, so the last day of every range was empty. A Monday-to-Sunday week view would have shown six days.

Both ends are now half-open on the local day, with a test at each boundary — the 22:00 job on the final day is in, the 23:00 job the evening before the range is out, and the 00:00 job the day after `to` is out so two adjacent weeks cannot both claim it.

**Bounded at 62 days.** The query has no pagination because a grid cannot place a job it was not sent, so the range itself is the limit. 62 and not 31 because a month grid pads to whole weeks and legitimately asks for up to 42 days — there is a test for each of those two numbers.

**Views.** Week is seven day columns; month is a padded rectangular grid showing two jobs per cell plus a "+N more". Both click through to the day timeline. Closed days are greyed rather than hidden: a dispatcher looking for Sunday needs to see that Sunday exists and the shop is shut, not find a six-column week. Padding days from neighbouring months are dimmed rather than blank, so a job on the 1st stays reachable.

**Grouping is by local date**, via `zonedDateKey` in the business timezone, so a 23:00 job lands in the cell someone would look for it in.

**Search and status filter client-side in the range views.** The calendar endpoint takes neither, and at most a month of one contractor's jobs is small enough that adding two parameters to a shared endpoint is the more expensive change. The day and list views still filter server-side, where paging makes it necessary. Stated here because it is a deliberate asymmetry rather than an oversight.

**Navigation follows the view** — the arrows page by week in the week view and by month in the month view, since an arrow that moves one day in a month grid moves nothing visible. `shiftMonthKey` clamps the day, because `Date.UTC(y, m + 1, 31)` rolls over and paging from 31 January would land in March and skip February.

#### Remaining

- **Technician lanes** in the day view are not built. Deliberately deferred: they are the one part of Day 17 that is presentation rather than correctness, and Day 20's technician picker is what makes them worth having — most jobs are still unassigned.
#### Day 18 · drag-and-drop reschedule — ✅ **done**

11 more tests (79 in the scheduling file); **23 mutations attempted, 23 caught** across three passes.

Routed through `rescheduleAppointment`, never `updateAppointment`. That is the whole point: the reschedule path is the one that holds the per-business booking lock and runs opening hours, the booking horizon and the per-technician conflict check, and writes a `rescheduleHistory` entry. Writing `startAt` directly would move the job and skip the double-booking guard entirely.

**Optimistic with rollback**, because a refusal is the *normal* case here rather than an error condition — a drop onto a closed Sunday or onto the assigned technician's own job is supposed to fail. The card moves immediately; on failure it moves back and the server's own reason is shown verbatim. "Dana Reyes is already booked for that time" tells a dispatcher what to do next; "failed to update" does not.

Dropping onto an hour row in the day view sets that hour. Dropping onto a day cell in the week or month view **keeps the time of day** — moving Tuesday's 9am job to Thursday means Thursday at 9am, not Thursday at midnight — read in the business timezone via a frontend `zonedWallClockToUtc` that mirrors the backend's.

**Defects fixed, all pre-existing**

- **`POST /:id/reschedule` and `/:id/cancel` had no validation schema at all.** The route file's own comment recorded that `PUT /:id` had been fixed for exactly this reason; these two had not. Two things were getting through:
  - **`endAt` earlier than `startAt`.** Nothing compared them, and the overlap query for a backwards window matches nothing, so a negative-duration appointment saved cleanly — and then poisoned every later reschedule, because the duration is carried forward.
  - **An unbounded `reason`**, appended to `rescheduleHistory` on every move.
- **`null` as a start time booked the epoch.** `new Date(null)` is 1 January 1970, a perfectly valid date, so it passed every check that follows: the horizon only looks forward, minimum notice is not enforced on this path, and an all-hours business accepts the hour. The job moved to 1970 and disappeared from the calendar. `undefined` and `''` need no such guard — `new Date` already makes both invalid, and guarding them too would be a clause nothing could reach.
- **The controller's hand-rolled `if (!startAt)` is gone.** Two guards for one condition, and the duplicate made the schema's own requirement impossible to test independently. The schema now reports it against the field, which a form can highlight.

**What the mutation pass found, which is the more useful output**

- **A real hole in my own tenancy test.** Removing `businessId` from the reschedule lookup still produced a 404 — because `rescheduleAppointmentUnlocked` ends with `getAppointmentById`, which *is* scoped — but only *after* writing the move. Asserting the status code was not enough; the test now asserts the document is untouched.
- **`changedBy` is defended twice, and neither layer is individually testable.** The schema does not list it, so `validateBody` strips it; the controller reads `req.user.email` regardless. Mutating either alone is harmless, so the harness gained the ability to apply two edits at once — and the paired mutation *is* caught, which is what makes the defence verified rather than assumed.
- **The cancel schema looked redundant**: `Appointment.cancellationReason` already carries `maxlength: 500`, so Mongoose refuses an over-long reason either way. It refuses it as `cancellationReason` though — the internal column, after a database round trip — while the request field is `reason`, and a form cannot highlight an input it has no name for. The test now asserts which field is named, which is the observable difference.

#### Remaining
#### Day 19 · recurring appointments — ✅ **done**

`RecurrenceService`, 53 tests in `backend/tests/scheduling/recurrence.test.ts`, **63 mutations attempted across seven passes, 63 caught**. This is the last piece of #14.

**Three decisions shape all of it**

1. **Occurrences are real appointments, not computed on read.** A technician is assigned to a specific visit; that visit gets rescheduled, invoiced and photographed and has its own `rescheduleHistory`. A virtual occurrence has nowhere to put any of that. The cost is materialisation, which is what the horizon, the watermark and the top-up job exist to manage.
2. **A series is generated to a 120-day horizon, not in full.** Writing three years of weekly visits eagerly buries the calendar in work nobody has committed to. 120 days rather than `maxBookingHorizonDays` (30) because that setting exists to stop a *customer* booking too far out, and capping a contractor's own maintenance plan at a month would make quarterly plans invisible.
3. **An occurrence that cannot be booked is skipped, not forced and not fatal.** A monthly plan on the 15th lands on a closed Sunday twice a year. Failing the whole plan is useless; creating it anyway books work nobody will do. The skipped dates and the reason are returned.

**Design notes worth keeping**

- **Only `weekly` and `monthly`, with an `interval`.** Fortnightly is weekly/2, quarterly is monthly/3, annual is monthly/12. A `quarterly` value would be a third spelling of something `monthly`/3 already says, and each extra frequency brings its own month-end edge cases.
- **Every occurrence is derived from index 0, never from the previous one.** 52 weekly steps across two DST transitions drifts by an hour, so a 09:00 visit silently becomes 08:00 and stays there. Computing from the first occurrence through `zonedWallClockToUtc` means every visit lands at 09:00 local whatever that week's offset is — the first real payoff of the Day 16 primitive.
- **A missing day of the month is skipped, not clamped.** A plan set for the 31st would otherwise fire on the 30th of April and the 28th of February, so the interval between visits silently varies and a customer told "the 31st" is visited on four different dates.
- **An unbounded series is refused.** It cannot be materialised in full by definition, so accepting one would mean the plan exists only as far as the last top-up ran — and a contractor who disabled the scheduler would find their calendar stopping on a date nothing chose.
- **The rule lives on the parent only.** Copying it onto every occurrence would mean a change to the plan had to be written to every row, and a partial write would leave two visits of one series disagreeing about what the series is.
- **`recurrenceCompletedAt`, because the watermark cannot answer "is this finished".** A four-visit plan ends with its watermark three weeks out, comfortably inside the horizon, so the top-up query would select it forever and take the per-business booking lock each time to discover there is nothing to do. Generation now records *why* it stopped — plan ended, or horizon reached — and only the first is final.
- **Cancelling one visit is not ending the plan.** `cancel-series` is a separate route from `cancel` for exactly that reason, and it works from any occurrence, leaves completed visits alone, and clears the rule so the top-up job stops re-creating what was just cancelled.

**What the mutation passes found**

- **`interval: 0` silently became weekly.** `Math.trunc(Number(rule.interval) || 1)` — the same `||`-swallows-an-explicit-zero mistake this plan has been fixing all the way through. A typo in a form would have created 52 visits a year nobody asked for.
- **A filter that was actively wrong.** `status: { $nin: ['cancelled'] }` on the top-up query looked like obvious hygiene. It meant cancelling the *first visit* silently stopped the next year of them — the exact accidental-cancellation failure `cancel-series` exists to prevent. Removed, with a test asserting the plan continues.
- **Two clauses that could never exclude a row.** `recurrenceGeneratedThrough: { $lt: horizon }` — generation stops *at* the horizon and the horizon only moves forward, so every unfinished series already satisfies it. And `recurrenceParentId: null`, redundant because occurrences never carry a rule. Both deleted.
- **Three tests that passed without testing anything.** A closed-day test that closed a day none of the occurrences fell on; a `leadId` test on a series that had no lead; a `listSeries` test that only ever asked from the parent, where the parent resolution is a no-op. All three now exercise the thing they claim to.
- **One clause kept despite being unreachable**, and said so in place: the `businessId` on the bulk `updateMany` in `cancelSeries`. The invariant making it redundant lives in a lookup ten lines above, a refactor could move that lookup with no test failing, and the failure it guards — a one-tenant update becoming an every-tenant one — is unrecoverable.

**A process failure worth recording.** A mutation run was killed by a 30-minute timeout while a mutation was applied, so the `finally` that restores the file never ran. Every subsequent mutation then "passed" — the suite was already red, so of course it failed again — and a run of 47 results was worthless while looking entirely normal. The harness now verifies the baseline is green before it starts, and long runs are split into batches.

#### Three defects in this session's own work, found by an independent audit

An `newbugs.md` audit of the current code was written in parallel by another pass over the repo. Three of its twelve findings landed on code from Days 14–19 and are fixed here; **the remaining nine are left open on purpose** — they are in modules this plan has not reached (regex escaping across search endpoints, TCPA quiet-hours in the drip scheduler, service-route validation, campaign batching, the AI's service-category enum, Customer 360's missing financials) and mixing them in would blur what Days 14–19 actually changed.

- **A part logged in the field app was billed at $0.00.** The worker PWA posted `unitPrice`; `Appointment.partsUsed` carries `unitCost`, and Mongoose silently discards a key its subdocument schema does not have, so `unitCost` fell to its default of 0. Exactly the same class as the Day 0 `svc.price` / `startingPrice` defect that made every field invoice $189. The Day 14 pricing tests could never have caught it, because they seeded `partsUsed` directly with the correct key — the new test goes through the route the app actually calls.
- **The chronology check was on the reschedule schema and not on create**, which is the worse way round: create is the path the AI, the dashboard and the portal all use. An inverted window saves cleanly, because the overlap predicate matches nothing when the two are reversed, so the appointment is invisible to every conflict check forever.
- **A named booking ignored crew capacity.** The Day 16 design asked only "is this person free?" when a technician was named. With a crew of two and two *unassigned* overlapping jobs, neither is attached to Technician A, so A looked free — and accepting gave a two-person crew three concurrent jobs. A named booking now has to clear both questions: naming someone narrows who can do the work, it does not conjure a third technician.

The third is the one worth dwelling on, because it was a hole in a fix rather than in old code — and the tests written alongside it all passed. Every case they covered had the overlapping work *assigned*, which is the case where checking one diary is sufficient.

#### Remaining

- **Technician lanes** in the day view. Deferred from Day 17: presentation rather than correctness, and worth having once Day 20's picker means jobs are routinely assigned.
- **A recurrence control in the booking UI.** The API accepts `recurrence` on create and the series endpoints work; the modal does not offer it yet.

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
