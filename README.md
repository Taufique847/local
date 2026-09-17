# BlueCollar AI — AI Employee Platform for Home-Service Businesses

## 1. What is BlueCollar AI?
**BlueCollar AI** is an intelligent AI employee SaaS platform tailored specifically for US blue-collar and home-service businesses (starting with HVAC companies). Eventually, it will autonomously handle inbound phone calls, qualify customer leads, check appointment availability, schedule dispatch bookings, send automated SMS notifications, and provide real-time operational insights via an intuitive SaaS dashboard.

---

## 2. Current Milestone: M1 — Project Foundation
**Milestone 1 (M1)** establishes the robust, scalable technical foundation for BlueCollar AI. 
This phase focuses exclusively on architecture, clean monorepo separation, environment configuration, health check diagnostics, and a modern, responsive status UI.

---

## 3. Technology Stack
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Communication**: REST APIs (Frontend communicates with Backend via native `fetch`)
- **Design Tokens**: Accessible, modern B2B SaaS system foundation (ready for clean `shadcn/ui` addition)

---

## 4. Project Structure
```text
bluecollar-ai/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── badge.tsx
│   │       └── status-indicator.tsx
│   ├── lib/
│   │   └── utils.ts
│   ├── services/
│   │   └── health.service.ts
│   ├── types/
│   │   └── index.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── controllers/
│   │   │   └── health.controller.ts
│   │   ├── middleware/
│   │   │   ├── cors.ts
│   │   │   ├── requestLogger.ts
│   │   │   ├── notFoundHandler.ts
│   │   │   └── errorHandler.ts
│   │   ├── routes/
│   │   │   ├── health.routes.ts
│   │   │   └── index.ts
│   │   ├── services/
│   │   │   └── health.service.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   └── response.ts
│   │   └── app.ts
│   ├── server.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── README.md
├── .gitignore
└── .env.example
```

---

## 5. Prerequisites
- **Node.js**: v18.0.0+ (Tested on v24.12.0)
- **npm**: v9.0.0+ (Tested on v11.6.2)

---

## 6. How to Install Dependencies

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

---

## 7. How to Configure Environment Variables

### Backend
Copy `.env.example` to `.env`:
```bash
cp backend/.env.example backend/.env
```
Default values:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Frontend
Copy `.env.example` to `.env.local`:
```bash
cp frontend/.env.example frontend/.env.local
```
Default values:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 8. How to Run the Backend
From the `backend` directory:
```bash
# Start in development mode (with hot reloading via tsx)
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Start production server
npm start
```
Backend will be available at: `http://localhost:5000`

---

## 9. How to Run the Frontend
From the `frontend` directory:
```bash
# Start in development mode
npm run dev

# Type check and build
npm run build

# Start production server
npm start
```
Frontend will be accessible at: `http://localhost:3000`

---

## 10. Health-Check Endpoint
The backend exposes a standardized health check endpoint:

- **Method**: `GET`
- **Route**: `/api/health`
- **Response Format**:
```json
{
  "success": true,
  "message": "BlueCollar AI backend is running",
  "environment": "development"
}
```

---

## 11. Frontend to Backend Communication
- Frontend communicates with the backend via the `health.service.ts` service layer.
- Direct hardcoding of API URLs in UI components is strictly prohibited; all requests read `NEXT_PUBLIC_API_URL`.
- The frontend foundation page actively polls/pings `/api/health` and provides a live connection indicator (`Connected` vs `Disconnected`), roundtrip latency metrics, and an interactive diagnostic tester.

---

## 12. Intentionally NOT Implemented in M1
In accordance with M1 boundaries, the following features belong to future milestones and are **strictly not implemented**:
- **Authentication & Authorization**: Signup, Login, JWT, Sessions, Passwords (M2)
- **Database**: MongoDB, Mongoose models, Business / Lead / Customer entities (M3)
- **Telephony**: Twilio, Voice Webhooks, Call streaming (M4)
- **AI / LLMs**: Azure OpenAI, OpenAI, Gemini, Prompt Engineering, Realtime voice agents (M5)
- **Business Operations**: CRM, Dispatch, Calendar booking, SMS alerts, Stripe billing
