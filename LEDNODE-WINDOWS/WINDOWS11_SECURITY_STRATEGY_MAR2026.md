# LED MESSENGER NODE Windows 11 Strategy (March 2026)

## Executive Summary

A realistic, secure Windows 11 deployment for LED MESSENGER requires:

1. Keep OSC + watch-folder execution on the same machine/network as Resolume.
2. Treat browser/UI plane and output plane as separate trust zones.
3. Use Windows Defender Firewall allow rules (not firewall disable), scoped to Private/Tailscale profiles and specific ports/apps.
4. Preserve modern Windows protections (SmartScreen, Smart App Control/WDAC posture, VBS/HVCI) and explicitly allow only what is needed.
5. Handle Controlled Folder Access so Node can write to the designated watch folder.

## 1) Architecture Reality Check

### What is realistic

- Local-hosted Node stack on Windows laptop + phone connecting via LAN/Tailscale.
- OSC UDP sent from laptop to local network destinations.
- Image output written to local folder path watched by Resolume.

### What is not realistic without extra engineering

- Phone using `heights.clubkit.io` while expecting a separate laptop to perform OSC/folder output, unless a bridge agent is introduced.

## 2) Threat Model and Protocol Surfaces

### Browser/API plane

- HTTP(S) + Socket.IO (`/api`, `/socket.io`)
- Risks: unauthorized access, CSRF/session theft, port exposure, malformed request abuse
- Controls: auth PINs, reverse proxy, firewall profile scoping, TLS, log monitoring

### OSC plane

- UDP 2269 default
- Risks: spoofed or misrouted UDP, destination errors, local broadcast mistakes
- Controls: explicit destination IP, local-network segmentation, firewall outbound scoping

### File output plane

- Local write to watch folder (NTFS / optional SMB)
- Risks: ransomware controls blocking writes, wrong ACLs, wrong path, SMB policy mismatch
- Controls: folder ACL hygiene, CFA app allow-list, SMB signing/encryption compliance

## 3) Windows 11 Security Controls You Must Account For

### 3.1 Defender Firewall profiles and rule model

- Windows blocks inbound by default and uses Domain/Private/Public profiles.
- Keep firewall enabled; add explicit allow rules only for required ports/apps.
- Prefer Private profile and/or Tailscale CIDR scoping (`100.64.0.0/10`) where applicable.

Recommended rules for local laptop host:

- Inbound TCP 41237 (web), Private profile only
- Inbound TCP 41238 (api) only if needed directly
- Outbound UDP 2269 to OSC targets

### 3.2 SmartScreen / App & Browser Control

- SmartScreen reputation protection can warn/block unknown binaries and downloads.
- Operational response: use trusted distribution channel and signed artifacts where possible.

### 3.3 Smart App Control / App Control posture

- Smart App Control can block untrusted apps on eligible clean installs.
- Signed code has materially better allow outcomes.
- Enterprise-managed environments may instead enforce App Control for Business (WDAC).

### 3.4 Controlled Folder Access (CFA)

- CFA can block Node from writing image files to protected paths.
- Add `node.exe` (and if needed helper binaries) to CFA allowed applications.
- Prefer a dedicated non-user-profile watch folder (e.g., `D:\Resolume\WatchFolder`) over protected user folders.

### 3.5 VBS/HVCI (Memory Integrity)

- Keep Memory Integrity enabled whenever compatible.
- Do not disable to "make app run"; fix driver/app compatibility properly.

### 3.6 PowerShell Execution Policy

- Execution policy precedence can be domain/GPO controlled.
- For local automation scripts, use `RemoteSigned` or per-process bypass when policy allows.
- Do not globally weaken policy without change control.

### 3.7 SMB hardening (if using network shares)

- Windows 11 24H2+ raises default SMB security posture (signing required by default).
- If watch folder is on SMB storage, ensure NAS/server supports SMB signing/encryption expectations.
- Avoid SMB guest fallback patterns.

## 4) Porting Plan

### Phase 0: Baseline and inventory

- Pin Node LTS version for Windows 11 image.
- Confirm native addon install success (`sharp`, `better-sqlite3`).
- Validate storage paths and ACLs.

### Phase 1: Functional parity on Windows

- `npm ci`, `npm run build`, `npm run dev` on Windows 11.
- Validate:
  - login/session/auth
  - queue CRUD
  - send/cancel
  - photo upload, tile, original backup output
  - line-wrap behavior

### Phase 2: Security hardening

- Set active network profile to Private for trusted LAN.
- Create scoped firewall allow rules.
- Keep Defender Firewall enabled.
- Configure CFA allow-list for Node + watch folder path.
- Validate SmartScreen/App Control interactions with your package/signing strategy.

### Phase 3: Operationalization

- Run via scheduled startup tasks (or enterprise service wrapper policy).
- Centralize logs (event logs + app logs).
- Backup SQLite + output folders with retention.
- Document rollback and break-glass procedures.

## 5) Windows Startup/Service Strategy

Use startup scheduled tasks for API and Web processes under a least-privilege model where possible.

- Trigger: `AtStartup`
- Run level: highest only if required
- Working directory explicit
- Restart policy enabled
- Separate tasks for web and api for isolated restart behavior

## 6) Secure Topologies

### Topology A (recommended now)

- Windows laptop hosts API+Web
- Phone connects over LAN or Tailscale directly to laptop
- OSC + watch-folder local and deterministic

### Topology B (future)

- Cloud UI/control plane + Windows output bridge agent
- Bridge maintains outbound secure channel to cloud
- Cloud pushes render/send jobs to bridge
- Bridge handles local OSC/file output and status acknowledgments

## 7) Verification Checklist

- [ ] `http://<laptop-ip>:41237` reachable from phone
- [ ] API health ok
- [ ] OSC destination host resolvable/reachable
- [ ] UDP 2269 listener confirmed at receiver
- [ ] watch-folder receives both tiled output and original backup
- [ ] cancel/expiry clear clip behavior confirmed
- [ ] no requirement to disable Firewall, Defender, or VBS

## 8) Source References (researched Mar 11, 2026)

- Windows Firewall overview: https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/
- Configure firewall rules / command line: https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/configure
- Manage firewall with command line: https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/configure-with-command-line
- Windows Firewall rules guidance: https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules
- Smart App Control overview: https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview
- Smart App Control signing guidance: https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control
- Windows 11 app/driver control book: https://learn.microsoft.com/en-us/windows/security/book/application-security-application-and-driver-control
- App & browser control (support): https://support.microsoft.com/en-us/windows/app-browser-control-in-the-windows-security-app-8f68fb65-ebb4-3cfb-4bd7-ef0f376f3dc3
- SmartScreen policy settings: https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/available-settings
- Controlled folder access enablement: https://learn.microsoft.com/en-us/defender-endpoint/enable-controlled-folders
- Controlled folder access customization: https://learn.microsoft.com/en-us/defender-endpoint/customize-controlled-folders
- Memory integrity/HVCI: https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/oem-hvci-enablement
- App Control for Business overview: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/windows-defender-application-control/wdac-and-applocker-overview
- PowerShell execution policies: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-7.5
- Policy CSP for PowerShell execution: https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-admx-powershellexecutionpolicy
- SMB security hardening: https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security-hardening
- SMB signing behavior: https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-signing
- SMB client encryption requirement: https://learn.microsoft.com/en-us/windows-server/storage/file-server/configure-smb-client-require-encryption
- Tailscale Windows install: https://tailscale.com/docs/install/windows
- Tailscale client preferences: https://tailscale.com/docs/features/client/manage-preferences
- Tailscale system policies: https://tailscale.com/docs/features/tailscale-system-policies
- Next.js self-hosting (2026): https://nextjs.org/docs/pages/guides/self-hosting
- Next.js deployment docs (2026): https://nextjs.org/docs/app/getting-started/deploying
- Socket.IO transport fallback behavior: https://socket.io/
- Node.js releases/download policy: https://nodejs.org/en/download/releases/
- sharp installation/prerequisites: https://sharp.pixelplumbing.com/install/
- node-osc package/protocol context: https://www.npmjs.com/package/node-osc
