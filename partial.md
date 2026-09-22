# Partial Features — Completion Plan

> **Verified:** 22 September 2026, by reading the actual implementation of all nine features — models, services, controllers, routes and frontend pages. Not from `FINAL.md` or any other planning document. Every claim below has a file path; where a line number is given it was read, not inferred.
>
> **Scope:** the 9 features marked 🟡 Partial in `FINAL.md`. Nothing here is a new feature; it is all finishing work on surface that already half-exists.

---

## 1. Read this first

**Honest total: ~24 working days, not 15–20.**

The 15–20 day figure came from effort notes written without re-reading the code. Verifying it changed three estimates upward, because three features are less built than the label suggested:

- **#39 "Reminder controls"** cannot be completed on its own. There is no appointment reminder in the product at all — no cron job, no send, zero callers for the `appointment_reminder` template. #39 is blocked behind part of #38.
- **#18 "Dispatch assignment"** has a foundation problem: `appointment.technicianId` is **never written by any code path**. Assignment today is a free-text `technicianName` string with no UI field.
- **#14 "Unified calendar"** has no week or month view at all, and its conflict model is business-wide rather than per-technician, so a five-technician business can only hold one job per time window.

§5 gives a 15-day and a 20-day cut if the full 24 is too long.

**Verification rule for every day below:** finish with `npm run typecheck && npm test` in `backend/`, and `npm run typecheck` in `frontend/`. Days that change a guard get a test. Days that change money or tenancy get a test *and* a deliberate break to confirm the test fails — see the mutation-check note in `FINAL.md` §3.

---

## 2. Day 0 — bugs found while verifying (do these first)

These are not features. They are defects in shipped code, each found while reading for this plan. Four of the five are cheap. Together: **1.5 days.**

### BUG-A — Every technician-completed invoice silently bills $189
`backend/src/services/worker.service.ts` (~line 217–235) reads `svc.price`:
```ts
unitPrice: svc.price || 189,
```
The `Service` model has **no `price` field** — it is `startingPrice` (`backend/src/models/service.model.ts`). So `svc.price` is always `undefined` and every invoice generated from the field app charges the hardcoded `189` regardless of what the service actually costs. Same function hardcodes `95` labour, `89` diagnostic credit, and a **non-overridable** `taxRate = 0.0825`.

*Fix:* read `startingPrice`, and source the credit/tax from policy (this is the seam Day 21 builds on). **~2 hours.** Needs a test: an invoice generated from a $450 service must total from 450, not 189.

### BUG-B — `technicianId` is never written, so the worker PWA's per-technician scoping does nothing
Last session added technician-scoped job access (`worker.service.ts` `findOwnedAppointment` filters `$or: [{ technicianId }, { technicianId: null }]`). But **no code anywhere writes `appointment.technicianId`** — `createAppointmentUnlocked` only copies `input.technicianName`, and `updateAppointment` only patches `technicianName`. Every appointment has `technicianId: null`, which the filter treats as "unassigned and therefore visible".

Net effect: the scoping I shipped is inert. A technician still sees the whole board. The tests pass because they set `technicianId` directly in fixtures — they proved the filter works, not that anything populates it.

*Fix:* write `technicianId` on create and update, accept it in the booking modal, and backfill by matching `technicianName`. **~4 hours.** This is a prerequisite for Day 17–20.

### BUG-C — Replying "YES" to a reminder can book a duplicate appointment
`backend/src/services/communication.service.ts` line 242:
```ts
const optInKeywords = ['START', 'UNSTOP', 'YES'];
```
"YES" is consumed as an SMS **opt-in**, notes are appended, and execution *continues* — it does not return. If the customer has an open lead-recovery record, `LeadRecoveryService.handleInboundCustomerReply` matches `/(?:yes|sure|book|...)/i` and **books a brand-new appointment for tomorrow 10:00**, then texts a confirmation.

So a customer confirming an existing appointment can be given a second one.

*Fix:* remove `YES` from opt-in keywords (`START`/`UNSTOP` are the carrier-standard ones); make appointment confirmation an explicit keyword on Day 13. **~1 hour.** Needs a test.

### BUG-D — The "Dispatch Route Map" is entirely fabricated
`frontend/app/app/appointments/page.tsx` lines 865–1017. A "32% Drive-Time Saved" badge, `38.4 Miles`, `1 hr 14 mins`, `+$64 / Day Saved`, three hardcoded pins (North Dallas / Addison / Plano), a literal `Coordinates: 32.7767° N, 96.7970° W`, invented leg times (`'Depot ➔ Stop 1 (12 mins)'`), and three invented customers shown when there is no data. The "Dispatch Route to Techs" button calls no API — it only fires a toast claiming the route was sent.

This is exactly the class of fabricated data removed everywhere else in the product. It should not survive to a demo.

*Fix now:* replace with an honest "not available yet" placeholder, same as `/app/settings/locations`. **~1 hour.** Day 20 builds the real thing.

### BUG-E — Customer list sends a filter the backend silently drops
`frontend/app/app/customers/page.tsx` sends `query.propertyType`; `CustomerService.getCustomers` has no such filter, so it is discarded and the dropdown does nothing. The status dropdown also offers `lead`, which is not in the Customer status enum (`active|inactive`).

*Fix:* remove both controls now; Day 15 replaces them with filters that work. **~1 hour.**

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

Subtotal: **22.5 days** of feature work + **1.5 days** of Day 0 = **24 days**.

---

## 4. Day-by-day plan

Ordering logic: Day 0 defects first. Then the **notification spine** (#38/#39/#41), because it is the only group with a hard internal dependency and it is what a launched customer notices first. Then data foundations (#10/#13), then pricing (#42), then the two heavy UI features (#14/#18) last — they are the most visible but the least likely to lose a customer if unfinished.

### Days 1–2 · Day 0 defects
- **Day 1** — BUG-A ($189 invoice) with a test; BUG-B (`technicianId` write path + backfill script) with a test.
- **Day 2 (half)** — BUG-C (`YES` keyword) with a test; BUG-D (mock route map → honest placeholder); BUG-E (dead filters removed). Commit.

### Days 2–5 · Feature 38, part 1: email becomes real
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

### Days 6–7 · Feature 39: customers can confirm or reschedule by reply
- **Day 6** — Inbound reply handling. Reminder copy changes to instruct explicitly (`Reply C to confirm, R to reschedule`) — the current text says "let us know if you need to reschedule" with nothing that parses such a reply. Add a keyword branch *before* the opt-in check that resolves the customer's next appointment and stamps `confirmedByCustomerAt`. Send an acknowledgement.
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
Day 1 and Day 14. Day 1 fixes an invoice that bills the wrong amount and a scoping guard that silently does nothing. Day 14 is the pricing extraction every other pricing change depends on. Both are money or correctness, not polish.

---

## 6. Dependencies, in order

```
BUG-B (technicianId)  ──▶ Day 17 (technician lanes) ──▶ Day 20 (assignment)
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
