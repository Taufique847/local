# 🐛 BlueCollar AI — Comprehensive QA Bug Report & Edge-Case Audit

**Date:** September 24, 2026  
**Auditor:** QA / Senior Test Engineer (Antigravity Agent)  
**Testing Methodology:** Multi-angle 360° stress testing ("aage, pichhe, upar, niche, side") covering concurrency, boundary values, negative inputs, schema mismatches, unescaped regex/ReDoS, TCPA/legal risks, and cross-module inconsistencies.  
**Constraint Enforced:** Read-only inspection; zero application code was modified.

---

## 📊 Summary of Findings

| ID | Severity | Category | Bug Summary | User Impact |
|---|---|---|---|---|
| **BUG-01** | 🔴 Critical | Mobile Worker / Billing | Parts logged in Worker PWA billed at $0.00 / 400 error | **100% loss on materials** or blocked job completion |
| **BUG-02** | 🔴 Critical | Notifications / Money | Homeowner never receives invoice SMS/Email on field completion | **Invoices silently dropped** due to Mongoose CastError |
| **BUG-03** | 🟠 High | Security / API Stability | Unescaped regex crashes 10 search endpoints with 500 errors | **ReDoS vulnerability & 500 crashes** on special chars like `(` or `+` |
| **BUG-04** | 🟠 High | Booking / Scheduling | Inverted appointments (`endAt < startAt`) accepted without validation | Corrupts calendar and **bypasses conflict detection** |
| **BUG-05** | 🟠 High | Scheduling / Capacity | Overbooking possible when booking specific technician alongside unassigned jobs | Crew capacity exceeded; **double-booking occurs** |
| **BUG-06** | 🟠 High | Voice AI Receptionist | AI fails on first booking for new business due to invalid enum `'repair'` | **AI call crashes** and customer cannot book |
| **BUG-07** | 🟠 High | Compliance / TCPA | Lead recovery drips calculate quiet hours against current time and server timezone | **TCPA violation**: texts sent at 2 AM local time ($500–$1,500 fine) |
| **BUG-08** | 🟡 Medium | Team / RBAC | Promoting member to technician bricks account in 409 error | Technician cannot use `/worker` PWA; no link mechanism |
| **BUG-09** | 🟡 Medium | API Validation | Service routes (`POST /api/services`, `PATCH /api/services/:id`) lack Zod validation | Unsanitized payloads reach database |
| **BUG-10** | 🟡 Medium | Campaigns / Performance | Bulk campaign sends up to 500 messages synchronously in HTTP handler | **504 Gateway Timeout** & duplicate blasts on retry |
| **BUG-11** | 🟡 Medium | Scheduling | Overnight/24-7 business hours (`openTime > closeTime`) rejected | Night emergency bookings incorrectly blocked |
| **BUG-12** | 🟢 Low-Med | Customer 360 | Customer 360 drawer completely ignores Invoices and Estimates | Owner sees incomplete financial history and guessed LTV |

---

## 🔍 Detailed Bug Reports

---

### 🔴 BUG-01: Parts Logged in Worker PWA Billed at $0.00 or Throws 400 Error

* **Files Affected:**
  * `frontend/app/worker/page.tsx` (Line 215–220)
  * `backend/src/models/appointment.model.ts` (Line 177–184)
  * `backend/src/services/worker.service.ts` (Line 289–296)
  * `backend/src/services/pricing.service.ts` (Line 124–126)

#### Condition Tested:
A field technician opens `/worker`, selects a job, adds a part (e.g. "Capacitor", Qty: 1, Cost: $150), and clicks "Complete Job & Bill".

#### What Happens (Actual Behavior):
1. In `frontend/app/worker/page.tsx`:
   ```typescript
   const newPart = {
     partName: newPartName,
     partNumber: `BC-PRT-...`,
     quantity: Number(newPartQty),
     unitPrice: Number(newPartCost), // <-- Frontend sends "unitPrice"
   };
   ```
2. In `appointment.model.ts`:
   ```typescript
   partsUsed: [{
     partName: { type: String, required: true },
     quantity: { type: Number, default: 1 },
     unitCost: { type: Number, default: 0 }, // <-- Schema expects "unitCost"
     totalCost: { type: Number, default: 0 },
   }]
   ```
   Because the property is named `unitPrice`, Mongoose drops it and falls back to default `unitCost: 0`.
3. In `worker.service.ts`:
   ```typescript
   for (const part of apt.partsUsed) {
     items.push({
       description: `Part: ${part.partName}`,
       quantity: part.quantity,
       unitPrice: part.unitCost, // <-- Reads 0!
     });
   }
   ```
4. **Result:** The invoice is generated with `$0.00` for all parts used. The contractor loses all revenue for physical materials. If `unitCost` is undefined on non-Mongoose objects, `PricingService.quote` throws `400: Line item "Part: ..." has an invalid price`, completely preventing job completion.

---

### 🔴 BUG-02: Silent Notification Failure on Field Job Completion (Mongoose CastError)

* **Files Affected:**
  * `backend/src/services/worker.service.ts` (Line 115, 339, 366)
  * `backend/src/services/notification.service.ts` (Line 191, 317)
  * Verified live in Vitest stderr: `tests/money/job-invoice-pricing.test.ts`

#### Condition Tested:
Technician completes an appointment via `WorkerService.completeJobAndGenerateInvoice`.

#### What Happens (Actual Behavior):
1. `worker.service.ts` line 115 queries the appointment with `.populate('customerId')`.
2. When creating the invoice:
   ```typescript
   const invoice = await Invoice.create({
     customerId: apt.customerId, // Passes the full POPULATED customer object
     ...
   });
   ```
3. The in-memory `invoice` object retains `invoice.customerId` as `{ _id: ..., firstName: '...', address: {...} }`.
4. `NotificationService.notifyInvoice(invoice, 'invoice_issued')` is invoked:
   ```typescript
   customerId: String(invoice.customerId), // Evaluates to stringified "[object Object]" or full object dump
   ```
5. Inside `NotificationService.send`:
   ```typescript
   const customer = await Customer.findOne({
     _id: recipient.customerId, // Mongoose attempts to cast the entire stringified object into an ObjectId
     businessId,
   });
   ```
6. **Error Thrown:**
   `Cast to ObjectId failed for value "{\n address: { street: ... } ...}" at path "_id" for model "Customer"`
7. Caught by `catch` in `notifyInvoice`. Returns `{ sentAny: false }`.
8. **Result:** Homeowner NEVER gets the SMS or email with the bill or payment link after field work is done!

---

### 🟠 BUG-03: Unescaped Regex / ReDoS Crash across 10 Search Endpoints

* **Files Affected:**
  * `backend/src/services/service.service.ts` (Line 87, 138, 215)
  * `backend/src/services/lead.service.ts` (Line 190)
  * `backend/src/services/invoice.service.ts` (Line 130)
  * `backend/src/services/estimate.service.ts` (Line 149)
  * `backend/src/services/appointment.service.ts` (Line 588, 614)
  * `backend/src/services/call.service.ts` (Line 68)
  * `backend/src/services/knowledge-base.service.ts` (Line 157, 199)
  * `backend/src/services/ai-tools/tool.registry.ts` (Line 90)

#### Condition Tested:
User or caller searches for a query containing regex tokens, such as `(` or `[` or `*` or `+` (e.g., `GET /api/services?search=Tune-up (Spring)` or customer name containing `(`).

#### What Happens (Actual Behavior):
The code directly executes:
```typescript
const regex = new RegExp(query.search.trim(), 'i');
```
Because the input string is not sanitized with `escapeRegex`, Node.js throws:
`SyntaxError: Invalid regular expression: /(/: Unterminated group`
This unhandled exception bubbles up and terminates the request with a **500 Internal Server Error**. Additionally, polynomial regex strings like `(a+)+$` can trigger catastrophic backtracking (ReDoS), locking the single-threaded Node.js event loop.

---

### 🟠 BUG-04: Inverted Time Appointment Creation (`endAt < startAt`) Allowed

* **Files Affected:**
  * `backend/src/validation/schemas.ts` (Line 418–429)
  * `backend/src/services/appointment.service.ts` (Line 168–230)

#### Condition Tested:
Caller invokes `POST /api/appointments` with:
```json
{
  "customerId": "6ab4e8aaace6e834af7a003c",
  "serviceId": "6ab4e8aaace6e834af7a0040",
  "startAt": "2026-10-01T15:00:00.000Z",
  "endAt": "2026-10-01T14:00:00.000Z"
}
```

#### What Happens (Actual Behavior):
1. `createAppointmentSchema` does not include `.refine((data) => !data.endAt || data.endAt > data.startAt)` (which was added to `rescheduleAppointmentSchema`, but omitted here).
2. In `appointment.service.ts`, `isWithinBusinessHours` checks start and end time minutes against open/close without validating chronological order.
3. Conflict check runs:
   ```typescript
   startAt: { $lt: endAt }, // 15:00 < 14:00 -> FALSE
   endAt: { $gt: startAt }, // 14:00 > 15:00 -> FALSE
   ```
   The query matches 0 documents.
4. **Result:** Appointment is successfully created with `startAt = 15:00` and `endAt = 14:00`. It corrupts schedule views and can never be detected by conflict formulas.

---

### 🟠 BUG-05: Capacity Overbooking When Booking Specific Technician

* **Files Affected:**
  * `backend/src/services/availability.service.ts` (Line 70–84)

#### Condition Tested:
* Business has 2 active technicians (Crew size = 2).
* 2 appointments already exist at 10:00–11:00 with `technicianId: null` (unassigned).
* A new booking comes in for 10:00–11:00 specifically assigning `technicianId: Tech_A`.

#### What Happens (Actual Behavior):
1. `AvailabilityService.checkSlotConflictDetailed` branches on `if (options.technicianId)`:
   ```typescript
   if (options.technicianId) {
     const clash = await Appointment.findOne({ ...overlap, technicianId: options.technicianId });
     if (!clash) return { conflict: false };
   }
   ```
2. Because Tech A has no jobs explicitly assigned to their ID (the existing 2 jobs are unassigned), `clash` is `null`.
3. The conflict check reports `{ conflict: false }`.
4. **Result:** The 3rd booking succeeds. A 2-person crew now has 3 concurrent jobs booked at 10:00 AM. Unassigned appointments are completely ignored during named technician conflict checks.

---

### 🟠 BUG-06: Voice AI Receptionist Crashes on New Business Booking (Invalid Category Enum)

* **Files Affected:**
  * `backend/src/services/ai-tools/tool.registry.ts` (Line 249–256)
  * `backend/src/models/service.model.ts` (Line 34–44)

#### Condition Tested:
An inbound phone call reaches the AI receptionist for a new contractor who has not manually added any custom services to their catalog yet. The customer says "I want to book an appointment".

#### What Happens (Actual Behavior):
1. `tool.registry.ts` executes `book_appointment`:
   ```typescript
   const defaultService = await Service.findOne({ businessId: ctx.businessId });
   if (!defaultService) {
     const newService = await Service.create({
       businessId: ctx.businessId,
       name: 'HVAC Diagnostic & Repair',
       durationMinutes: 60,
       startingPrice: 99,
       category: 'repair', // <-- INVALID ENUM VALUE!
     });
   }
   ```
2. In `service.model.ts`, `category` enum strictly allows:
   `['Cooling', 'Heating', 'Maintenance', 'Installation', 'Indoor Air Quality', 'Ductwork', 'Emergency', 'Other']`.
3. Mongoose throws validation error:
   `ValidationError: \`repair\` is not a valid enum value for path \`category\``.
4. **Result:** The tool execution fails with `{ ok: false }`, and the AI tells the caller that an error occurred and cannot complete the booking.

---

### 🟠 BUG-07: TCPA Quiet Hours Violation in Lead Recovery Drips

* **Files Affected:**
  * `backend/src/services/lead-recovery.service.ts` (Line 22–31)
  * `backend/src/services/communication.service.ts` (Line 33–47)

#### Condition Tested:
A caller hangs up at 6:00 PM without booking. Step 2 drip is scheduled for 4 hours later (10:00 PM local time).

#### What Happens (Actual Behavior):
1. `calculateTcpaSafeFollowUp` runs at 6:00 PM:
   ```typescript
   public static calculateTcpaSafeFollowUp(targetDate: Date, timezone: string = 'America/Chicago'): Date {
     const nextSafe = new Date(targetDate);
     if (CommunicationService.isWithinQuietHours(timezone)) { ... }
     return nextSafe;
   }
   ```
2. `CommunicationService.isWithinQuietHours(timezone)` checks `new Date()` (the current time, 6:00 PM), NOT `targetDate` (10:00 PM)!
3. Since 6:00 PM is within daytime hours, `isWithinQuietHours` returns `false`.
4. `targetDate` (10:00 PM) is left unchanged and stored in MongoDB.
5. Furthermore, when `nextSafe.setHours(8, 5, 0, 0)` does execute:
   It uses the server's Node.js timezone (UTC or host OS), NOT the business's timezone (`America/Chicago`). On a UTC server, 8:05 AM UTC is 3:05 AM Chicago time.
6. **Result:** Automated SMS messages can fire at 10 PM or 3 AM local customer time, triggering direct violations of federal TCPA regulations ($500–$1,500 fine per message).

---

### 🟡 BUG-08: Promoting Member to Technician Bricks User Account (409 Error)

* **Files Affected:**
  * `backend/src/validation/schemas.ts` (Line 92–99)
  * `backend/src/services/team.service.ts` (Line 374–412)
  * `backend/src/controllers/worker.controller.ts` (Line 40–45)

#### Condition Tested:
Owner invites a staff member as "Dispatcher", then later goes to Settings -> Team and edits their role to "Technician".

#### What Happens (Actual Behavior):
1. `updateMemberSchema` only accepts `{ businessRole, isActive }`. It does not accept `technicianId`.
2. `team.service.ts` updates `member.businessRole = 'technician'`, while `member.technicianId` remains `null`.
3. The employee logs in and opens the Worker Mobile App (`/worker`).
4. `worker.controller.ts` executes:
   ```typescript
   if (req.businessRole === 'technician') {
     if (!req.user?.technicianId) {
       throw new AppError(
         'Your account is not linked to a technician record yet. Ask your manager to set this up.',
         409
       );
     }
   }
   ```
5. **Result:** Technician is completely locked out of the app with HTTP 409. There is no endpoint or UI field for the manager to link an existing user to a technician record.

---

### 🟡 BUG-09: Missing Validation Middleware on Service Routes

* **Files Affected:**
  * `backend/src/routes/service.routes.ts` (Line 13–15)

#### Condition Tested:
Client submits malformed payload to `POST /api/services` or `PATCH /api/services/:id`.

#### What Happens (Actual Behavior):
Unlike appointment, customer, lead, and invoice routes which use `validateBody(...)`, `service.routes.ts` defines:
```typescript
router.post('/', ServiceController.createService as any);
router.patch('/:id', ServiceController.updateService as any);
router.patch('/:id/status', ServiceController.updateServiceStatus as any);
```
No Zod schema validates the request body. Invalid types, negative prices, or malformed categories pass directly to Mongoose, leaking internal database error messages.

---

### 🟡 BUG-10: Synchronous Bulk Campaign Processing Causes 504 Timeout

* **Files Affected:**
  * `backend/src/services/customer-segment.service.ts` (Line 303–331)

#### Condition Tested:
Owner creates an SMS/Email campaign targeting an audience of 500 customers (`MAX_CAMPAIGN_RECIPIENTS = 500`) and clicks "Send Campaign".

#### What Happens (Actual Behavior):
1. `sendCampaign` runs a sequential loop:
   ```typescript
   for (const recipient of recipients) {
     const outcome = await NotificationService.send(...);
   }
   ```
2. 500 sequential network requests to Twilio / SendGrid take ~150–250 seconds.
3. Standard reverse proxies (Cloudflare, Nginx, ALB) timeout after 30–60 seconds, returning HTTP 504 Gateway Timeout.
4. The client UI displays an error. The owner clicks "Send" again, triggering duplicate marketing messages and doubling communication costs.

---

### 🟡 BUG-11: Overnight / 24-7 Business Hours Block Valid Bookings

* **Files Affected:**
  * `backend/src/services/availability.service.ts` (Line 174–185)

#### Condition Tested:
An emergency home services business configures operating hours spanning overnight (e.g., 8:00 PM to 4:00 AM, `openTime: "20:00"`, `closeTime: "04:00"`). A customer books for 10:00 PM (22:00).

#### What Happens (Actual Behavior):
1. `parseTimeOfDay` yields: `open = 1200` (20:00) and `close = 240` (04:00).
2. For an appointment ending at 23:00 (1380 mins):
   ```typescript
   if (endMinutes > close) // 1380 > 240 evaluates to TRUE!
   ```
3. Returns `{ ok: false, reason: "That appointment would finish after you close..." }`.
4. **Result:** Legitimate evening appointments for 24-hour / night-shift emergency contractors are rejected.

---

### 🟢 BUG-12: Customer 360 View Ignores Real Invoices and Estimates

* **Files Affected:**
  * `backend/src/services/customer-360.service.ts` (Line 70–87, 178–187)

#### Condition Tested:
Owner opens `/api/customers/:id/360` to view full relationship history for a customer with multiple paid invoices.

#### What Happens (Actual Behavior):
1. Line 70 fetches: `Promise.all([CallLog, Lead, Appointment, CommunicationLog])`.
2. `Invoice` and `Estimate` collections are never queried.
3. Lifetime Value (LTV) calculation:
   ```typescript
   if (calculatedLtv === 0) {
     for (const appt of appointments) {
       if (appt.status === 'completed') {
         calculatedLtv += (appt.serviceId as any)?.startingPrice || 120;
       }
     }
   }
   ```
4. **Result:** Customer 360 timeline displays zero billing events, invoices, or quotes. If `customer.lifetimeValue` is not pre-cached, it invents a rough estimate using appointment starting prices instead of real money paid.

---

## 📋 Recommended Action Plan

1. **Fix BUG-01 immediately:** Change `frontend/app/worker/page.tsx` line 219 from `unitPrice: Number(newPartCost)` to `unitCost: Number(newPartCost)` (or support both in `worker.service.ts`).
2. **Fix BUG-02 immediately:** In `notification.service.ts` and `worker.service.ts`, ensure `recipient.customerId` is extracted via `(invoice.customerId as any)?._id || invoice.customerId` so ObjectIds are stringified cleanly instead of stringifying the entire document object.
3. **Wrap all regex search inputs:** Use `escapeRegex(query)` across `service.service.ts`, `lead.service.ts`, `invoice.service.ts`, `estimate.service.ts`, and `knowledge-base.service.ts`.
4. **Add refinement to `createAppointmentSchema`:** Add `.refine((data) => !data.endAt || data.endAt > data.startAt)`.
5. **Correct AI tool category enum:** In `tool.registry.ts` line 254, change `'repair'` to `'Other'` or `'Maintenance'`.
6. **Timezone-aware quiet hours calculation:** Refactor `calculateTcpaSafeFollowUp` to test `targetDate` in the business's timezone using `zonedParts` instead of evaluating `new Date()` in the server's local time.
