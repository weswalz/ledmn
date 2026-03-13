# LED MESSENGER NODE (Windows 11)

This folder is a Windows-focused duplicate of the LED MESSENGER NODE stack.

- Web UI: Next.js (`apps/web`)
- API/OSC/queue: Node + Express + Socket.IO (`apps/server`)
- Shared schemas/types: (`packages/shared`)
- Local persistence: SQLite (`storage/sqlite`)
- Photo processing + watch-folder output: Sharp + local filesystem

## 1. Supported Deployment Modes

### Mode A (Recommended for Resolume): Local laptop host
Phone opens the laptop-hosted app URL directly over LAN or Tailscale.

- LAN URL example: `http://192.168.68.50:41237`
- Tailscale URL example: `http://100.x.y.z:41237`

This mode is the most reliable for OSC and local watch-folder output.

### Mode B: Cloud control + local output agent
`heights.clubkit.io` as control plane, laptop as output executor.

This requires a dedicated bridge/agent service. The current app does not yet split control-plane and output-agent roles.

## 2. Windows 11 Quick Start (Dev)

Open PowerShell in this folder and run:

```powershell
npm ci
npm run dev
```

Expected listeners:

- `http://0.0.0.0:41237` (web)
- `http://0.0.0.0:41238` (api)

Set OSC target in app settings as **host only** + **port only**:

- OSC host: `127.0.0.1` (if OSC receiver is on the same laptop)
- OSC host: target device IP (if remote receiver)
- OSC port: `2269`

Never put `host:port` in `oscHost`.

## 3. Windows 11 Production Start

Build once:

```powershell
npm run build
```

Start API:

```powershell
cd apps/server
npm run start
```

Start web in another terminal:

```powershell
cd apps/web
npm run start -- -H 0.0.0.0 -p 41237
```

## 4. Phone Access Rules

Phone and laptop must be reachable on the same network path:

- LAN mode: same Wi-Fi/LAN, use laptop LAN IP.
- Tailscale mode: both devices connected to same tailnet, use laptop Tailscale IP.

If phone shows `connection refused`, the service is not running or blocked by firewall.

## 5. Security-Critical Windows 11 Setup

Run these helpers as Administrator:

```powershell
./scripts/windows/01-preflight.ps1
./scripts/windows/02-configure-firewall.ps1 -WebPort 41237 -ApiPort 41238 -OscPort 2269
```

If Controlled Folder Access blocks writes to watch folder, allow Node:

```powershell
./scripts/windows/03-allow-cfa.ps1 -WatchFolder 'D:\Resolume\WatchFolder'
```

This script allow-lists `node.exe` for CFA and verifies the watch-folder path. It does not add the folder to CFA protected folders.

For auto-start on boot (production style):

```powershell
./scripts/windows/04-register-startup-tasks.ps1 -AppRoot 'C:\LEDNODE-WINDOWS' -WebPort 41237
```

## 6. Protocol Map (Operational)

- Browser -> Web: HTTP/HTTPS TCP (`41237` local, or reverse-proxy public)
- Browser -> API: HTTP + Socket.IO WebSocket/long-polling (`/api`, `/socket.io`)
- API -> OSC target: UDP (`2269` default)
- API -> watch folder: local filesystem write (or SMB path if configured)

## 7. Known Operational Pitfalls

- `getaddrinfo ENOTFOUND 192.168.x.x:41237`
  - Cause: `oscHost` mistakenly contains `host:port`
  - Fix: set host and port in separate fields
- `degraded` status after send
  - Cause: OSC destination unreachable or invalid
  - Fix: validate `oscHost`, `oscPort`, route, receiver listening
- Photo not appearing in Resolume
  - Cause: wrong watch-folder path or write denied
  - Fix: verify path, NTFS permissions, CFA exclusions

## 8. Important Files

- `WINDOWS11_SECURITY_STRATEGY_MAR2026.md`
- `scripts/windows/01-preflight.ps1`
- `scripts/windows/02-configure-firewall.ps1`
- `scripts/windows/03-allow-cfa.ps1`
- `scripts/windows/04-register-startup-tasks.ps1`
