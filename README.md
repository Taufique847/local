# BlueCollar AI

An AI phone receptionist for US home-service contractors (HVAC, plumbing, electrical, roofing).

It answers inbound calls, qualifies the job, books the appointment into the calendar, texts back callers it could not convert, and routes emergencies to a human.

---

## What actually works today

Be aware of the distinction below — it is the difference between a demo and a deployment.

### Fully implemented

| Area | Detail |
|---|---|
| **Auth** | Signup/login, bcrypt (cost 12), httpOnly + `secure` + `sameSite` JWT cookie, per-request active-user check |
| **Multi-tenancy** | Every query scoped by `businessId`, derived server-side from the session — never from the request body |
| **Telephony** | Real Twilio: number search, provisioning, TwiML, bidirectional Media Streams WebSocket, signature verification on every webhook |
| **AI voice engine** | Deepgram Nova-2 streaming STT → OpenAI tool-calling LLM → Deepgram Aura TTS, as 8 kHz μ-law frames. Local VAD barge-in with Twilio `clear`. Per-call latency + token + audio metrics recorded |
| **AI tools** | 7 tools the model can call: customer lookup, availability, lead create/update, book appointment, send SMS, transfer call, knowledge-base search — all with policy guardrails |
| **Guardrails** | Per-business booking notice/horizon limits, authorised diagnostic + emergency fees, emergency keyword list, prohibited claims, all injected into the system prompt |
| **CRM & ops** | Customers (with 360 timeline + agent memory), leads, services, appointments, availability, technicians, service zones |
| **Missed-call recovery** | 3-step SMS drip, TCPA quiet hours, STOP/START opt-out, conversational SMS booking |
| **Reputation** | Delayed post-service CSAT survey; 4–5★ → your Google link, 1–3★ → kept private and escalated to you with a 24h SLA |
| **Estimates & invoices** | Line items, tax, e-signature, public share-token portal, Stripe Checkout for card payment |
| **Billing** | Real Stripe subscriptions, free trial, usage metering, plan enforcement on minutes and phone lines |
| **Background jobs** | In-process cron: drip follow-ups, review surveys, SLA sweeps, trial expiry |
| **Field worker PWA** | Mobile job list, check-in, photo capture, GPS |

### Not built (and the UI says so)

- **Multi-location / branches** — `/app/settings/locations` is an honest placeholder. There is no branch model.
- **Calendar sync (Google / Outlook)** — `/app/settings/integrations` is an honest placeholder. No OAuth app, no token storage, no sync worker.

### Known gaps you should plan for

- **No automated tests.** Type checking and builds pass; behaviour is unverified. The security-sensitive paths (portal share tokens, Stripe webhook signature, tenant scoping, payment application) deserve tests first.
- **The voice pipeline has not been exercised against live provider credentials.** It compiles and the protocol work is correct, but end-to-end audio has not been confirmed on a real call.
- **Voice is single-instance.** `VoiceStreamHandler` and `VoiceSessionService` hold per-call state in process memory, so the backend cannot be horizontally scaled while serving calls.
- **The scheduler must run on exactly one replica.** Enforced by configuration (`ENABLE_SCHEDULER`), not by a distributed lock. Two schedulers will double-send SMS.
- **No refresh tokens, token revocation, RBAC, or email verification.** A logged-in user of a business is effectively an owner, and logout does not invalidate an issued token server-side.
- **No call-recording disclosure in the greeting.** Several US states require two-party consent. Add a disclosure before recording in those markets.
- **No data retention or deletion policy.** Transcripts are kept indefinitely.
- **`backend/cookies.txt` was committed at one point.** It has been removed from the index, but it remains in git history — rewrite history or rotate anything it touched.

---

## Stack

- **Frontend** — Next.js 14 (App Router), React 18, TypeScript, Tailwind, Recharts
- **Backend** — Node 22, Express 4, TypeScript, Mongoose 8
- **Database** — MongoDB
- **Telephony** — Twilio (Voice, Media Streams, SMS)
- **Speech** — Deepgram (Nova-2 STT, Aura TTS)
- **Reasoning** — OpenAI Chat Completions with function calling
- **Payments** — Stripe (subscriptions + one-off invoice checkout)

---

## Repository layout

```text
.
├── backend/
│   ├── server.ts                  # entrypoint: config validation, DB, HTTP, WS, scheduler
│   └── src/
│       ├── config/                # env parsing + startup validation
│       ├── controllers/           # HTTP handlers (businessId always from session)
│       ├── jobs/scheduler.ts      # cron: drips, surveys, SLA, trial expiry
│       ├── middleware/            # auth, cors, helmet, rate limits, zod validation, logging
│       ├── models/                # Mongoose schemas
│       ├── routes/                # route tables
│       ├── services/
│       │   ├── ai-tools/          # tool registry + executor + guardrail gate
│       │   └── voice/
│       │       ├── providers/     # deepgram-stt, deepgram-tts, openai-llm, mulaw
│       │       ├── realtime-voice-provider.service.ts   # the orchestrator
│       │       └── voice-stream.handler.ts              # Twilio Media Streams bridge
│       ├── utils/                 # logger, share tokens, XML escaping
│       └── validation/schemas.ts  # zod request schemas
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
| `OPENAI_API_KEY` + `DEEPGRAM_API_KEY` | Both required for `realtime`. If either is missing the factory logs a warning and falls back to `mock` rather than answering with silence. |
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

---

## Operational endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness. 200 while the process is up. |
| `GET /api/health/ready` | Readiness. Returns **503** when the database is down or the scheduler has stalled. Reports DB state, telephony/billing mode, whether the voice engine is actually usable, active media streams, and per-job scheduler status. |
| `POST /api/health/jobs/:name/run` | Authenticated manual job trigger. Jobs: `lead_recovery_drips`, `review_surveys`, `review_sla_breaches`, `expire_trials`. |

---

## Going live checklist

1. Set every production-required variable — the server validates them at boot and refuses to start if one is missing.
2. Point `TWILIO_WEBHOOK_BASE_URL` at your public HTTPS origin and confirm a test call passes signature validation.
3. Register the Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`. Confirm a test `checkout.session.completed` is accepted.
4. Set `VOICE_PROVIDER=realtime` with both provider keys, then place a real call and listen to it end to end.
5. Enable `ENABLE_SCHEDULER` on one replica only.
6. Add a call-recording disclosure to the greeting for two-party-consent states.
7. Decide a transcript retention window.

---

## Design documents

`ADVANCED_AUTOMATIONS_ROADMAP.md` and `EXISTING_7_FEATURES_IMPROVEMENT_PLAN.md` are **forward-looking design docs**, not descriptions of the current build. Each carries a status header noting what has since shipped. Treat this README as the source of truth for what exists.
