[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$AppRoot,
  [int]$WebPort = 41237,
  [switch]$Recreate
)

$ErrorActionPreference = 'Stop'

$apiTaskName = 'LEDMessenger-API'
$webTaskName = 'LEDMessenger-Web'

$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)

$apiCmd = "cd /d `"$AppRoot\apps\server`" && npm run start"
$webCmd = "cd /d `"$AppRoot\apps\web`" && npm run start -- -H 0.0.0.0 -p $WebPort"

$apiAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $apiCmd"
$webAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $webCmd"

if ($Recreate) {
  Unregister-ScheduledTask -TaskName $apiTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $webTaskName -Confirm:$false -ErrorAction SilentlyContinue
}

Register-ScheduledTask -TaskName $apiTaskName -Action $apiAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Register-ScheduledTask -TaskName $webTaskName -Action $webAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Host 'Startup tasks registered:' -ForegroundColor Green
Write-Host "- $apiTaskName"
Write-Host "- $webTaskName"
