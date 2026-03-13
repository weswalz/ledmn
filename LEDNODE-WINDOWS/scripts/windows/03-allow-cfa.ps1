[CmdletBinding()]
param(
  [string]$NodePath,
  [string]$WatchFolder
)

$ErrorActionPreference = 'Stop'

if (-not $NodePath) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    throw 'node.exe not found in PATH. Pass -NodePath explicitly.'
  }
  $NodePath = $nodeCmd.Source
}

Write-Host "Allowing Node in Controlled Folder Access: $NodePath" -ForegroundColor Cyan
Add-MpPreference -ControlledFolderAccessAllowedApplications $NodePath

if ($WatchFolder) {
  if (-not (Test-Path $WatchFolder)) {
    throw "Watch folder does not exist: $WatchFolder"
  }

  Write-Host "Watch folder exists: $WatchFolder" -ForegroundColor Cyan
  Write-Host 'If writes are still blocked, keep CFA enabled and review Defender blocked events for this folder.' -ForegroundColor Yellow
}

Write-Host 'Controlled Folder Access settings updated.' -ForegroundColor Green
