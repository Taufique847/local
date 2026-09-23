# BlueCollar AI — Project Status aur Production Roadmap
> **Target Launch: 10 December**
> **Last verified:** 23 September 2026, actual code padh kar (`backend/src`, `frontend/app`, `backend/tests`) — sirf plan docs pe trust nahi kiya gaya.
> Ye file `README.md`, `ADVANCED_AUTOMATIONS_ROADMAP.md`, `EXISTING_7_FEATURES_IMPROVEMENT_PLAN.md`, aur `targetFeaturesIdea.md` — sabko cross-check karke bani hai. Doosre docs ko delete nahi kiya gaya, ye unka consolidated aur verified summary hai.
>
> Feature-by-feature ka authoritative count `FINAL.md` me hai (table rows ginke derive kiya gaya), aur jo adhoora hai uska day-by-day plan `partial.md` me. Ye file unka roadmap-level view hai.

---

## 0. Overall Progress Estimate

| Bucket | % of total product vision (`targetFeaturesIdea.md` ke 86 features ke hisaab se) |
|---|---|
| **Fully built aur verified** | **36 of 86 (~42%)** |
| **Partially built** (usable, incomplete) | **5 of 86 (~6%)** |
| **Not started** | **45 of 86 (~52%)** |
| **Weighted** (built = 1, partial = 0.5 → 36 + 2.5 = 38.5/86) | **~45%** |

> **Is file me pehle ~18-20% likha tha.** Wo 22 September ka estimate tha aur us waqt sahi tha.
> Uske baad: security baseline poora hua (RBAC, password reset, email verification, token
> revocation, 377-test suite), customer-facing email aur appointment reminders bane, reply
> handling, per-business templates, structured equipment/property data, aur kaam karne wale
> segments + campaigns. Saath me **23 real defects** fix hue — zyada tar aise jo chup-chaap galat
> kaam kar rahe the, error nahi de rahe the.
>
> Number guess nahi kiya gaya — `FINAL.md` ke table me ✅ aur 🟡 rows ginke nikala gaya hai, aur
> weighting formula wahan inline likha hai taaki check kiya ja sake.

Ye estimate isliye realistic hai kyunki `targetFeaturesIdea.md` ek **full enterprise SaaS platform** (jaise ServiceTitan) describe karta hai — multi-location, Super Admin control center, QuickBooks, calendar sync, route optimization, Stripe Connect payouts, WhatsApp, competitor benchmarking, etc. Jo bana hai wo core AI-receptionist + CRM/ops slice hai plus uske upar ka customer-communication layer — solid hai, lekin enterprise scaffolding ka bada hissa baaki hai.

### Ab sabse bada blocker kya hai

Teen cheezein, aur teeno **code ki nahi, config ki** hain:

1. **Voice pipeline ne ek bhi real call handle nahi kiya.** Compile hota hai, protocol kaam sahi hai, `/api/health/ready` provider readiness batata hai — par end-to-end audio kabhi confirm nahi hua. Project ki sabse important unverified cheez.
2. **`EMAIL_API_KEY` set nahi hai**, to ek bhi email actually nahi gaya. Production me har email path `CommunicationLog` me `status: 'failed'` + `errorCode: 'email_not_configured'` likhta hai — silence **dikhti** hai, chhupti nahi. Key set karne ke baad kuch aur badalna nahi padega.
3. **`STRIPE_SECRET_KEY` set nahi hai**, to billing simulation mode me hai — koi real card payment nahi liya gaya.

---

## 1. ✅ Kya Ban Chuka Hai (verified against code)

### 1.1 Core Platform (solid, real, production-candidate)
| Feature | Status | Evidence |
|---|---|---|
| Signup/login, bcrypt password hashing, JWT httpOnly cookie | ✅ Real | `auth.controller.ts`, `auth.middleware.ts` |
| Per-business data scoping (tenant isolation via owner→business lookup) | ✅ Real, but simple | `BusinessService.getBusinessByOwnerId` pattern across controllers |
| Twilio telephony — number search/buy, TwiML, signature verification | ✅ Real | webhook + phone-number controllers |
| Bidirectional Media Streams voice engine (Deepgram STT+TTS, OpenAI tool-calling, μ-law barge-in) | ✅ Real, **not tested on live calls** | `voice/` services |
| AI tool-calling (7 tools: lookup, availability, book, SMS, transfer, KB search) with guardrails | ✅ Real | `ai-tools/` |
| Missed-call recovery: 3-step SMS drip, TCPA quiet hours, STOP/START, conversational SMS booking | ✅ Real, driven by real cron | `jobs/scheduler.ts`, `lead-recovery.*` |
| CRM: customers, leads, services, appointments, availability, technicians, service zones | ✅ Real CRUD | `models/`, `controllers/` |
| Reputation: delayed CSAT SMS, 4-5★→Google link, 1-3★ shielded + escalated, 24h SLA sweep | ✅ Real | `review.controller.ts`, `review-reputation.service.ts` |
| Estimates/invoices: line items, tax, e-signature, share-token portal, Stripe Checkout | ✅ Real | `estimate.*`, `invoice.*`, `portal.controller.ts` |
| Stripe **subscription** billing: plans, trial, usage metering, Billing Portal | ✅ Real | `billing.controller.ts`, `billing.service.ts` |
| Worker PWA: job list, real GPS check-in, real camera photo capture, checklist, job→invoice | ✅ Real | `frontend/app/worker/page.tsx` |
| Background jobs: drip follow-ups, review surveys, SLA sweeps, trial expiry (single-instance cron) | ✅ Real | `jobs/scheduler.ts` |
| Dispatch: zip-code zone matching, technician skill matching, dispatch SMS with static Google Maps link | ✅ Real, basic | `dispatch.controller.ts`, `technician-dispatch.service.ts` |
| AI Knowledge Base + guardrail settings UI | ✅ Real | `frontend/app/app/settings/page.tsx` |
| Customer-facing portal (quote approval, invoice view/pay via share token) | ✅ Real | `frontend/app/portal/` |

### 1.2 Explicitly Honest Placeholders (already marked, not hidden)
- `/app/settings/locations` — UI shows "not ready" message. No branch/location model exists at all.
- `/app/settings/integrations` — UI shows "not ready" message. No calendar OAuth exists at all.

These do you credit — wo fake data dikhane ke bajaye honestly bol rahe hain "not built yet."

---

## 2. ❌ Kya Bana Nahi Hai (verified gaps — sab code padh kar confirm kiya)

### 2.1 Security & Auth — ✅ **ab ye section poora ho gaya, ek item chhod ke**

Is section me pehle nau gaps the. Aath band ho gaye:

| Tha | Ab |
|---|---|
| ~~RBAC / staff roles enforce nahi hote~~ | ✅ Do independent axes: `role` ('user' \| 'admin') platform endpoints gate karta hai, `businessRole` ('owner' \| 'dispatcher' \| 'technician') tenant endpoints. Dono **database se per request** padhe jaate hain, token se nahi — isliye demotion agle call pe lag jaata hai, token expiry pe nahi. Staff email invitation se join karte hain; billing aur team owner-only; technician sirf apne jobs dekhta hai. |
| ~~No password reset~~ | ✅ Single-use, expiring token. Response **hamesha 200** deta hai, chahe email exist kare ya na kare — warna wahi endpoint account-enumeration oracle ban jaata hai. |
| ~~No email verification~~ | ✅ Single-use, expiring. `REQUIRE_EMAIL_VERIFICATION` se gate hota hai. |
| ~~No refresh tokens / revocation~~ | ✅ Short-lived access token jisme `tokenVersion` hota hai (middleware har request pe check karta hai), aur rotating refresh token with **reuse-as-theft detection** — reuse detect hua to poori session family drop. |
| ~~No email sending capability at all~~ | ✅ `EmailService` (Resend, `EMAIL_PROVIDER` ke peeche provider-agnostic) + poora `NotificationService` layer. **Lekin `EMAIL_API_KEY` set nahi hai**, to abhi tak ek bhi email actually gaya nahi — dekho section 0. |
| ~~No call-recording consent disclosure~~ | ✅ `BusinessPolicy.aiDisclosureEnabled`, **default ON**. Kai US states all-party consent hain aur synthetic-voice disclosure ka requirement badh raha hai, to safe default announce karna hai. Band karna ek deliberate decision hona chahiye. |
| ~~No data retention policy~~ | ✅ Nightly `data_retention` sweep. `DATA_RETENTION_DAYS` **default `0` (off)** — jaan-boojh ke, taaki naye build ka pehla boot operator ke existing records delete karna shuru na kar de. |
| ~~No automated tests anywhere~~ | ✅ **377 tests, 18 files, CI me.** Real in-process MongoDB ke against, mocked models ke nahi — kyunki jo cheezein ye tests protect karte hain wo zyada tar query filters hain (`findOne({_id, businessId})` vs `findById(_id)`), aur mocked model vulnerable version ko bhi khushi se "pass" kar deta. 141 mutations lagaye, 139 pakde gaye — dono survivors redundant tenant clauses the jinke load-bearing jode pakde gaye, aur code me wahin document kar diye gaye. |

**Sirf ye bacha hai:**

| Gap | Risk if launched without it |
|---|---|
| **No MFA** | Account takeover risk, especially since payment/billing data hai. Ek hi security item hai jo abhi bhi missing hai. |

Do naye security-relevant cheezein jo is section me pehle nahi thi:

- **Media-stream WebSocket ab authorised hai.** Twilio WS upgrade ko sign nahi karta, to `/api/voice/media-stream` ka koi auth hi nahi tha — koi bhi connect karke call state inject kar sakta tha. Ab `<Stream>` URL me single-use HMAC token jaata hai, jo wahan mint hota hai jahan Twilio signature ne already authenticate kar liya hai. `from`/`to` bhi signed token ke **andar** move kar diye gaye, kyunki `<Parameter>` customParameters pe bharosa karna hi wo vulnerability thi.
- **Gate codes plain text me store hote hain.** `Customer.property.gateCode` ek physical access credential hai jo kisi bhi staff login se padha ja sakta hai. Customer-facing channel se poori tarah excluded hai aur sirf assigned technician ke dispatch text me jaata hai, par field-level encryption ke liye key management chahiye jo abhi nahi hai. Model me flag kiya gaya hai.

### 2.2 Billing / Payments
| Gap | Detail |
|---|---|
| **Stripe Connect (marketplace payouts) not built** | Sirf subscription billing hai (BlueCollar aapse charge karta hai). Contractor ke apne customer se invoice payment collect karna abhi **live nahi** unless Stripe configured per-business — no Connect account, no payout flow. |
| **Card surcharge / cash discount toggle** | Nahi bana. (Note: legally state-by-state regulated, review chahiye before building.) |

### 2.3 Dispatch & Operations — mostly still open
| Gap | Detail |
|---|---|
| **Real route optimization** | Sirf zip-code zone matching hai. Koi geocoding provider nahi, kisi bhi record pe coordinates nahi, koi routing nahi. `findOptimalTechnician` exist karta hai par uska result kisi ko return nahi hota aur kahin persist nahi hota; matcher technician ka `status` aur skills bilkul ignore karta hai. |
| **In-app map view** | Sirf static Google Maps link technician ke SMS me. Dashboard pe koi map nahi. Appointments page pe pehle ek **fabricated** route map tha ("32% Drive-Time Saved", "38.4 Miles", "+$64 / Day Saved", teen invented customers, hardcoded Dallas pins) — wo hata diya gaya aur uski jagah honest "not available" panel hai. |
| **Double-booking conflict warning in UI** | Backend ab conflict refuse karta hai (per-business distributed lock ke saath), par calendar UI booking se pehle warn nahi karta. |
| **Per-technician conflict scoping** | Conflict check **business-wide** hai, per-technician nahi — to paanch technician wala business do concurrent jobs bhi hold nahi kar sakta. `technicianId` ab likha jaata hai, to ye fix karna possible hai; abhi nahi hua. |
| **Calendar timezone + week/month views** | Day-only hourly grid jo `getUTCHours()` se bucket karta hai — kisi bhi non-UTC business ke liye galat. Week/month ka backend range endpoint exist karta hai aur kabhi call nahi hota. Koi drag-and-drop, koi recurrence nahi. |
| **Mileage / expense tracking** | Worker PWA me sirf parts cost hai, mileage/reimbursement bilkul nahi. |

**Jo is section me ab ban gaya:**

- **Technician assignment actually persist hoti hai.** `Appointment.technicianId` ko pehle **kuch bhi nahi likhta tha** — sirf free-text `technicianName`. Isliye har appointment `technicianId: null` leke ghoomta tha aur field app ka per-technician job scoping chup-chaap sab kuch match kar leta tha. Ab booking modal me picker hai, service tenant-scoped resolve karta hai, aur purane records ke liye backfill script hai (ambiguous matches ko jaan-boojh ke skip karta hai, guess nahi karta).
- **Dispatch text ab structured fields padhta hai** — real gate code, access notes, pets, aur real equipment. Pehle "Access/Gate" line loop me jo aakhri `instruction` memory milti thi wahi thi, aur recipient number **customer ka** default hota tha.

### 2.4 Reviews & Reputation
| Gap | Detail |
|---|---|
| **Google Business Profile API integration** | Nahi hai — sirf ek manually-set static Google review URL pe SMS redirect karta hai. Koi OAuth, koi real review fetch/reply automation nahi. |
| **AI review reply drafts** | Nahi bana. |
| **Review analytics/trends dashboard** | Nahi bana. |

### 2.5 Calendar & Integrations
| Gap | Detail |
|---|---|
| **Google/Outlook calendar sync** | Zero code exists — no OAuth client, no token storage, no sync worker. |
| **QuickBooks integration** | Nahi bana. |
| **Zapier / outbound webhooks for 3rd parties** | Nahi bana — sirf inbound webhooks (Twilio, Stripe) hain. |

### 2.6 Multi-tenancy Scale
| Gap | Detail |
|---|---|
| **Multi-location/branches** | Koi Location/Branch model exist nahi karta. |
| **Super Admin / Platform admin console** | Bilkul nahi bana — tenant management, plan control, feature flags, usage metering, support desk, abuse/fraud controls — sab `targetFeaturesIdea.md` section J (items 68-86) missing hai. |

### 2.7 Frontend Polish (from `EXISTING_7_FEATURES_IMPROVEMENT_PLAN.md`, not yet built)
- Dual-track call waveform (caller vs AI voice)
- 1-click "convert call to appointment"
- Emergency/urgency filter pills on calls table
- PDF transcript export
- Route map view for appointments
- 1-tap "en route" SMS
- Good/Better/Best 3-tier estimate proposals
- Price-lock countdown on quote portal
- Invoice aging badges, 1-click SMS pay link
- Print letterhead layout for invoices

### 2.8 Bigger Vision Items (from `targetFeaturesIdea.md`, mostly untouched)
- WhatsApp / other messaging channels — SMS aur email dono real channels hain ab; WhatsApp nahi
- Workflow automation builder (trigger/condition/delay/action)
- Customer segmentation, lost-lead campaigns beyond current drip — 🟡 **mostly ban gaya.** Saved `CustomerSegment` records with live (never cached) counts, filters on tags in/all/none, lifetime value, last service date, never-serviced, property type aur equipment brand. Campaigns per recipient `NotificationService` se jaate hain, to quiet hours aur SMS opt-out wahi code enforce karta hai jo baaki sab kuch — aur campaign **text** opt-out notice ke bina refuse hota hai. 500 recipients ka cap blast-radius limit ke taur pe. **Ek gap bacha hai: email-consent flag nahi hai**, to marketing email se customer unsubscribe nahi kar sakta. Transactional email is requirement se exempt hai, campaign nahi — to email channel pe campaign bhejne se pehle ye fix karna chahiye.
- Weekly AI business insights report
- Competitor benchmark
- Testimonial/social content drafts
- Website review widget
- Full audit logging system
- Feature flags / controlled rollout system
- Data privacy/compliance center (export, deletion, legal hold)

---

## 3. 🎯 10 December Launch ke liye Priority Plan

Aapke paas ~2.5 mahine hain. Sab kuch banana possible nahi hai — is roadmap ka goal hai **"production-safe MVP+"** launch karna, na ki poora `targetFeaturesIdea.md` complete karna.

### Phase A — Non-negotiable before ANY production traffic (Security/Legal baseline)

**Phase A ab 6 of 7 done hai.** Sirf item 7 bacha hai, aur wahi sabse important hai.

1. ~~Email sending service add karo~~ — ✅ `EmailService` (Resend). Key abhi set nahi hai (section 0).
2. ~~Password reset flow~~ — ✅ single-use, expiring, aur **hamesha 200** deta hai taaki enumeration oracle na bane.
3. ~~Basic RBAC~~ — ✅ do axes, database se per request padha jaata hai. Owner / dispatcher / technician.
4. ~~Call-recording consent disclosure~~ — ✅ `aiDisclosureEnabled`, default ON.
5. ~~Data retention decision + deletion~~ — ✅ nightly sweep, `DATA_RETENTION_DAYS` default off; plus per-customer personal-data erasure jo financial history retain karta hai.
6. ~~Minimum viable automated tests~~ — ✅ overshot: 377 tests, 18 files, CI me. Stripe aur Twilio signature, portal share tokens, tenant scoping, RBAC, token lifecycles, aur job-completion pricing sab covered.
7. **Real call test with live Deepgram + LLM + Twilio credentials.** ⬅ **ABHI BHI PENDING. Ye Phase A ka aakhri item hai aur poore project ki sabse important unverified cheez.**

   Jo chahiye: cloudflared tunnel restart karke naya URL `TWILIO_WEBHOOK_BASE_URL` me daalo, backend restart karo, Twilio console me `+17372508034` ka voice webhook `<tunnel>/api/webhooks/twilio/voice` pe point karo. Twilio trial sirf **verified** numbers pe call karta hai, to `business.phone` verified hona chahiye, aur ek `active` + `isPrimary` `BusinessPhoneNumber` row bhi honi chahiye.

### Phase B — High business value, moderate effort (Revenue-driving polish + advanced automation)

**Phase B me 3 of 10 done ho gaye**, aur 4 naye customer-facing features add ho gaye jo is list me nahi the.

8. Stripe Connect ya per-business Stripe onboarding — abhi bhi blocked, abhi bhi Phase B ka sabse valuable item.
9. Double-booking conflict warning on appointments — backend refuse karta hai, UI warn nahi karta.
10. 1-click "call → appointment" conversion.
11. Emergency/urgency filters on calls table.
12. Good/Better/Best 3-tier estimate proposals — **backend me tiers exist karte hain** (`Estimate.tiers`), UI nahi.
13. 1-click SMS payment reminder + invoice aging badges — invoice ab automatically bhejta hai portal link ke saath, par reminder-on-overdue nahi bana.
14. **AI Post-Call Coaching Summary** — nahi bana. Aaj bhi "AI Summary" outcome pe `if/else` hai, 5 canned strings.
15. ~~**Auto follow-up on unsold estimates**~~ — nahi bana, par ab sasta hai: `estimate_sent` notification aur `appointment_reminders` cron ka shape dono reuse ho sakta hai.
16. **Emergency call triage confidence score** — nahi bana, abhi bhi keyword list hai.
17. ~~**Equipment & Unit Registry data model**~~ — ✅ **ban gaya.** Real `Equipment` model (type, brand, model number, serial, install year, filter size, location, warranty), customer drawer me editable, aur voice prompt + dispatch text dono me inject hota hai. Pre-job brief aur upsell ab isse build ho sakte hain.

**Jo Phase B me nahi tha par ban gaya (aur zyada urgent tha):**

- **Customer-facing email as a real channel.** Booking confirmation, reschedule, cancellation, quote sent, invoice issued, payment receipt — inme se **kisi ka bhi sender nahi tha**. Invoice `status: 'unpaid'` aur ek `shareToken` ke saath ban jaata tha jo sirf owner ki screen pe dikhta tha, to payment portal wahi banda reach hi nahi kar sakta tha jiske liye bana tha.
- **Appointment reminders.** Template exist karta tha, zero callers. Teen hafte pehle booked customer ko van aane tak kuch pata nahi chalta tha.
- **Confirm/reschedule by reply**, aur unmatched inbound SMS ka Action Queue.
- **Per-business message templates** with `{{variable}}` substitution aur SMS opt-out notice enforcement.

### Phase C — Nice-to-have if time remains
18. Basic map view for daily technician routes (even static pins, no full optimization).
19. Mileage/expense tracking in worker PWA.
20. Google Business Profile OAuth (real review fetch, not just static link).
21. **AI Pre-Job Brief for technician** — ✅ dependency (Equipment Registry) ab poori hai, to ye ab straightforward hai.
22. **Smart upsell suggestions during AI call** — ye bhi Equipment Registry pe depend karta tha, jo ab hai.

### Phase D — Explicitly defer past 10 December
- Multi-location/branches
- Super Admin platform console
- Calendar sync (Google/Outlook)
- QuickBooks/Zapier
- MFA
- WhatsApp
- Workflow automation builder
- Competitor benchmarking

Reasoning: Phase D items sab **enterprise scale-out features** hain jo tab zaroori hote hain jab aapke paas multiple paying customers already hain. Ek single-tenant-per-business MVP launch ke liye ye blocking nahi hain — inhe post-launch iterate kar sakte hain real customer feedback ke saath.

---

## 3.5 🚀 Value-Multiplier Features (Advanced Automation — competitive edge)

Ye section sirf "missing feature" list nahi hai — ye wo features hain jo agar banaye jaye to product ServiceTitan/Housecall Pro/Avoca ke level pe compete karega, kyunki inhi cheezon par 2026 me ye companies focus kar rahi hain ([ServiceTitan Field Pro pre-job briefs](https://www.servicetitan.com/blog/webinar-recap-introducing-field-pro), [ServiceTitan AI Virtual Agent](https://www.servicetitan.com/features/pro/virtual-agent), [Housecall Pro AI tools guide](https://www.housecallpro.com/resources/ai-for-home-service-business/)). Content was rephrased for compliance with licensing restrictions.

Sabse badi baat: aapka stack (Deepgram + OpenAI tool-calling + Twilio + Mongoose) already is sab ke liye ready hai — koi naya architecture nahi chahiye, sirf existing pipeline ke upar naye layers hain. Isliye ye "cheap to add, high perceived value" category hain.

### Tier 1 — Sabse zyada ROI, existing pipeline pe direct extend hota hai

| Feature | Kya hai | Kyun value badhti hai | Kaise banega (aapke stack pe) |
|---|---|---|---|
| **AI Post-Call Coaching Summary** | Har call ke baad AI khud analyze kare: customer ne kya chaha, kya objection uthaya, deal close hui ya nahi, agent (AI ya human) ne kya missed kiya. | ServiceTitan Field Pro ka core differentiator yehi hai — "objections, upsell opportunities, closing plan." Contractor ko lagta hai product "sochta" hai, sirf transcribe nahi karta. | Call complete hone par ek extra OpenAI call — existing transcript + summary pipeline ko ek structured-output prompt se extend karo. Naya cron/worker nahi chahiye. |
| **AI Pre-Job Brief for Technician** | Job start hone se pehle technician ko mobile pe ek AI-generated brief mile: customer history, last call ka context, equipment details, likely issue, suggested parts to carry. | Technician zyada prepared jaata hai, first-time-fix-rate badhta hai — ye direct revenue metric hai jo contractors track karte hain. | Customer 360 data (jo already hai) + call transcript ko ek prompt me combine karo, worker PWA me ek naya card dikhao before check-in. |
| **Auto Follow-up on Unsold Estimates** | Estimate 7 din tak accept nahi hua to automatic SMS/reminder trigger ho, bina manual trigger ke. | Ye "automation, not AI" wala low-hanging fruit hai (ServiceTitan ne khud isko highlight kiya as high-impact). Aapke paas already drip-SMS infra hai (lead recovery). | Existing scheduler cron pattern reuse karo — estimate model pe `sentAt` check karke drip bhejo, jaisa lead-recovery karta hai. |
| **Emergency Call Triage + Smart Escalation** | AI call ke dauran hi detect kare ki ye life-safety emergency hai (gas leak, no-heat in freezing weather, flooding) vs routine, aur emergency ko turant human/on-call tech ko ring kare — sirf keyword match nahi, context-aware. | Aapke paas emergency keyword list already hai guardrails me — isko ek confidence-scored triage system banao, jo missed emergency ka liability risk bhi kam karega. | Existing guardrail/tool-calling layer extend karo: ek `assess_urgency` tool add karo jo LLM ko structured urgency score return karne ko kahe. |
| **Smart Upsell/Cross-sell Suggestions on Call** | AI conversation ke dauran customer ke equipment age/type dekh kar relevant maintenance plan ya upgrade suggest kare (e.g., "aapka unit 12 saal purana hai, maintenance plan interested?"). | Average ticket size badhta hai — ye directly contractor ki revenue pe asar karta hai, jo sabse convincing sales pitch hai. | Customer 360 equipment data (jab banega, see Tier 2) + system prompt me conditional upsell rules add karo. |

### Tier 2 — Medium effort, high differentiation

| Feature | Kya hai | Kyun value badhti hai |
|---|---|---|
| ~~**Equipment & Unit Registry per customer**~~ ✅ **BAN GAYA** | Brand, model number, serial, install year, filter size, location, warranty — real `Equipment` model, customer drawer me editable, voice prompt aur dispatch text dono me inject hota hai. Saath me structured `Customer.property` (gate code, access, pets, parking). | Tier 1 ka "pre-job brief" aur "smart upsell" dono ka foundational data model **ab exist karta hai**, to wo do features ab straightforward hain. |
| **Recurring Maintenance Plan Automation** | Customer maintenance plan subscribe kare, system automatically saal me 2 baar appointment suggest kare, reminder bheje, invoice generate kare. | Recurring revenue = predictable revenue. Contractors isko "membership program" bolte hain aur ye unki favorite revenue line hoti hai. |
| **AI-Generated Weekly Business Insights** | Har hafte owner ko ek plain-language report: "Ye hafte 12 calls miss hui thi jo recover hui, $4,200 pending invoices 30+ din se, review response rate 60%." | Owner ko roz dashboard check karne ki zaroorat nahi — AI khud bata deta hai kya dhyan dena hai. Ye "insight as a feature" trend hai jo 2026 me sab bada players push kar rahe hain. |
| **Dynamic/Surge Pricing Suggestion for Emergency Jobs** | Emergency/after-hours job ke liye AI suggest kare ki premium rate lagayein (business ke pre-approved rules ke andar). | Emergency jobs profit margin sabse high hota hai agar sahi price ho — abhi ye manual hai. |
| **Voice Sentiment + Escalation Risk Score** | Har call ka ek "frustration score" ho jo dashboard pe highlight kare kaunsi calls follow-up chahti hain (chahe booked ho gayi ho). | Churn prevention — customer chidha hua tha but appointment book kar liya, to bhi wo negative review de sakta hai. Proactive save karna. |

### Tier 3 — Bigger bets, longer build but strong differentiation

| Feature | Kya hai | Kyun value badhti hai |
|---|---|---|
| **Outbound AI calling for re-engagement** | AI khud purane/inactive customers ko call kare seasonal maintenance reminder ke liye (e.g., "AC service season aa raha hai"). | Ye inbound se opposite hai — proactive revenue generation, jo abhi kisi bhi competitor ka bhi fully-solved problem nahi hai. |
| **Photo-based AI diagnostics assist** | Customer WhatsApp/SMS pe apne unit ki photo bheje, AI rough issue identify kare aur urgency/technician-skill requirement suggest kare before dispatch. | Diagnosis-before-dispatch se right technician first time jaata hai. |
| **Voice biometric returning-caller recognition** | Jab regular customer call kare, AI phone number ke bina bhi voice se recognize kar le (privacy consent ke saath). | Personalization ka next level — "Welcome back Mrs. Smith" bina caller ID pe fully depend kiye. |

---

### Kaunse pehle banayein (10 December ke context mein)

Agar aap "advance automation" se product value badhana chahte ho **without derailing the Dec 10 date**, sabse better ROI-to-effort ratio in cheezon mein hai (Section 3 ke Phase A security work ke saath parallel bhi ho sakta hai kyunki ye alag layer hai):

1. **AI Post-Call Coaching Summary** — sabse kam effort, sabse zyada "wow factor" demo ke liye. Abhi bhi nahi bana: "AI Summary" aaj bhi outcome pe `if/else` hai jo 5 canned strings me se ek chunta hai, `clarityScore` literal `92` hai, aur `sentimentLabel` `'negative'` emit kar hi nahi sakta.
2. **Auto Follow-up on Unsold Estimates** — existing drip infra reuse, naya architecture nahi. Ab pehle se sasta: `estimate_sent` notification aur `appointment_reminders` cron ka claim-then-send shape dono copy kiye ja sakte hain.
3. **Emergency Call Triage confidence score** — safety + liability dono improve karta hai, guardrail system ka natural extension hai.
4. ~~**Equipment Registry**~~ — ✅ **ban gaya.** Isliye #1 ke do dependents (pre-job brief, smart upsell) ab unblocked hain.

**Ek naya item is list me daalne layak hai, aur wo sabse pehle aana chahiye:** call **recording**. `CallLog.recordingUrl` model pe exist karta hai aur usko **kuch bhi nahi likhta** — AI path pe koi `record` nahi, koi recording callback route nahi. Iske do nateeje hain: post-call coaching summary ke liye sirf transcript hai audio nahi, aur agar customer ya regulator audio maange to dene ko kuch nahi hai. Compliance disclosure (`aiDisclosureEnabled`) already default ON hai, to legal side taiyaar hai — capture side nahi.

Baaki Tier 2/3 items post-launch roadmap me daal do — inko "V2 differentiators" ke roop me marketing bhi kar sakte ho ("hum roadmap pe hain AI-driven insights ke saath").

---

## 4. Source Documents Reference

Ye naya document doosre plans ko replace nahi karta, unko organize karta hai:

| Document | Role |
|---|---|
| `README.md` | Ground-truth feature list plus known gaps — hamesha isse verify karo. |
| **`FINAL.md`** | **Feature-by-feature status against all 86 vision items.** Counts table rows ginke derive hote hain, saath likhe nahi jaate — ek purana revision headline aur table ko disagree karta pakda gaya tha. Progress number ke liye ye authoritative hai. |
| **`partial.md`** | Jo adhoora hai uska day-by-day plan, plus jo din poore ho gaye unka honest record (kya bana, plan kahan galat tha, kaun sa guard dead code nikla). |
| `ADVANCED_AUTOMATIONS_ROADMAP.md` | Voice engine + dispatch + reviews ka original design doc (mostly shipped now). |
| `EXISTING_7_FEATURES_IMPROVEMENT_PLAN.md` | UI/UX polish items for 7 already-shipped modules. |
| `QA_BUG_REPORT.md`, `QA_TEST_SUMMARY.md` | **Historical records of one testing session, jaan-boojh ke edit nahi kiye gaye.** Saatoon bugs fix ho gaye hain; har file ke top pe status header hai. Bug report ko fix hone ke baad chup-chaap rewrite kar dena uska poora point khatam kar deta hai. |
| `targetFeaturesIdea.md` | Full 86-feature enterprise vision — long-term north star, launch ke liye sab kuch nahi chahiye. |
| `plan/m1.md` … `plan/m20.md` | Historical milestone build specs. Input documents — ye current state describe nahi karte. |
| **`PROJECT_STATUS_AND_ROADMAP.md` (this file)** | 10 Dec launch ke liye prioritized, code-verified roadmap view. |

---

## 5. Kaise Use Karein

Har hafte is file ko update karo — jo item complete ho jaye, use "✅ Done" mark karo Section 3 me. Jab Phase A poora ho jaye, tabhi production traffic allow karo. Agar koi naya scope-change aata hai, pehle ye decide karo ki wo Phase B/C me fit hota hai ya Phase D me push karna better hai — 10 December fixed deadline hai, isliye scope discipline zaroori hai.
