# Registers the SMS worker in Windows Task Scheduler.
#   - Runs whether a user is logged on or not (SYSTEM account, no password stored)
#   - Starts at system startup, plus a 5-minute repeating check
#   - Only one instance (IgnoreNew); restarts 1 minute after a failure; no time limit
#   - Not stopped on battery
#
# Usage (PowerShell "Run as administrator"):
#   powershell -ExecutionPolicy Bypass -File .\sms-worker\install-task.ps1
#   powershell -ExecutionPolicy Bypass -File .\sms-worker\install-task.ps1 -Uninstall
#
# ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.

param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$TaskName = "SakunSmsWorker"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$principalCheck = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Run this in PowerShell opened with 'Run as administrator'." -ForegroundColor Red
    exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($Uninstall) {
    if ($existing) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed task $TaskName."
    } else {
        Write-Host "Task $TaskName is not registered."
    }
    Write-Host "If a worker is still running, it stops when the PC restarts (or end 'node.exe' in Task Manager)."
    exit 0
}

if (-not (Test-Path (Join-Path $here ".env"))) {
    Write-Host "Missing $here\.env - copy .env.example to .env and fill it in first." -ForegroundColor Red
    exit 1
}

$node = (Get-Command node -ErrorAction Stop).Source
Write-Host "node: $node"

$wrapper = Join-Path $here "run-worker.ps1"
$argument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$wrapper`" -NodePath `"$node`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $here

$atStartup = New-ScheduledTaskTrigger -AtStartup
# Backstop: every 5 minutes, start it if it is not running (IgnoreNew keeps it to one instance)
$every5min = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 999 `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd

if ($existing) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atStartup, $every5min) `
    -Principal $principal -Settings $settings -Force `
    -Description "Sakun attendance app SMS worker (Ppurio). Folder: $here" | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

$info = Get-ScheduledTask -TaskName $TaskName
Write-Host "Registered $TaskName - state: $($info.State)" -ForegroundColor Green
Write-Host "Log: $here\logs\sms-worker.log"
