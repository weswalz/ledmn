[CmdletBinding()]
param(
  [int]$WebPort = 41237,
  [int]$ApiPort = 41238,
  [int]$OscPort = 2269
)

$ErrorActionPreference = 'Stop'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host '=== LED MESSENGER Windows Preflight ===' -ForegroundColor Cyan
Write-Host ("Admin: {0}" -f (Test-Admin))

Write-Host "`nNode/NPM versions:" -ForegroundColor Yellow
try { node -v } catch { Write-Warning 'node not found in PATH' }
try { npm -v } catch { Write-Warning 'npm not found in PATH' }

Write-Host "`nNetwork profiles:" -ForegroundColor Yellow
try { Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory, IPv4Connectivity | Format-Table -AutoSize } catch { Write-Warning $_ }

Write-Host "`nExisting listeners (target ports):" -ForegroundColor Yellow
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @($WebPort, $ApiPort) } |
  Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize

Write-Host "`nDefender Controlled Folder Access mode:" -ForegroundColor Yellow
try {
  $mp = Get-MpPreference
  Write-Host ("ControlledFolderAccessMode: {0}" -f $mp.EnableControlledFolderAccess)
} catch {
  Write-Warning 'Could not query Defender preferences. Run as admin.'
}

Write-Host "`nTailscale status:" -ForegroundColor Yellow
try { tailscale ip -4 } catch { Write-Warning 'tailscale CLI not found' }

Write-Host "`nPreflight complete." -ForegroundColor Green
