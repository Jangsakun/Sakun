# SMS worker supervisor loop (started by Task Scheduler, see install-task.ps1).
# Runs worker.mjs; when it exits for any reason, waits 60 seconds and starts it again.
# ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.

param([string]$NodePath = "node")

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $here "logs"
$logFile = Join-Path $logDir "sms-worker.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

while ($true) {
    & $NodePath (Join-Path $here "worker.mjs")
    $code = $LASTEXITCODE
    $line = "{0} [wrapper] worker exited (code {1}) - restarting in 60s" -f (Get-Date).ToUniversalTime().ToString("o"), $code
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Start-Sleep -Seconds 60
}
