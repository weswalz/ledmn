[CmdletBinding()]
param(
  [int]$WebPort = 41237,
  [int]$ApiPort = 41238,
  [int]$OscPort = 2269,
  [string]$LanCidr = '192.168.0.0/16',
  [string]$TailscaleCidr = '100.64.0.0/10',
  [switch]$UseTailscaleScope
)

$ErrorActionPreference = 'Stop'

function Upsert-FirewallRule {
  param(
    [string]$Name,
    [string]$Direction,
    [string]$Protocol,
    [string]$Action,
    [int]$Port,
    [string]$Profile = 'Private',
    [string]$RemoteAddress = 'Any'
  )

  Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue | Out-Null

  New-NetFirewallRule `
    -DisplayName $Name `
    -Direction $Direction `
    -Protocol $Protocol `
    -Action $Action `
    -LocalPort $Port `
    -Profile $Profile `
    -RemoteAddress $RemoteAddress | Out-Null

  Write-Host "Applied: $Name"
}

$remoteScope = if ($UseTailscaleScope) { $TailscaleCidr } else { $LanCidr }

Write-Host "Creating inbound rule for Web TCP $WebPort scope=$remoteScope" -ForegroundColor Cyan
Upsert-FirewallRule -Name 'LED Messenger Web Inbound' -Direction Inbound -Protocol TCP -Action Allow -Port $WebPort -Profile Private -RemoteAddress $remoteScope

Write-Host "Creating inbound rule for API TCP $ApiPort scope=$remoteScope" -ForegroundColor Cyan
Upsert-FirewallRule -Name 'LED Messenger API Inbound' -Direction Inbound -Protocol TCP -Action Allow -Port $ApiPort -Profile Private -RemoteAddress $remoteScope

Write-Host "Creating outbound rule for OSC UDP $OscPort" -ForegroundColor Cyan
Get-NetFirewallRule -DisplayName 'LED Messenger OSC Outbound' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule `
  -DisplayName 'LED Messenger OSC Outbound' `
  -Direction Outbound `
  -Protocol UDP `
  -Action Allow `
  -RemotePort $OscPort `
  -Profile Any | Out-Null

Write-Host 'Firewall rules applied.' -ForegroundColor Green
