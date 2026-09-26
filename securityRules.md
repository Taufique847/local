# 🛡️ BlueCollar AI — Complete Security Audit & Compliance Assessment

**Date:** September 24, 2026  
**Auditor:** Senior Security Engineer & QA Lead (Antigravity Agent)  
**Scope:** Full codebase audit of BlueCollar AI (Authentication, RBAC, Multi-tenancy, Webhooks, Telephony, Voice AI, Payment Flow, Data Privacy, and US Regulatory Compliance).  
**Status:** Read-only inspection completed; zero production code modified.

---

## 📊 1. Security Scorecard & Executive Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY AUDIT SUMMARY                   │
├────────────────────────────────┬────────────────────────────┤
│ Category                       │ Score / Rating             │
├────────────────────────────────┼────────────────────────────┤
│ 1. Multi-Tenant Data Isolation │ 10 / 10 (Production Grade) │
│ 2. Auth, Sessions & Token Mgmt │ 9.5 / 10 (Very Strong)     │
│ 3. Network & Webhook Security  │ 9.5 / 10 (Strong HMAC)     │
│ 4. Rate Limiting & DoS Defense │ 9.0 / 10 (Well Configured) │
│ 5. Application Input Safety    │ 6.5 / 10 (ReDoS/Regex Gaps)│
│ 6. Physical Security / Secrets │ 5.0 / 10 (Plain Gate Codes)│
│ 7. PCI-DSS Card Data Safety    │ 4.5 / 10 (No Transcript Redaction)│
│ 8. US Regulatory Compliance    │ 6.0 / 10 (TCPA/CIPA Gaps)  │
├────────────────────────────────┼────────────────────────────┤
│ OVERALL SECURITY POSTURE       │ 7.5 / 10 (Solid Core)      │
└────────────────────────────────┴────────────────────────────┘
```

> **Executive Summary:**  
> The core software architecture exhibits enterprise-grade defense against classic web vulnerabilities: cross-tenant data leakage is prevented via session-bound workspace scoping, JWT session replay is stopped via `tokenVersion`, and webhooks use strict cryptographic HMAC validation.  
> However, **compliance and sensitive data safeguards** currently lag behind: residential gate codes are stored unencrypted, call transcripts do not redact spoken credit card numbers, wiretapping disclosure playback is not persisted to the database for legal defense, and search endpoints are vulnerable to ReDoS/unhandled regex exceptions.

---

## ✅ 2. What Is Already Solid (Existing Defenses)

The following architectural protections are fully implemented and verified:

### 2.1 Multi-Tenant Data Isolation (Zero Cross-Tenant Leakage)
* **Implementation:** `backend/src/middleware/auth.middleware.ts` & `backend/src/middleware/business-role.ts`.
* **Details:** `businessId` is resolved exclusively from the verified JWT cookie/session, never from the request body or URL query parameter.
* **Database Queries:** All 43 service modules scope MongoDB queries with `{ businessId }`. Cross-tenant ID substitution returns 404 rather than 403 to prevent resource enumeration.

### 2.2 Session Security & Token Revocation
* **Implementation:** `backend/src/middleware/auth.middleware.ts` (L70–96).
* **Details:**
  * JWT access tokens are stored in `httpOnly`, `Secure`, and `SameSite` cookies, immune to JavaScript XSS theft.
  * **Token Version (`tv`) Invalidation:** Each request compares the token's `tv` against the live database record. If an employee is demoted, deactivated, or logs out, their active session is invalidated on their very next request without waiting for token expiration.
  * Refresh tokens rotate on every exchange, and detected token reuse immediately revokes the entire session family.

### 2.3 Layered Rate Limiting & Anti-Abuse
* **Implementation:** `backend/src/middleware/rate-limit.ts`.
* **Tiers:**
  * **Global Limiter:** 300 requests/minute broad ceiling against API floods.
  * **Auth Limiter:** 10 requests / 15 minutes, keyed on combined `IP + submitted_email` to block distributed password-spraying and brute-force credential attacks.
  * **Portal Limiter:** 60 requests / 10 minutes on anonymous share-token endpoints to prevent brute-force token enumeration.
  * **Public Form Limiter:** 10 requests / hour on public lead capture.

### 2.4 Cryptographic Webhook & Stream Authorization
* **Implementation:**
  * `backend/src/controllers/billing.controller.ts` (L101–114) — Stripe webhook parses raw binary buffer bytes before JSON parsing to enforce exact cryptographic HMAC signatures.
  * `backend/src/services/twilio.service.ts` (L94–105) — Twilio inbound call signatures are strictly checked against auth tokens.
  * `backend/src/utils/voice-stream-token.ts` — Voice WebSocket media streams require an ephemeral token signed with HMAC-SHA256, verified using constant-time `crypto.timingSafeEqual` to prevent timing attacks.

### 2.5 Toll Fraud & Call Hijacking Prevention
* **Implementation:** `backend/src/services/ai-tools/tool.registry.ts` (L349–351).
* **Details:** When the AI invokes `transfer_call`, any model-supplied destination number is discarded. The destination is strictly forced to the contractor's verified emergency escalation phone number or business phone, preventing callers from tricking the AI into dialing international or toll numbers.

### 2.6 Portal Share-Token Security
* **Implementation:** `backend/src/utils/share-token.ts` & `backend/src/services/invoice.service.ts`.
* **Details:** Public customer links (`/portal/invoice/:token` and `/portal/quote/:token`) enforce 32-byte cryptographically random base64url tokens (`crypto.randomBytes(32)`). Raw MongoDB ObjectIds are explicitly rejected to prevent IDOR / enumeration attacks.

---

## ⚠️ 3. Where Security Is Missing (Vulnerabilities & Gaps)

The following 6 security gaps require remediation before production scaling:

---

### 🔴 GAP-01: Residential Gate Codes Stored in Plain Text (Physical Security Risk)
* **Severity:** High / Critical
* **File:** `backend/src/models/customer.model.ts` (Line 194)
* **Risk Description:** Homeowner gate codes, door access codes, and garage entries are stored as unencrypted strings:
  ```typescript
  gateCode: { type: String, trim: true, maxlength: 40 }
  ```
* **Real-World Danger:** Anyone with read access to the database or backups, or any staff account with API access, can view the physical security codes of residential homes. A compromised database directly compromises the physical safety of homeowners.
* **Recommended Fix:** Encrypt `property.gateCode` at rest using AES-256-GCM (field-level envelope encryption) and restrict decryption to the technician assigned to that specific appointment.

---

### 🔴 GAP-02: No Credit Card Redaction on Voice Transcripts (PCI-DSS Risk)
* **Severity:** High
* **File:** `backend/src/services/voice/realtime-voice-provider.service.ts` & `backend/src/models/call-log.model.ts`
* **Risk Description:** If a caller speaks their credit card number (PAN), expiration date, or CVV over the phone, the speech-to-text engine transcribes it and saves it directly to `CallLog.transcript` without scrubbing.
* **Real-World Danger:** Violates Payment Card Industry Data Security Standards (PCI-DSS Level 1-4). Storing unencrypted primary account numbers in application logs can lead to card brand fines ($5,000–$100,000/month) and merchant account suspension.
* **Recommended Fix:**
  1. Add an AI prompt rule: *"Never ask for or accept credit card numbers over the phone; instead, inform the customer that a secure Stripe payment link will be sent by text."*
  2. Implement an automatic regex scrubber on transcripts prior to saving that masks Luhn-valid 13–16 digit numbers to `[CARD REDACTED]`.

---

### 🟠 GAP-03: Proof of AI Disclosure Not Persisted to Database (Wiretapping Liability)
* **Severity:** High
* **File:** `backend/src/services/voice/voice-session.service.ts` (L65) & `backend/src/models/call-log.model.ts`
* **Risk Description:** While Twilio plays the disclosure before opening the stream, `session.disclosurePlayed` is only tracked in memory and is **not written** to the `CallLog` model in MongoDB.
* **Real-World Danger:** In two-party consent states (e.g., California, Florida), if a caller files an illegal wiretapping complaint (CIPA), the business cannot prove from its records that the disclosure was actually played on that specific call.
* **Recommended Fix:** Add `disclosurePlayed: { type: Boolean, default: false }` and `disclosurePlayedAt: { type: Date }` to `call-log.model.ts` and ensure it is saved at session end.

---

### 🟠 GAP-04: ReDoS & 500 Crashes via Unescaped Regular Expressions
* **Severity:** Medium-High
* **Files:**
  * `backend/src/services/service.service.ts` (L87, L138, L215)
  * `backend/src/services/lead.service.ts` (L190)
  * `backend/src/services/invoice.service.ts` (L130)
  * `backend/src/services/estimate.service.ts` (L149)
  * `backend/src/services/appointment.service.ts` (L588, L614)
  * `backend/src/services/call.service.ts` (L68)
  * `backend/src/services/knowledge-base.service.ts` (L157, L199)
  * `backend/src/services/ai-tools/tool.registry.ts` (L90)
* **Risk Description:** Search inputs are passed directly to `new RegExp(query, 'i')` without escaping regex characters.
* **Real-World Danger:** Inputting characters like `(`, `[`, `*`, or `+` causes unhandled `SyntaxError: Invalid regular expression` exceptions, crashing requests with HTTP 500. Submitting malicious expressions (e.g., `(a+)+$`) can freeze the Node.js event loop (Regular Expression Denial of Service).
* **Recommended Fix:** Route all user-supplied search strings through `escapeRegex(query)` before compiling regular expressions.

---

### 🟡 GAP-05: Customer Data Erasure Endpoint Lacks Role Restriction
* **Severity:** Medium
* **File:** `backend/src/routes/customer.routes.ts` (Line 31)
* **Risk Description:** `POST /api/customers/:id/erase` is guarded only by `authMiddleware`. It lacks the `requireOwner` middleware.
* **Real-World Danger:** Any field technician or dispatcher who has access to the workspace can invoke this endpoint and permanently anonymize/erase a customer's personal data without owner authorization.
* **Recommended Fix:** Add `requireOwner` to `POST /api/customers/:id/erase`.

---

### 🟡 GAP-06: Lead Recovery Drips Check Quiet Hours Against Current Time & Host Timezone
* **Severity:** Medium-High (Legal Risk)
* **File:** `backend/src/services/lead-recovery.service.ts` (L22–31)
* **Risk Description:** `calculateTcpaSafeFollowUp` evaluates `CommunicationService.isWithinQuietHours(timezone)` which checks `new Date()` (the current instant) instead of the scheduled target execution time. Furthermore, `nextSafe.setHours(8, 5, 0, 0)` sets the hour in the server's host timezone rather than the recipient's timezone.
* **Real-World Danger:** Follow-up SMS drips can be scheduled and sent during recipient quiet hours (e.g. 10:00 PM or 3:00 AM local time), triggering direct statutory violations under the TCPA ($500–$1,500 fine per text).
* **Recommended Fix:** Test the target send timestamp in the business/customer's timezone using `zonedParts` and compute the 8:05 AM rollover in that specific timezone.

---

## ⚖️ 4. US Legal & Compliance Risk Matrix

| Regulation / Statute | Governing Body | Potential Fine / Penalty | Platform Vulnerability Status |
|---|---|---|---|
| **TCPA (47 U.S.C. § 227)** | FCC / Private Right of Action | **$500 to $1,500 per text/call** (Class action exposure) | ⚠️ **Vulnerable:** Lead drip timezone calculation flaw; AI tool `send_sms` bypasses quiet hours. |
| **All-Party Wiretapping (e.g. CIPA § 631/632)** | State Courts (CA, FL, PA, IL, etc.) | **$5,000 per violation** + Criminal liability | ⚠️ **Vulnerable:** Audio disclosure is played but not persisted to DB audit log. |
| **CA BOT Act (Cal. Bus. & Prof. Code § 17940)** | California AG / District Attorneys | **$2,500 per violation** | ⚠️ **Minor Gap:** Voice system prompt frames AI as "phone receptionist" rather than explicit automated assistant. |
| **PCI-DSS Level 1–4** | Card Brands (Visa / MasterCard) | **$5,000 to $100,000 / month** + Processor termination | ⚠️ **Vulnerable:** No regex scrubbing for card numbers in speech-to-text transcripts. |
| **CAN-SPAM Act (15 U.S.C. § 7701)** | FTC | **Up to $51,744 per email** | ✅ **Compliant:** RFC 8058 one-click unsubscribe, timing-safe HMAC tokens, physical address checks implemented. |
| **CCPA / CPRA (Cal. Civ. Code § 1798)** | CPPA (California Privacy Protection Agency) | **$2,500 to $7,500 per intentional violation** | ⚠️ **Partial:** Data erasure exists but gate codes stored in plain text; data retention default is disabled (`0`). |
| **FTC Act Section 5 (UDAAP)** | FTC | **Up to $50,120 per violation** + Customer restitution | ⚠️ **Partial:** AI prompt restricts pricing to diagnostic fees, but lacks a mandatory disclaimer on non-binding quotes. |

---

## 🛠️ 5. Security & Compliance Hardening Roadmap

To bring BlueCollar AI to full enterprise-grade security and legal compliance, implement the following roadmap:

### Phase 1: Immediate Legal & Compliance Patches (Days 1–2)
1. **CallLog Disclosure Logging:** Add `disclosurePlayed: Boolean` to `call-log.model.ts` and persist it on call completion.
2. **Transcript PCI Redaction:** Implement a regex interceptor in `voice-session.service.ts` that scrubs credit card numbers before database insertion.
3. **TCPA Timezone Fix:** Refactor `calculateTcpaSafeFollowUp` to calculate quiet hours against the target delivery timestamp in the customer's local timezone.
4. **Enforce Two-Party State Disclosure Lock:** Prevent business owners from disabling `aiDisclosureEnabled` if their business or caller resides in CA, FL, PA, IL, WA, MD, or MA.

### Phase 2: Application Security & Data Hardening (Days 3–5)
1. **Gate Code Encryption:** Add AES-256-GCM encryption for `property.gateCode` using an environment secret key (`FIELD_ENCRYPTION_KEY`).
2. **Global Regex Sanitization:** Wrap all search queries with `escapeRegex()` across services.
3. **Restrict Erasure Endpoint:** Mount `requireOwner` on `POST /api/customers/:id/erase`.
4. **Enable Default Retention Policy:** Change `DATA_RETENTION_DAYS` default from `0` to `90` days so call audio transcripts are automatically pruned.

### Phase 3: Infrastructure & Async Processing (Week 2)
1. **Campaign Background Worker:** Move campaign sends (`customer-segment.service.ts`) from synchronous Express execution to a Redis/BullMQ queue rate-limited to 5 SMS/second to prevent reverse proxy 504 timeouts and carrier 10DLC blocking.
2. **Immutable Audit Trail:** Log all administrative actions (role changes, customer data deletion, pricing updates) into an append-only `AuditLog` collection.
