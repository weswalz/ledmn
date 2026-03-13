# LED MESSENGER Windows 11 Execution Plan

## Purpose

This document is written for Claude Code or another coding agent to execute the Windows 11 port and deployment work with minimal ambiguity.

The target production topology is:

`iPhone Safari -> Windows 11 laptop host -> local Node/API -> Resolume on same Windows machine`

This is a local-host architecture, not a cloud-bridge architecture.

## Non-Negotiable Architecture

- The Windows 11 machine hosts both the Next.js web app and the Node/Express API.
- The iPhone connects directly to the Windows host by LAN IP or Tailscale IP.
- SQLite remains local on the Windows machine.
- OSC is sent from the Windows machine to Resolume.
- The watch-folder output is written by the Windows machine to a local Windows filesystem path.
- The image pipeline must save both:
  - the tiled render used for display
  - the original uploaded image as fallback

## Explicitly Out Of Scope

- No dependency on `heights.clubkit.io` for normal local operation.
- No cloud-to-local bridge agent in this phase.
- No database migration away from SQLite in this phase.
- No remote object storage in this phase.

## Source Of Truth

- Web UI source: `LEDNODE-WINDOWS/apps/web`
- API/OSC/queue source: `LEDNODE-WINDOWS/apps/server`
- Shared types and config: `LEDNODE-WINDOWS/packages/shared`
- Windows operating instructions: `LEDNODE-WINDOWS/README-WINDOWS11.md`
- Windows security strategy: `LEDNODE-WINDOWS/WINDOWS11_SECURITY_STRATEGY_MAR2026.md`

## Required Runtime Behavior

### Network flow

- iPhone opens `http://<windows-ip>:41237`
- Next.js app serves UI on port `41237`
- UI talks to API on `http://<same-host>:41238`
- Socket.IO connects to the Windows API host on port `41238`

### Media and control flow

- User creates message on iPhone
- API stores queue item and settings in SQLite
- API sends wrapped text over OSC
- API writes tiled image into the configured Resolume watch folder
- API preserves original uploaded image in uploads storage
- Cancel or expiry clears the configured clip slot

### Default Resolume-local assumptions

- `oscHost = 127.0.0.1`
- `oscPort = 2269`
- `resolumeWatchDir = D:\Resolume\WatchFolder`

## Constraints

- Do not require public DNS for the local workflow.
- Do not require HTTPS for first-pass LAN validation.
- Do not disable Windows Defender Firewall.
- Do not disable VBS/HVCI or other platform security controls just to make the app work.
- Do not store runtime state in `.env`.
- Do not put `host:port` in `oscHost`.

## Current Code Assumptions To Preserve

- SQLite via `better-sqlite3`
- Express + Socket.IO server as source of truth
- Next.js web frontend
- Sharp-based server-side image processing
- Local file output to watch folder
- 16-character default line wrapping
- Staff PIN `1213`
- VJ PIN `6969`

## Phase Plan

## Phase 1: Confirm local Windows topology

### Objective

Make the docs and runtime assumptions unambiguous: the production target is direct iPhone-to-Windows access.

### Tasks

- Update Windows docs to state that local Windows hosting is the primary mode.
- Remove any language that implies the hosted domain is part of the required local runtime path.
- Keep cloud bridge work documented only as future architecture.

### Acceptance criteria

- A human operator can tell in under one minute that the intended path is `iPhone -> Windows host`.

## Phase 2: Validate Windows host listeners

### Objective

Ensure the app listens on addresses reachable from the iPhone.

### Tasks

- Confirm web server binds to `0.0.0.0:41237`
- Confirm API server binds to `0.0.0.0:41238`
- Confirm client API base resolution uses current host and does not hardcode localhost on mobile
- Confirm Socket.IO uses the reachable API host

### Acceptance criteria

- From another device on the same network, `http://<windows-ip>:41237` loads
- API requests and socket connection succeed from the iPhone

## Phase 3: Validate Windows storage paths

### Objective

Make all file writes predictable on Windows.

### Tasks

- Confirm SQLite database path resolves under `storage/sqlite/lednode.db`
- Confirm uploads path resolves under `storage/uploads`
- Confirm processed watch output resolves to configured Windows path
- Confirm original image file is preserved separately from tiled output
- Confirm Windows paths with drive letters and backslashes are handled correctly

### Acceptance criteria

- New message with photo creates:
  - queue row in SQLite
  - original upload file
  - tiled output file
  - thumbnail file if applicable

## Phase 4: Resolume integration validation

### Objective

Make Node-to-Resolume communication deterministic on the Windows host.

### Tasks

- Set default OSC host to `127.0.0.1` when Resolume is local
- Keep OSC port default at `2269`
- Validate text clip addressing
- Validate photo slot addressing
- Validate clear clip behavior for:
  - cancel action
  - timer expiry

### Acceptance criteria

- Sending a text-only item updates the intended text clip in Resolume
- Sending a text+photo item updates text and writes expected media asset
- Cancel clears the configured slot
- Auto-expiry clears the configured slot

## Phase 5: Windows firewall and Defender hardening

### Objective

Allow required traffic and writes without weakening the host unnecessarily.

### Tasks

- Apply inbound firewall allow rule for `41237` on trusted profile
- Apply inbound firewall allow rule for `41238` on trusted profile
- Apply outbound allow rule for UDP `2269`
- Allow `node.exe` for Controlled Folder Access if needed
- Verify watch folder path permissions

### Acceptance criteria

- iPhone reaches the web app without disabling firewall
- Watch folder writes succeed without turning off Defender protections globally

## Phase 6: Startup and recovery

### Objective

Make the Windows host survive reboot without manual terminal work.

### Tasks

- Build production artifacts
- Register startup task for API
- Register startup task for web
- Verify both recover after Windows reboot
- Document log locations and restart procedure

### Acceptance criteria

- After reboot, operator can open the app from iPhone without manually starting terminals

## Phase 7: Tailscale optional path

### Objective

Support secure direct remote access when LAN is not suitable.

### Tasks

- Confirm Tailscale is installed on Windows host
- Confirm Tailscale is installed and connected on iPhone when remote access is desired
- Use Windows Tailscale IP as the app URL
- Keep application topology unchanged

### Acceptance criteria

- Remote iPhone can load the same Windows-hosted app through Tailscale IP

## Implementation Checklist For Claude Code

- [ ] Verify all Windows docs point to local-host topology first
- [ ] Verify web bind host is externally reachable
- [ ] Verify API bind host is externally reachable
- [ ] Verify mobile client does not fall back to localhost
- [ ] Verify Socket.IO host resolution works on iPhone Safari
- [ ] Verify SQLite path is local and writable
- [ ] Verify uploads, processed, and thumbnail folders exist
- [ ] Verify tiled image + original image preservation both occur
- [ ] Verify cancel clears configured clip
- [ ] Verify expiry clears configured clip
- [ ] Verify Windows firewall scripts match actual ports
- [ ] Verify CFA helper allow-lists `node.exe`
- [ ] Verify startup tasks use correct working directories
- [ ] Verify README instructions match actual runtime behavior

## Validation Commands

Run from the Windows project root:

```powershell
npm ci
npm run build
```

Run dev:

```powershell
npm run dev
```

Expected endpoints:

```text
http://0.0.0.0:41237
http://0.0.0.0:41238
```

Windows preflight:

```powershell
./scripts/windows/01-preflight.ps1
./scripts/windows/02-configure-firewall.ps1 -WebPort 41237 -ApiPort 41238 -OscPort 2269
./scripts/windows/03-allow-cfa.ps1 -WatchFolder 'D:\Resolume\WatchFolder'
```

## Manual QA Matrix

### Scenario A: Text only

- Create message from iPhone
- Send to wall
- Verify text arrives in Resolume
- Wait for expiry
- Verify clear clip is triggered

### Scenario B: Text plus photo

- Create message with photo from iPhone
- Send to wall
- Verify original file saved
- Verify tiled image saved to watch folder
- Verify Resolume picks up asset correctly

### Scenario C: Cancel

- Send message live
- Cancel message
- Verify configured clear clip is triggered

### Scenario D: Multi-device

- Open app on two iPhones
- Confirm both can log in simultaneously
- Confirm realtime state updates stay in sync

## Failure Conditions

Treat these as blockers:

- iPhone can load HTML but cannot reach API
- Socket.IO works on desktop but not on iPhone
- SQLite locks or write failures on Windows
- Resolume receives no OSC despite valid local host/port
- Watch folder writes fail because of Windows security policy
- Original image is not preserved
- Cancel and expiry do not clear clips

## Definition Of Done

The work is complete only when all of the following are true:

- iPhone Safari can operate the app against a Windows 11 host
- Windows host persists queue/settings locally in SQLite
- Node sends OSC to local Resolume on port `2269`
- Node writes tiled media into the configured watch folder
- Node preserves the original upload as fallback
- Cancel and timer expiry both clear the configured clip
- The host remains functional after reboot
- The deployment does not depend on `heights.clubkit.io`

## Future Architecture Note

If hosted control through `heights.clubkit.io` is required later, that is a separate project:

- cloud control plane
- authenticated local Windows output agent
- outbound secure channel from agent to cloud
- job acknowledgement and retry semantics

Do not mix that work into this local Windows deployment phase.
