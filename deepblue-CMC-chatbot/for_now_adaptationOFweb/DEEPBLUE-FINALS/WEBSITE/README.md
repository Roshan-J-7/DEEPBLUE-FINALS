# HealthAssistant Web — CMC Frontend

A React + TypeScript web frontend for the HealthAssistant app. It connects to a live backend via an **ngrok tunnel URL** — no local backend setup needed.

---

## Prerequisites

Make sure you have the following installed before proceeding:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 18 or higher | https://nodejs.org |
| **npm** | comes with Node.js | — |

To verify:
```bash
node -v   # should print v18.x.x or higher
npm -v    # should print 9.x.x or higher
```

---

## Quick Start

### Step 1 — Clone the repo

```bash
git clone https://github.com/PratyushSowrirajan/webCMC.git
cd webCMC
```

### Step 2 — Set the ngrok URL

Open `vite.config.ts` and update the `NGROK_URL` constant at the top to the current ngrok tunnel URL you've been given:

```ts
// vite.config.ts  ← edit this line
const NGROK_URL = 'https://YOUR-NGROK-URL-HERE.ngrok-free.app'
```

> **Note:** ngrok free-tier URLs change every time the tunnel is restarted. Whoever is running the backend will need to share the current URL with you.

### Step 3 — Install dependencies

```bash
npm install
```

This installs all packages listed in `package.json`. It may take a minute — it only needs to be done once (or after pulling new changes).

### Step 4 — Start the dev server

```bash
npm run dev
```

The app will be available at **http://localhost:3000**

---

## How It Works

```
Your Browser (localhost:3000)
        │
        │  /api/* requests
        ▼
  Vite Dev Server (proxy)
        │
        │  forwards to ngrok tunnel
        ▼
  https://xxxx.ngrok-free.app
        │
        │  tunnels to
        ▼
  FastAPI Backend (port 8000, running on the other person's machine)
```

All API calls from the app go to `/api/...`. The Vite dev server automatically proxies them through the ngrok URL so you never need to touch the backend directly.

---

## Pages & Features

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | Landing page, entry to app |
| **Auth** | `/auth` | Login / Sign up |
| **Assessment** | `/assessment` | Symptom questionnaire with optional photo upload |
| **Report** | `/report` | AI-generated health assessment report |
| **Chat (Remy)** | `/chat` | Chat with the Remy AI assistant |

---

## Project Structure

```
├── src/
│   ├── api/
│   │   └── api.ts            # All backend API calls (central)
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── AuthPage.tsx      # Login / Sign up
│   │   ├── AssessmentPage.tsx
│   │   ├── ReportPage.tsx
│   │   └── ChatPage.tsx
│   ├── store/
│   │   └── healthStore.ts    # localStorage state (profile, token)
│   ├── types/
│   │   └── api.types.ts      # TypeScript interfaces for all API shapes
│   ├── App.tsx               # React Router root
│   ├── main.tsx
│   └── index.css
├── public/
├── vite.config.ts            # ← update NGROK_URL here
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## NPM Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview the production build locally |

---

## Dependencies (what gets installed)

### Runtime
| Package | Purpose |
|---------|---------|
| `react` `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `lucide-react` | Icon library |

### Dev / Build
| Package | Purpose |
|---------|---------|
| `vite` | Dev server + bundler |
| `@vitejs/plugin-react` | React support for Vite |
| `typescript` | Type checking |
| `tailwindcss` | Utility-first CSS |
| `postcss` `autoprefixer` | CSS processing for Tailwind |
| `@types/react` `@types/react-dom` | TypeScript type definitions |

---

## Troubleshooting

**`npm install` fails**
- Make sure you're using Node.js 18+. Run `node -v` to check.
- Try deleting `node_modules/` and `package-lock.json`, then run `npm install` again.

**App opens but all API calls fail / show "Failed to fetch"**
- The ngrok URL in `vite.config.ts` is outdated or wrong. Get the latest URL from the backend owner and update it, then restart `npm run dev`.

**`npm run dev` — port 3000 already in use**
- Another process is using port 3000. Either stop it, or change the port in `vite.config.ts`:
  ```ts
  server: { port: 3001 }
  ```

**Login says "Invalid credentials" or "User not found"**
- You need to sign up first (the Auth page has a Sign Up tab). Accounts live in the backend database.

**Assessment / Chat loads forever**
- The backend AI model (LLM) can take 30–90 seconds to respond. This is normal. Wait for it.
