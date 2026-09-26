Aapka platform **DONO KO (Both)** automated messages bhejta hai — **Customers (Homeowners) ko bhi** aur **Business Team (Owner, Dispatcher, Technician) ko bhi**.

Lekin dono ke messages ka maksad (purpose) bilkul alag hota hai. Aaiye dekhte hain ki kisko kya message jata hai aur **kaise** jata hai:

---

### 1️⃣ Customers (Homeowners) ko kya Auto-Message jata hai?

Customer wo log hain jo aapke registered business ko phone karte hain ya service book karwate hain. Unko ye auto-messages jate hain:

- **⚡ Missed Call / Speed-to-Lead Follow-up (SMS):**
  - _Kab jata hai:_ Agar customer ne call kiya aur AI se bina booking kiye phone rakh diya ya call miss ho gayi.
  - _Kya jata hai:_ Turant auto-SMS: _"Hi John, sorry we missed your call at Apex Air! Do you need urgent HVAC repair? Reply with your address to lock a slot."_
- **📅 Appointment Confirmation & Reminders (SMS + Email):**
  - _Kab jata hai:_ Jab AI phone par appointment book karta hai, aur visit se 24 ghante pehle.
  - _Kya jata hai:_ Time, date, technician arrival window aur self-service reschedule link.
- **🚗 "Technician On The Way" Alert (SMS):**
  - _Kab jata hai:_ Jab technician field app me "En Route" button dabata hai.
  - _Kya jata hai:_ _"Technician Alex is on the way to your home. Expected arrival in 15–20 minutes."_
- **💳 Invoice & Payment Link (SMS + Email):**
  - _Kab jata hai:_ Job complete hone par ya estimate banne par.
  - _Kya jata hai:_ Secure Stripe checkout link jahan customer click karke bina phone par card bataye card/Apple Pay se pay kar sake.
- **⭐ Review Request (SMS):**
  - _Kab jata hai:_ Kaam khatam hone ke 1 ghante baad.
  - _Kya jata hai:_ Google Business Profile par 5-star review dene ka direct link.

---

### 2️⃣ Business Team (Owner & Technicians) ko kya Auto-Message jata hai?

Ye wo log hain jo aapke platform par register/onboard hote hain (contractors, plumbers, HVAC technicians). Unko ye auto-messages jate hain:

- **🛠️ Technician Job Dispatch (SMS):**
  - _Kab jata hai:_ Jab dispatcher ya AI kisi job par technician ko assign karta hai.
  - _Kya jata hai:_ Technician ke mobile par complete job details aati hain:
    - Customer ka naam aur address
    - Issue kya hai (e.g. "AC not cooling, blowing warm air")
    - Decrypted Gate Code / Entry instructions (e.g. "Code #4921\*, beware of dog in backyard")
    - Equipment details (e.g. "Carrier 4-ton heat pump in attic")
- **🚨 Emergency Escalation Alert (Call / SMS):**
  - _Kab jata hai:_ Agar caller gas smell, carbon monoxide, ya sparking fire jaisi emergency report karta hai.
  - _Kya jata hai:_ AI turant owner/on-call staff ke personal number par call transfer ya urgent SMS drop karta hai.
- **👥 Team Invites & System Auth (Email):**
  - _Kab jata hai:_ Jab owner naye dispatcher ya technician ko invite karta hai, ya password reset hota hai.

---

### ⚙️ Ye Kaam KAISE Karta Hai? (Under the Hood Flow)

```
                       [ Incoming Customer Call ]
                                   │
                                   ▼
                       [ AI Phone Receptionist ]
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                     ▼
 [ Customer Path ]                                     [ Business Path ]
 • Missed call? -> Auto Drip SMS (Twilio)              • Job Booked? -> Dispatch SMS to Tech
 • Booked? -> Confirmation SMS + Email                 • Emergency? -> Urgent Alert to Owner
 • Work Done? -> Stripe Payment Link SMS               • Access info? -> Decrypted Gate Code to Tech
```

1. **Twilio Telephony Engine:**
   - Platform har business ke provisioned phone number se customer ko SMS bhejta hai (taaki customer ko contractor ka hi phone number dikhe).
   - Technicians ko unke private numbers par job details auto-dispatch karta hai.
2. **SendGrid / Resend Email Engine:**
   - Transactional receipts, invoices aur portal links email ke zariye bheje jate hain.
3. **TCPA & Consent Engine (Automatic Guard):**
   - Customer ke liye automatic **Quiet Hours (8 AM – 8 PM / 9 PM)** check karta hai.
   - Agar customer **"STOP"** likh deta hai, toh customer ke auto-messages turant permanently block ho jate hain, jabki business staff ko dispatch messages normal jate rehte hain.

**Nateeja:** Business owner ka business 24/7 autopilot par chalta hai — na unhe customer ko bar-bar appointment yaad dilana padta hai, aur na technicians ko call karke address samjhana padta hai. Sab kuch automated hai!
