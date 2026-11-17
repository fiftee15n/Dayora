# Dayora Web (Next.js)

Next.js 15 · TypeScript · Tailwind CSS v4 · shadcn-style UI (Radix) · Recharts · SWR · Zod

## Run

```bash
npm install
copy .env.example .env.local      # BACKEND_URL=http://127.0.0.1:8000
npm run dev                       # http://localhost:3000
```

The FastAPI backend must be running (see `../backend`). Demo login: `demo@dayora.app` / `demo1234`.

## How it talks to the API
`next.config.ts` proxies `/api/*` and `/uploads/*` to `BACKEND_URL`, so the HTTP-only auth
cookie stays first-party (no CORS or third-party cookies in dev or on Vercel).
`src/middleware.ts` redirects signed-out visitors to `/login`.
Every request sends `X-TZ-Offset` so "today" follows the user's local timezone.

## Structure
```
src/app/(auth)/        login, register, forgot-password, reset-password
src/app/(app)/         dashboard, tasks, expenses, habits, calendar, notes, history, settings
src/components/ui/     button, card, input, dialog, dropdown-menu, badge, misc (progress, stat card…)
src/components/forms/  task / transaction / habit / reminder dialogs (Zod-validated)
src/components/shell/  sidebar + top bar, quick-add, browser reminder notifications
src/lib/               api client, types, validators, utils
```

## Theme
Indigo & Violet (`#6366F1` → `#8B5CF6`), light / dark / system. Tokens live in
`src/app/globals.css`.

## Build
```bash
npm run build && npm start
```
