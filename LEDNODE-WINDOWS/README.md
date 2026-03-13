# LED NODE

Local-first LED Messenger queue + OSC control system.

## Stack

- `apps/web`: Next.js + React + TypeScript mobile UI
- `apps/server`: Express + Socket.IO + SQLite + Sharp + OSC
- `packages/shared`: shared schemas, types, defaults

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

- Web UI: `http://localhost:41237`
- API/Socket server: `http://localhost:41238`
- Staff PIN default: `1213`
- VJ settings unlock PIN default: `6969`

For phones on the same Wi-Fi, open `http://<your-laptop-ip>:41237` (not `localhost`).
The web app now auto-targets `http://<same-host>:41238` for API calls unless `NEXT_PUBLIC_API_BASE` is explicitly set.

## Features implemented

- Staff PIN auth/session and protected queue routes
- VJ unlock + protected runtime settings (`/api/settings`)
- Queue CRUD + send + cancel + clear-all
- Single-live-item guard and auto-clear timers
- OSC text send pipeline (write text -> delay -> trigger)
- Photo upload + server-side tile rendering (3500x1080 default) + thumbnail + watch-folder copy
- Original uploaded file is preserved in `storage/uploads` as fallback
- Realtime sync with Socket.IO
- Word-aware line wrapping defaulted to 16 chars (configurable)

## Test

```bash
npm test
```
