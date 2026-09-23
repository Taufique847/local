> ## ⚠️ Status: design document, not a description of the build
>
> This is a **proposal**. The "Current Status" sections below describe the product
> as it was when the doc was written and are now out of date in places.
> **`README.md` is the source of truth for what exists today.**
>
> What has since shipped from this doc:
>
> - **Telephony (§4)** — the carrier call-forwarding wizard is built
>   (`components/telephony/call-forwarding-wizard.tsx`, with Verizon / AT&T /
>   T-Mobile / landline / Google Voice codes) and appears both in onboarding and
>   in phone settings. An emergency escalation number is configurable and the
>   `transfer_call` tool now performs a real Twilio call redirect.
> - **Invoices (§7)** — card payment now goes through real Stripe Checkout. The
>   card form that previously collected a card number and CVC in the page has been
>   removed; it never charged anything and handling raw card data in our own DOM
>   was a PCI problem.
>
> - **Equipment registry (§2)** — ✅ now built, and larger than this doc proposed. A real
>   `Equipment` model (type, brand, model number, serial, install year, filter size,
>   location, warranty) plus structured `Customer.property` (gate code, access
>   instructions, pets, parking). Editable in an Equipment & Access tab on the customer
>   drawer, and injected into both the voice prompt and the technician dispatch text. A
>   dry-run-by-default migration lifts the old regex-derived `AgentMemory` values into it
>   without deleting them, because those rows carry the provenance of a value a regex
>   guessed.
> - **Invoices and quotes are now actually sent to the customer.** This doc assumed they
>   already reached them. They did not: an invoice was created with `status: 'unpaid'`
>   and a `shareToken` that only ever appeared in the owner's own UI, so the payment
>   portal and the e-signature flow were both unreachable by the person they were for.
>
> What has **not** been built from this doc: dual-track call waveform, one-click
> call→appointment conversion, urgency filter pills, PDF transcript export,
> double-booking conflict banner, price-lock countdown, card surcharge toggle,
> invoice aging badges, one-click SMS pay link, print letterhead.
>
> Two items need a more precise status than "not built":
>
> - **Route map view** — still not built, and the fabricated version has been removed.
>   The appointments page previously rendered an invented route map ("32% Drive-Time
>   Saved", "38.4 Miles", "+$64 / Day Saved", hardcoded Dallas coordinates, three
>   invented customers, and a button that only fired a toast). It now shows an honest
>   "not available" panel. There is no geocoding provider and no coordinates on any
>   record, so this needs that foundation first.
> - **Good/Better/Best 3-tier proposals** — the **backend exists** (`Estimate.tiers`,
>   with a recommended flag, rendered on the portal quote page). What is missing is the
>   UI for an owner to *build* the tiers.
>
> Correction to §7: the claim that a 3% surcharge is simply a toggle understates it.
> Card surcharging is regulated differently by state and by card network, and
> several states restrict or prohibit it. Treat that item as needing legal review,
> not just a UI switch.

# 🛠️ BlueCollar AI — 7 Existing Features Comprehensive Improvement Plan
> **Document Status:** Proposal — see status header above  
> **Target Audience:** US Home Service Contractors (HVAC, Plumbing, Electrical, Roofing)  
> **Goal:** Bina naye features add kiye, existing 7 modules ko enterprise-grade, rock-solid aur conversion-ready banana.

---

## 📌 Executive Summary (Kyun Ye 7 Modules Chune Gaye Hain?)
US Market me contractor tabhi software use karta hai jab uski daily headache khatam ho:
1. **Missed Calls na chootein** (Calls Module)
2. **Technician ki double booking na ho aur travel time bache** (Appointments Module)
3. **Customer ke purane AC/Plumbing unit ki detail yaad rahe** (CRM / Customers Module)
4. **Uska 10 saal purana business phone number bina badle AI se jud jaye** (Phone / Telephony Module)
5. **Field me technician mobile se photo aur GPS check-in le sake** (Worker PWA Module)
6. **Customer ko 3 options (Good / Better / Best) dekar high ticket close ho** (Estimates Module)
7. **Kam se kam 3% card fee bache aur turant SMS se payment aaye** (Invoices Module)

---

## 1️⃣ Feature 1: Calls & Voice AI (`/app/calls`)

### 🔍 Current Status (Abhi Kya Hai):
- Twilio call logs list hoti hain (Caller number, duration, call status).
- AI summary, sentiment (Positive/Neutral/Negative) show hota hai.
- Audio recording play karne ka standard HTML player aur transcript drawer hai.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- Standard audio bar me samajh nahi aata ki kahan caller ne bola aur kahan AI receptionist ne.
- Call sunne ke baad agar customer ne appointment mangi hai, to manual copy-paste karna padta hai.
- Emergency calls (jaise "Basement flood ho gaya", "AC fail in 100°F heat") normal calls ke sath mix ho jaati hain.

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **1.1 Dual-Track Speech Waveform** | Interactive canvas/visual waveform jo Caller audio (Blue) aur AI Alex audio (Green) ko alag-alag color me dikhaye with clickable timestamps. | 2 minute ki call me contractor 5 second me exact issue sun sakta hai. |
| **1.2 1-Click "Book Appointment"** | Call drawer me ek direct button: "Convert to Appointment". Ye caller name, phone, AI summary aur address pre-fill karke direct scheduling modal kholega. | Zero data re-entry; 10 second me dispatch ready. |
| **1.3 Urgency & Intent Filters** | Call table ke upar quick filter pills: `🚨 Emergency (No AC / Leak)`, `📅 Booking`, `💰 Pricing / Quote`, `ℹ️ Routine`. | Subah aate hi pehle emergency calls attend ho sakein. |
| **1.4 PDF Transcript & Audio Export** | Call transcript aur audio recording ko 1-click me export karne ka option for insurance/dispute proof. | Legal safety jab customer bole ki "Maine to ye bola hi nahi tha". |

---

## 2️⃣ Feature 2: Appointments & Dispatch Scheduling (`/app/appointments`)

### 🔍 Current Status (Abhi Kya Hai):
- Calendar & Table view available hai.
- Technician assign hota hai, time slots choose hote hain.
- Statuses: Confirmed, In Progress, Completed, Cancelled.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- Agar do jobs ek hi time par same technician ko assign ho jayein to koi alert nahi aata (Double Booking).
- Dispatcher ko pata nahi chalta ki jobs city ke kis kone me hain (North Dallas ya South Dallas), jisse technician 2 ghante driving me waste karta hai.
- Customer ko automatic SMS reminder bhejne ka direct toggle nahi hai.

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **2.1 Double-Booking Conflict Engine** | Real-time visual warning banner: Agar selected technician ka window overlap karta hai kisi aur job se, to warning badge show kare: *"⚠️ Conflict: Bob already booked 2:00 PM - 4:00 PM"*. | Embarrassing customer complaints aur missed jobs se bachata hai. |
| **2.2 Dallas Route & Map Pins View** | Appointments page par ek "Route Map View" toggle: Har technician ki aaj ki jobs map pins (Stop 1, Stop 2, Stop 3) ke roop me dikhein with driving route sequence. | Technician ka 30% gas aur 1.5 ghante daily drive time bachta hai. |
| **2.3 1-Tap Customer En-Route SMS** | Status update karte hi customer ko instant SMS: *"Apex Heating: Tech Bob is en route to your location. ETA: 25 mins."* | Homeowner ghar par ready rehta hai, missed door knocks khatam. |

---

## 3️⃣ Feature 3: CRM & Customers 360° (`/app/customers`)

### 🔍 Current Status (Abhi Kya Hai):
- Customer name, phone, email, address aur total spend list hota hai.
- Basic edit modal hai.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- HVAC/Plumbing me sabse zaruri cheez hoti hai: **Ghar me konsa AC/Heater laga hai?** (Brand, Model, Age, Filter Size, Refrigerant). Ye abhi save nahi hota.
- Customer ka complete 360° history ek jagah nahi dikhta (Konsi call ki, konsa quote sign kiya, kab invoice bhara).

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **3.1 Equipment & Unit Registry** | Customer card me dedicated Equipment section: Brand (Carrier, Trane), Unit Type (Split System, Heat Pump), Installed Year, Filter Size (`16x25x1`), Refrigerant (`R-410A`). | Tech jab site par jaye to pehle se sahi filter aur gas truck me lekar jaye. |
| **3.2 Customer 360° Activity Timeline** | Drawer me chronological timeline: "Call Received (AI Alex) ➔ Quote #102 Sent ($1,250) ➔ Signed by Homeowner ➔ Tech Bob Dispatched ➔ Invoice #901 Paid". | Call aane par receptionist ko customer ka poora kachha-chittha 2 second me dikhe. |
| **3.3 1-Click Actions from Table** | Customer row me direct actions: "📞 Call Customer", "📄 Create Quote", "📅 Book Job", "💳 Send Payment Link". | Fast workflow, bar-bar alag pages par navigate nahi karna padega. |

---

## 4️⃣ Feature 4: Telephony & Phone Setup (`/app/settings/phone`)

### 🔍 Current Status (Abhi Kya Hai):
- Twilio connection status check hota hai.
- Business phone number list hota hai aur naya number buy/search kar sakte hain.
- Live AI Alex Voice Playground modal integrate ho chuka hai.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- Contractor apna 15 saal purana Google Business/Truck par chapa number chhodkar naya number nahi lega! Use **Call Forwarding** chahiye.
- Setup ke baad contractor ko darr rehta hai ki "Sach me ring karega ya call drop ho jayegi?".
- Agar AI answer na kar paye to Emergency Human cell phone par call kaise transfer hogi?

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **4.1 Carrier Call Forwarding (*72) Wizard** | Step-by-step modal with exact dial codes for: **Verizon (*72)**, **AT&T (*21*)**, **T-Mobile (**21*)**, aur **Google Voice** with 1-click copy buttons. | Contractor ko apna number change nahi karna padega; bas phone se *72 dial karke AI number dalna hai. |
| **4.2 In-Browser Telephone Ring Simulator** | Ek "Simulate Test Ring" button jo realistic US telephone ringtone + DTMF tones play karke test call simulate kare. | Contractor ko 100% confidence milta hai ki call pick up hogi. |
| **4.3 Emergency Human Escalation Number** | Emergency transfer number setting: *"If customer screams emergency or asks for owner, forward directly to: (XXX) XXX-XXXX"*. | High-risk commercial leaks ya VIP clients miss hone ka risk zero. |

---

## 5️⃣ Feature 5: Field Worker Mobile PWA (`/worker`)

### 🔍 Current Status (Abhi Kya Hai):
- Mobile-first view jisme tech ko uski assigned jobs dikhti hain.
- Check-in button aur status update hota hai.
- Recently added: Device camera capture and GPS geolocation.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- Tech ko job start karne se pehle "Before" aur khatam karne par "After" photo lene me standard photo categories chahiye.
- Tech ko job par jate waqt 1-tap me Google Maps / Apple Maps kholna chahiye.
- Customer ka signature mobile screen par lena chahiye job complete hone ke baad.

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **5.1 Before/After Tagged Photo Capture** | Direct camera trigger (`capture="environment"`) with tags: `Before Repair`, `Found Leak / Crack`, `Completed Job`. Instant preview and compression. | Customer baad me blame nahi kar sakta ki tech ne kuch tod diya. |
| **5.2 GPS Geofenced Arrival Stamp** | GPS coordinate verification: Job address ke 500 feet ke andar aane par "GPS Verified Arrival" badge save hota hai with exact timestamp. | Owner ko proof rehta hai ki tech sach me time par site par tha. |
| **5.3 1-Tap Directions & SMS ETA** | Button click par Apple Maps / Google Maps direct navigation open ho, aur 1-tap me pre-filled SMS: *"I'm on my way, ETA 15 mins"*. | Field technician ko driving ke dauran typing nahi karni padti. |
| **5.4 On-Glass Customer Sign-off** | Job khatam hone par customer se phone screen par direct signature lene ka lightweight canvas. | Chargeback aur dispute se 100% protection. |

---

## 6️⃣ Feature 6: Estimates & Multi-Option Proposals (`/app/estimates` & `/portal/quote/[id]`)

### 🔍 Current Status (Abhi Kya Hai):
- Admin estimate banata hai with line items, tax, discount.
- Homeowner portal link generate hoti hai jisme customer e-sign kar sakta hai.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- Single price quote me customer sochta hai: *"Kya ye mehnga hai? Dusre contractor se quote leta hu"*.
- US Trade standard hai **Good / Better / Best (3-Tier Pricing)**. E.g., Good ($1,200), Better ($2,400 with 5-yr warranty), Best ($5,800 high efficiency). Bina iske contractor 30-40% profit miss karta hai.
- Quote par expiry date ya urgency counter nahi hota, jisse customer hafte bhar latka rehta hai.

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **6.1 Good / Better / Best 3-Tier Proposal** | Portal page par 3 side-by-side cards: Good, Better (Recommended), Best. Customer card choose karega aur total amount instantly update hoga. | Average ticket size 35% se badh jata hai bina extra sales effort ke. |
| **6.2 7-Day Price Guarantee Countdown** | Portal header me animated badge: *"Price Lock Guarantee: Expires in 6d 14h 22m"*. | Customer turant approve karta hai FOMO ki wajah se. |
| **6.3 Retina Smooth E-Signature Canvas** | Bezier curves smooth drawing + touch-lock (screen rubber-banding nahi hogi) + instant signed PDF download. | Professional corporate feel aur legal binding agreement. |

---

## 7️⃣ Feature 7: Invoices, Surcharge & Payments (`/app/invoices` & `/portal/invoice/[id]`)

### 🔍 Current Status (Abhi Kya Hai):
- Invoice list, creation modal, tax calculation, customer portal with mock Stripe card payment.

### ⚠️ Gaps & Contractor Pain Points (Kya Kami Hai):
- 3% Credit Card Processing fee $5,000 ke job par $150 hoti hai jo contractor ki jeb se cutti hai.
- Overdue tracking weak hai (kaunsa bill 30 din purana hai, kaunsa 60 din purana).
- Customer ko payment link bhejne ke liye copy-paste karna padta hai instead of 1-click SMS.

### 🚀 Proposed Improvements (Plan):
| Item | Improvement Detail | Contractor Benefit |
|------|--------------------|---------------------|
| **7.1 Credit Card Surcharge vs Cash/Check Discount** | Payment portal me toggle: "Pay with Card (+3% processing fee)" OR "Pay via Check / Zelle / Cash (Save $X)". | Contractor ka saal me $5,000 - $15,000 credit card fees me bachta hai. |
| **7.2 Aging Indicators & Overdue Badges** | Table me high-visibility status badges: `Paid in Full`, `Due Today`, `Overdue by 14 Days`, `Overdue 30+ Days`. | Kaunsa paisa market me fasa hai turant dikhta hai. |
| **7.3 1-Click SMS Payment Reminder** | Table ke action menu me button: "Send SMS Pay Link". Ek click par customer ke phone par direct secure checkout URL chala jaye. | Contractors ko payment 3x fast milti hai (average 4 hours vs 14 days). |
| **7.4 Contractor Clean Thermal/Letterhead Print** | Professional `@media print` layout with company letterhead, tax breakdown, aur "PAID IN FULL" red seal stamp. | Homeowner ko unke home warranty aur tax deduction ke liye clean invoice milta hai. |

---

## 📊 Summary Comparison Table (Sabhi 7 Features Ek Nazar Me)

| # | Feature Area | Current State | Proposed Polish / Improvement | Expected Impact |
|---|--------------|---------------|-------------------------------|-----------------|
| **1** | **Calls (`/app/calls`)** | Simple audio player & logs | Dual-track waveform + 1-Click "Convert to Appointment" + Emergency filter pills | 5x fast response to emergency leads |
| **2** | **Appointments (`/app/appointments`)** | Basic calendar / list | Double-booking collision warning + Dallas route map pins view | Zero schedule mess + 30% gas savings |
| **3** | **CRM (`/app/customers`)** | Name & address list | HVAC/Plumbing Equipment Registry + 360° Activity Timeline | Instant technician readiness on site |
| **4** | **Telephony (`/app/settings/phone`)** | Twilio connect & voice tester | Carrier Call Forwarding (*72) guide + Inbound ring audio simulator | 100% onboarding ease without changing number |
| **5** | **Field Worker (`/worker`)** | Basic job checklist | Native camera before/after photo upload + GPS verified arrival stamp | Complete liability & dispute protection |
| **6** | **Estimates (`/app/estimates`)** | Single price quote | Good / Better / Best 3-tier proposals + 7-day price lock banner | +35% higher average ticket value |
| **7** | **Invoices (`/app/invoices`)** | Standard invoice & card pay | 3% card surcharge toggle + Overdue aging badges + 1-Click SMS pay link | $10k/yr saved in CC fees & 3x faster payouts |

---

## 🎯 Next Action for User:
Aap is poore plan ko review karein. Jab aap batayenge ki:
- **Option A:** Sabhi 7 ko ek ke baad ek systematic order me implement karein.
- **Option B:** Kisi specific module (e.g., Pehle Telephony & Calls, ya CRM & Appointments, ya Invoices & Estimates) ko pehle banayein.

Aap bataiye, kaunsa pehle start karein?
