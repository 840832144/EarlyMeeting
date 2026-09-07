param([ValidateSet('Check','Stop')][string]$Action = 'Check')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$localDir = Join-Path $PSScriptRoot '.local'
$sessionPath = Join-Path $localDir 'session.json'
try {
    if (-not (Test-Path -LiteralPath $sessionPath)) { Write-Host '[NOT_STARTED]'; exit 0 }
    $session = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
    $runGuid = [Guid]::Parse($session.runId)
    $nodePid = [int]$session.pid
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$nodePid"
    $entry = Join-Path $PSScriptRoot 'probe.cjs'
    $owned = $process -and $process.Name -eq 'node.exe' -and
        $process.CommandLine.Contains($entry) -and -not $session.stopped
    if ($Action -eq 'Check') {
        if ($owned) { Write-Host '[RUNNING]' } else { Write-Host '[NOT_RUNNING]' }
        # This file is written only by the sanitized output function.
        Get-Content -LiteralPath (Join-Path $localDir 'status.log') -Encoding UTF8 -Tail 15 -ErrorAction SilentlyContinue
        exit 0
    }
    if (-not $owned) { Write-Host '[NOT_RUNNING]'; exit 0 }
    @{runId=$runGuid.ToString()} | ConvertTo-Json -Compress |
        Set-Content -LiteralPath (Join-Path $localDir 'stop.json') -Encoding ASCII
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$nodePid"
        if (-not $current -or $current.CreationDate -ne $process.CreationDate) {
            Write-Host '[STOP_VERIFIED]'; exit 0
        }
    }
    Write-Host '[STOP_PENDING] Press Ctrl+C in the test window.'
    exit 1
} catch { Write-Host '[CONTROL_FAILED] No unrelated process was stopped.'; exit 1 }
