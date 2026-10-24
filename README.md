# LED MESSENGER NODE

A local-first text and photo queue for venue visual workflows. Staff use a mobile web interface; a local host manages the queue, sends OSC, and writes rendered photo tiles to a Resolume watch folder.

This implementation uses Node.js/Express, Next.js, Socket.IO, SQLite, and Sharp. “Node” here refers to the runtime and local-host stack; this documentation does not describe a visual node-graph editor.

## Public repository status

This repository contains development source and setup documentation. It currently has no published GitHub releases. The setup steps below describe the public repository snapshot and do not establish production qualification or availability of a newer LED Messenger version.

Before using it on a venue network, review authentication defaults, session configuration, host binding, firewall rules, upload handling, and watch-folder permissions for your environment. The quick-start PINs below are defaults, not private credentials.

## Repo Layout

- `apps/`, `packages/`, `config/`, `storage/`: primary macOS/local-host build
- `LEDNODE-WINDOWS/`: Windows 11 port with separate docs, scripts, and operating guidance

The root project is the main development copy. The Windows port is intentionally isolated in `LEDNODE-WINDOWS` so platform-specific setup, firewall rules, and startup behavior do not get mixed into the macOS flow.

## Stack

- `apps/web`: Next.js + React + TypeScript mobile UI
- `apps/server`: Express + Socket.IO + SQLite + Sharp + OSC
- `packages/shared`: shared schemas, types, defaults

## macOS / Local Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

- Web UI: `http://localhost:41237`
- API/Socket server: `http://localhost:41238`
- Staff PIN default: `1213`
- VJ settings unlock PIN default: `6969`

For phones on the same Wi-Fi, open `http://<your-laptop-ip>:41237` instead of `localhost`.
The web app auto-targets `http://<same-host>:41238` for API calls unless `NEXT_PUBLIC_API_BASE` is set.

## Windows 11 Port

See `LEDNODE-WINDOWS/README-WINDOWS11.md` for the Windows runbook and `LEDNODE-WINDOWS/WINDOWS11_SECURITY_STRATEGY_MAR2026.md` for the security and deployment strategy.

## Features

- Staff PIN auth/session and protected queue routes
- VJ unlock + protected runtime settings at `/api/settings`
- Queue CRUD + send + cancel + clear-all
- Single-live-item guard and auto-clear timers
- OSC text send pipeline with configurable line wrapping
- Photo upload + server-side tile rendering + thumbnail + watch-folder copy
- Original uploaded file preserved in `storage/uploads` as fallback
- Realtime sync with Socket.IO

## Test

```bash
npm test
```
