$ErrorActionPreference = 'Stop'
try {
    & (Join-Path $PSScriptRoot 'control.ps1') -Action Stop
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $backup = Join-Path $PSScriptRoot '.local\backup-v0.1.0'
    $names = @('probe.cjs','start.ps1','START_TEST.cmd','package.json')
    foreach ($name in $names) {
        if (-not (Test-Path -LiteralPath (Join-Path $backup $name))) {
            Write-Host '[BACKUP_MISSING]'; exit 1
        }
    }
    foreach ($name in $names) {
        Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $PSScriptRoot $name)
    }
    Write-Host '[ROLLBACK_OK] Original v0.1.0 scripts restored. Local config remains private.'
} catch { Write-Host '[ROLLBACK_FAILED]'; exit 1 }
