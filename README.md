# BlueCollar AI

An AI phone receptionist for US home-service contractors (HVAC, plumbing, electrical, roofing).

It answers inbound calls, qualifies the job, books the appointment into the calendar, texts back callers it could not convert, and routes emergencies to a human.

---

## What actually works today

Be aware of the distinction below — it is the difference between a demo and a deployment.

### Fully implemented

| Area | Detail |
|---|---|
| **Auth** | Signup/login, bcrypt (cost 12), httpOnly + `secure` + `sameSite` cookies. Short-lived access token plus rotating refresh token with reuse-as-theft detection; `tokenVersion` makes an issued access token revocable. Email verification and password reset, both single-use and expiring |
| **Access control** | Two independent role axes. `role` ('user' \| 'admin') gates platform-operator endpoints; `businessRole` ('owner' \| 'dispatcher' \| 'technician') gates tenant endpoints. Staff join by emailed invitation; billing and team management are owner-only; a technician sees only their own jobs. Role and membership are read from the database per request, so a demotion applies immediately rather than at token expiry |
| **Multi-tenancy** | Every query scoped by `businessId`, resolved server-side from the session by workspace **membership** — never from the request body |
| **Telephony** | Real Twilio: number search, provisioning, TwiML, bidirectional Media Streams WebSocket, signature verification on every webhook |
| **AI voice engine** | Deepgram Nova-2 streaming STT → tool-calling LLM → Deepgram Aura TTS, as 8 kHz μ-law frames. The LLM is Azure OpenAI or public OpenAI, interchangeable via `LLM_PRIMARY`/`LLM_FALLBACK`, with automatic failover bounded by a wall-clock budget. Local VAD barge-in with Twilio `clear`. Per-call latency + token + audio metrics recorded. The media-stream WebSocket is authorised by a single-use signed token, because Twilio does not sign upgrades |
| **AI tools** | 7 tools the model can call: customer lookup, availability, lead create/update, book appointment, send SMS, transfer call, knowledge-base search — all with policy guardrails |
| **Guardrails** | Per-business booking notice/horizon limits, authorised diagnostic + emergency fees, emergency keyword list, prohibited claims, all injected into the system prompt |
| **CRM & ops** | Customers (360 timeline, tags, structured access + equipment records), leads, services, appointments, availability, technicians, service zones |
| **Customer notifications** | One `NotificationService` for both SMS and email, rendering from one template set and logging both channels identically. Booking confirmation, reschedule, cancellation, appointment reminder, quote sent, invoice issued, payment receipt. Never throws, so a provider outage cannot fail a booking; a failed send is recorded with a cause rather than silently dropped |
| **Appointment reminders** | `appointment_reminders` cron every 15 min with a per-business lead time (default 24h). Idempotent by an atomic conditional claim, not read-then-write. Quiet hours defer rather than consume, and a transient provider failure retries up to three times |
| **Reply handling** | Customers text `C` to confirm or `R` to reschedule. `R` opens a reschedule request with real available slots that the owner applies through the same locked reschedule path the calendar uses. Keywords match exactly — prose goes to a human. Inbound SMS nothing understood is flagged on arrival and surfaced in an Action Queue instead of being dropped |
| **Per-business message copy** | `MessageTemplate` per type and channel with `{{variable}}` substitution against a declared variable set. An override table, not a replacement: a business with no rows sends exactly what it sent before. An SMS override must keep an opt-out notice where the shipped copy has one |
| **Segments & campaigns** | Saved customer segments with live (never cached) counts. Filters on tags in/all/none, lifetime value, last service date, never-serviced, property type and equipment brand. Campaigns send per recipient through `NotificationService`, so quiet hours and both consent flags apply; campaign texts are refused without an opt-out notice, and the audience is capped at 500 |
| **Consent, two kinds** | `isOptedOut` (TCPA, set by texting `STOP`) and `emailOptedOut` (CAN-SPAM, set by clicking unsubscribe) are separate flags under separate laws and neither stands in for the other — a customer who stopped texts still gets their own invoice. Campaign email carries an unsubscribe link and the `List-Unsubscribe` headers that render Gmail's and Outlook's native button; transactional email carries neither, because it is exempt and offering an unsubscribe we would not honour is worse than offering none |
| **Missed-call recovery** | 3-step SMS drip, TCPA quiet hours, STOP/START opt-out, conversational SMS booking |
| **Reputation** | Delayed post-service CSAT survey; 4–5★ → your Google link, 1–3★ → kept private and escalated to you with a 24h SLA |
| **Estimates & invoices** | Line items, tax, e-signature, public share-token portal, Stripe Checkout for card payment. Quotes and invoices are now actually sent to the customer with their portal link |
| **Billing** | Real Stripe subscriptions, free trial, usage metering, plan enforcement on minutes and phone lines |
| **Background jobs** | In-process cron, 6 jobs: drip follow-ups, review surveys, SLA sweeps, appointment reminders, trial expiry, data retention. Each run takes a MongoDB-backed distributed lock, so extra replicas do not double-send SMS |
| **Field worker PWA** | Mobile job list, check-in, photo capture, GPS |

### Not built (and the UI says so)

- **Multi-location / branches** — `/app/settings/locations` is an honest placeholder. There is no branch model.
- **Calendar sync (Google / Outlook)** — `/app/settings/integrations` is an honest placeholder. No OAuth app, no token storage, no sync worker.
- **Route optimisation and the dispatch map** — `/app/appointments` shows a "Not available yet" panel listing what a real version would need. It replaced a fabricated route map that reported a "32% Drive-Time Saved" badge, "38.4 Miles", "1 hr 14 mins", "+$64 / Day Saved", hardcoded Dallas coordinates, three invented customers, and a "Dispatch Route to Techs" button that only fired a toast. There is no geocoding provider, no coordinates on any record, and no routing.

### Known gaps you should plan for

- **The voice pipeline has not been exercised against live provider credentials.** It compiles, the protocol work is correct, and provider readiness is reported by `/api/health/ready` — but end-to-end audio has never been confirmed on a real call. This is the single most important unverified thing in the project.
- **Voice is single-instance.** `VoiceStreamHandler` and `VoiceSessionService` hold per-call state in process memory, so the backend cannot be horizontally scaled while serving calls. The media-stream token's replay guard is in-memory for the same reason.
- **No call recording is stored.** `CallLog.recordingUrl` exists on the model but is never written. Transcripts are real; audio is not captured, so there is nothing to produce if a customer or a regulator asks for it.
- **The post-call "AI summary" is not AI.** `conversation-intelligence.service.ts` selects a canned sentence based on the call outcome. The sentiment and flagging heuristics around it are real; the prose is a template.
- **No data retention sweep is on by default.** `DATA_RETENTION_DAYS` defaults to `0` (off), deliberately, so a first boot of this build cannot start deleting an operator's existing records. Transcripts are kept indefinitely until it is set.
- **No email has ever actually been sent.** Every email path — verification, password reset, staff invitations, and now all the customer-facing notifications — builds and is covered by tests with the sender stubbed, but `EMAIL_API_KEY` has never been configured. In production these paths write a `CommunicationLog` row with `status: 'failed'` and `errorCode: 'email_not_configured'`, so the silence is visible rather than silent. Nothing else has to change when the key is set.
- **Billing runs in simulation mode** unless `STRIPE_SECRET_KEY` is set. No real card payment has been taken.
- **The calendar is day-only and buckets by UTC.** `/app/appointments` renders a single-day hourly grid using `getUTCHours()`, which is wrong for any business not operating in UTC. The backend range endpoint for week and month views exists and is never called. There is no drag-and-drop and no recurring appointments. Conflict checking is business-wide rather than per technician, so a five-technician business cannot hold two concurrent jobs.
- **Pricing arithmetic is duplicated in three files.** `invoice.service.ts`, `estimate.service.ts` and `worker.service.ts` each compute subtotal/credit/tax separately. `taxRate` and `laborRate` are now per-business rather than hardcoded, but `emergencyFee` is quoted by the AI and never billed, and there is no travel fee or first-class discount.
- **Technician assignment is manual.** `technicianId` is now written and scoped on, but `findOptimalTechnician` is a suggestion returned to nobody, and the matcher ignores technician `status` and skills.
- **The worker PWA page has no client-side auth guard.** `/worker` renders for an unauthenticated visitor and then fails its API calls. The data is not exposed — every `/api/worker/*` route is authenticated — but the page should redirect instead of breaking.
- **Tests cover the dangerous paths and the money paths, not the product.** 416 tests over tenancy, webhook signatures, RBAC, auth token lifecycles, job-completion pricing, notifications, templates, equipment and property data, segment campaigns and email consent. Every guard they protect was confirmed by deliberately breaking it: 165 mutations attempted, 164 caught, and the single survivor is documented in place as behaviour-neutral. The frontend and the voice pipeline have no automated coverage.
- **Gate codes are stored in plain text.** `Customer.property.gateCode` is a physical access credential readable by anyone with a staff login or database access. It is excluded from every customer-facing channel and only ever appears in the dispatch text to the assigned technician, but field-level encryption would need key management that does not exist here.

---

## Stack

- **Frontend** — Next.js 14 (App Router), React 18, TypeScript, Tailwind, Recharts
- **Backend** — Node 22, Express 4, TypeScript, Mongoose 8
- **Database** — MongoDB
- **Telephony** — Twilio (Voice, Media Streams, SMS)
- **Speech** — Deepgram (Nova-2 STT, Aura TTS)
- **Reasoning** — Azure OpenAI or public OpenAI Chat Completions with function calling, interchangeable and with failover
- **Email** — Resend (provider-agnostic behind `EMAIL_PROVIDER`)
- **Payments** — Stripe (subscriptions + one-off invoice checkout)
- **Tests** — Vitest against a real in-process MongoDB (`mongodb-memory-server`), not mocked models

---

## Repository layout

```text
.
├── backend/
│   ├── server.ts                  # entrypoint: config validation, DB, HTTP, WS, scheduler
│   └── src/
│       ├── config/                # env parsing + startup validation
│       ├── controllers/           # HTTP handlers (businessId always from session)
│       ├── jobs/scheduler.ts      # cron: drips, surveys, SLA, reminders, trials, retention
│       ├── middleware/            # auth, cors, helmet, rate limits, zod validation, RBAC
│       ├── models/                # Mongoose schemas
│       ├── routes/                # route tables
│       ├── scripts/               # index sync + dry-run-by-default backfills/migrations
│       ├── services/
│       │   ├── ai-tools/          # tool registry + executor + guardrail gate
│       │   ├── notification.service.ts        # the one send path, SMS + email
│       │   ├── notification-templates.ts      # all copy, both channels, one place
│       │   ├── customer-filter.ts             # one query builder: list, segments, campaigns
│       │   └── voice/
│       │       ├── providers/     # deepgram-stt, deepgram-tts, llm (azure|openai), mulaw
│       │       ├── realtime-voice-provider.service.ts   # the orchestrator
│       │       └── voice-stream.handler.ts              # Twilio Media Streams bridge
│       ├── utils/                 # logger, timezone/money formatting, share tokens
│       └── validation/schemas.ts  # zod request schemas
│   └── tests/                     # vitest against a real in-memory MongoDB
└── frontend/
    ├── app/                       # App Router pages, error boundaries, sitemap, robots
    ├── components/                # UI, dashboard, landing, telephony
    ├── lib/                       # api-client, plan-intent, use-dialog, site config
    └── services/                  # typed API wrappers
```

---

## Running locally

### Prerequisites

Node 22+, npm 10+, and a MongoDB instance (local or Atlas).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env     # then edit it — see Configuration below
npm run dev              # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

### Or with Docker

```bash
cp .env.example .env     # JWT_SECRET is required
docker compose up --build
```

Brings up MongoDB, the API on `:5000`, and the frontend on `:3000`.

---

## Configuration

Every variable is documented in `backend/.env.example` and `frontend/.env.example`. The essentials:

| Variable | Notes |
|---|---|
| `JWT_SECRET` | **Required in production**, min 32 chars. The server refuses to start without it. |
| `MONGODB_URI` | **Required in production.** |
| `FRONTEND_URL` | **Required in production.** Drives CORS and customer-portal links. |
| `VOICE_PROVIDER` | `mock` (default, scripted, no external calls) or `realtime` (the real pipeline). |
| `DEEPGRAM_API_KEY` | Required for `realtime`. Without it the factory logs a warning and falls back to `mock` rather than answering with silence. |
| `LLM_PRIMARY` / `LLM_FALLBACK` | `azure` or `openai`. Defaults to Azure primary: an operator who supplied Azure credentials did so for data-residency or procurement reasons, and silently preferring public OpenAI would defeat that. Failover between them is bounded by `LLM_TOTAL_BUDGET_MS` — a caller is on the line. |
| `AZURE_OPENAI_API_KEY` / `_ENDPOINT` / `_DEPLOYMENT` | Required when Azure is in use. `AZURE_OPENAI_API_MODE` defaults to `v1` (`{endpoint}/openai/v1/chat/completions`, no api-version churn); set it to `deployment` for a resource that does not serve the v1 route. |
| `OPENAI_API_KEY` | Required when public OpenAI is primary or fallback. |
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM_ADDRESS` | Without a key, every email path **fails and records why** rather than reporting success. Nothing else changes when it is set. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | The auth token is what verifies inbound webhooks. Without it, webhooks are rejected. |
| `TWILIO_WEBHOOK_BASE_URL` | Must be the exact public HTTPS base URL Twilio calls. Signatures are computed against it. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Without the secret key, billing runs in simulation mode and no real payment can be taken. The webhook secret is required whenever the secret key is set. |
| `ENABLE_SCHEDULER` | `true` on exactly one backend replica. |
| `ALLOW_INSECURE_WEBHOOKS` | Disables Twilio/Stripe signature checks. Local only — force-disabled when `NODE_ENV=production`. |

`NEXT_PUBLIC_*` values are compiled into the browser bundle at build time, so they must be set when the frontend image is **built**, not when it runs.

---

## Scripts

Both packages:

```bash
npm run dev         # watch mode
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # run the build
```

Backend only:

```bash
npm test                    # vitest run, against an in-process MongoDB
npm run typecheck:tests     # the test tsconfig, which is separate
npm run sync-indexes        # apply model indexes; autoIndex is off in production
```

### Data scripts

All three are **dry-run by default** and report what they would change. Pass `-- --apply` to
write. They are idempotent — recomputed absolutely rather than incremented — so running one
twice is safe.

```bash
npm run backfill:technician-ids        # resolve technicianName -> technicianId on old appointments
npm run migrate:property-memories      # AgentMemory rows -> structured property + Equipment
npm run backfill:customer-rollups      # lifetimeValue + lastServiceAt from invoices/appointments
```

`backfill:technician-ids` deliberately **skips** appointments whose `technicianName` matches two
technicians rather than guessing; those need assigning by hand. `migrate:property-memories`
reports a gate code it cannot parse instead of mangling it, because a technician will stand at a
gate trying whatever it wrote.

---

## Operational endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness. 200 while the process is up. |
| `GET /api/health/ready` | Readiness. Returns **503** when the database is down or the scheduler has stalled. Reports DB state, telephony/billing mode, whether the voice engine is actually usable, active media streams, and per-job scheduler status. |
| `POST /api/health/jobs/:name/run` | Manual job trigger, platform-admin only — these jobs sweep every tenant, so they are not tenant-scoped. Jobs: `lead_recovery_drips`, `review_surveys`, `review_sla_breaches`, `appointment_reminders`, `expire_trials`, `data_retention`. |

---

## Going live checklist

1. Set every production-required variable — the server validates them at boot and refuses to start if one is missing.
2. Run `npm run sync-indexes`. `autoIndex` is off in production, so a new deploy does not build indexes on boot and a missing one will not announce itself.
3. Point `TWILIO_WEBHOOK_BASE_URL` at your public HTTPS origin and confirm a test call passes signature validation.
4. Register the Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`. Confirm a test `checkout.session.completed` is accepted.
5. Set `VOICE_PROVIDER=realtime` with `DEEPGRAM_API_KEY` and an LLM key, then **place a real call and listen to it end to end.** This is still the single most important unverified thing in the project.
6. Set `EMAIL_API_KEY` and `EMAIL_FROM_ADDRESS`, then trigger one real send to a real inbox. Until this is done, every customer email records a `failed` row — visible, but not delivered.
7. Enable `ENABLE_SCHEDULER` on one replica only.
8. Run each data script in dry-run against production data and read the counts before applying.
9. `aiDisclosureEnabled` defaults to on, which announces the automated assistant and that the call is captured. Leave it on unless you have checked the consent rules in every state you operate in.
10. Decide a transcript retention window and set `DATA_RETENTION_DAYS`. It defaults to `0` (off) so a first boot cannot start deleting an operator's existing records.

---

## Design documents

`ADVANCED_AUTOMATIONS_ROADMAP.md` and `EXISTING_7_FEATURES_IMPROVEMENT_PLAN.md` are **forward-looking design docs**, not descriptions of the current build. Each carries a status header noting what has since shipped. Treat this README as the source of truth for what exists.
