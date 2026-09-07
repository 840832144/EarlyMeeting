param([ValidateSet('Probe','Meeting')][string]$Mode = 'Probe')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$OutputEncoding = [Console]::OutputEncoding
Set-Location -LiteralPath $PSScriptRoot
$exitCode = 1
$mutex = $null
$locked = $false
$names = @('EARLYMEETING_APP_ID','EARLYMEETING_APP_SECRET','EARLYMEETING_TEST_CHAT_ID')
$old = @{}
foreach ($name in $names) { $old[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    if ($Mode -eq 'Meeting') { Write-Host 'EarlyMeeting 本人行晨会（指定测试群，同卡保存，定时关闭）' }
    else { Write-Host 'EarlyMeeting 本机回调测试（不保存、不更新、不定时发送）' }
    Write-Host '请关闭本应用的其他回调测试进程，只运行一份。'
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        Write-Host '[NODE_MISSING] 没有找到 Node.js / npm。'
        Write-Host '请从 Node.js 官网安装当前 LTS Windows 安装包，再重新双击本文件。'
        Write-Host '官网：https://nodejs.org/en/download'
        throw 'PRECHECK_STOP'
    }
    $version = (& $node.Source --version | Out-String).Trim()
    if ($version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
        Write-Host '[NODE_OLD] 本测试包要求 Node.js 22 或更高版本。'
        throw 'PRECHECK_STOP'
    }
    Write-Host ('[NODE_OK] ' + $version)
    if ($Mode -eq 'Probe') {
        & $node.Source (Join-Path $PSScriptRoot 'probe.cjs') --self-test
        if ($LASTEXITCODE -ne 0) { throw 'SELF_TEST_FAILED' }
    }
    $pkgPath = Join-Path $PSScriptRoot 'node_modules\@larksuiteoapi\node-sdk\package.json'
    $install = $true
    if (Test-Path -LiteralPath $pkgPath) {
        try { $install = ((Get-Content -Raw -LiteralPath $pkgPath | ConvertFrom-Json).version -ne '1.73.3') } catch { $install = $true }
    }
    if ($install) {
        Write-Host '首次运行需要从 npm 官方源下载飞书官方 SDK 及依赖，只装入本文件夹。'
        $answer = Read-Host '输入 Y 开始安装；其他输入退出'
        if ($answer -notmatch '^[yY]$') { throw 'INSTALL_CANCELLED' }
        Write-Host '[INSTALLING] 正在下载依赖，请稍候；此时还没有读取应用凭据。'
        # Suppress raw npm output. No credentials have been entered yet.
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $installOutput = & $npm.Source ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=30000 2>&1
        $installExit = $LASTEXITCODE
        $ErrorActionPreference = $previous
        if ($installExit -ne 0) {
            $codes = [regex]::Matches(($installOutput | Out-String), '\b(ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ECONNREFUSED|E403|E404|EACCES|EPERM)\b')
            $code = 'UNCLASSIFIED'
            if ($codes.Count -gt 0) { $code = $codes[0].Value }
            Write-Host ('[INSTALL_FAILED] 依赖安装失败；错误码=' + $code)
            Write-Host '停在这里并反馈状态码；不要关闭防火墙或更换不明下载源。'
            throw 'PRECHECK_STOP'
        }
        $installOutput = $null
    }
    Write-Host '[SDK_READY] 官方 SDK 已就绪。'
    # User authorized one local JSON instead of retyping credentials each run.
    # Do not print, upload, or include this file in any deployment/backup package.
    $configPath = Join-Path $PSScriptRoot '.local\config.json'
    if (-not (Test-Path -LiteralPath $configPath)) {
        Write-Host '[CONFIG_MISSING] 请先填写本文件夹 .local\config.json，再启动。'
        throw 'PRECHECK_STOP'
    }
    try { $localConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { Write-Host '[CONFIG_JSON_INVALID] JSON 格式有误；内容未输出。'; throw 'PRECHECK_STOP' }
    $env:EARLYMEETING_APP_ID = [string]$localConfig.app_id
    $env:EARLYMEETING_APP_SECRET = [string]$localConfig.app_secret
    $env:EARLYMEETING_TEST_CHAT_ID = [string]$localConfig.test_chat_id
    $localConfig = $null
    if ([string]::IsNullOrWhiteSpace($env:EARLYMEETING_APP_ID) -or
        [string]::IsNullOrWhiteSpace($env:EARLYMEETING_APP_SECRET) -or
        [string]::IsNullOrWhiteSpace($env:EARLYMEETING_TEST_CHAT_ID)) {
        Write-Host '[CONFIG_INCOMPLETE] 请填完 config.json 的三项；内容未输出。'
        throw 'PRECHECK_STOP'
    }
    Write-Host '[CONFIG_LOADED] 已从本机 JSON 载入配置；内容未输出。'
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $suffix = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:EARLYMEETING_APP_ID))).Replace('-','') }
    finally { $sha.Dispose() }
    $mutex = New-Object System.Threading.Mutex($false, ('Local\EarlyMeetingProbe_' + $suffix))
    try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) {
        Write-Host '[ALREADY_RUNNING] 本电脑已经有同一应用的测试窗口，请使用原窗口。'
        throw 'PRECHECK_STOP'
    }
    Write-Host '只使用虚构测试文字。保持窗口打开；结束时按 Ctrl+C。'
    $entryName = 'probe.cjs'
    if ($Mode -eq 'Meeting') {
        $dataDir = Join-Path $PSScriptRoot '.local\meeting'
        $newDataDir = -not (Test-Path -LiteralPath $dataDir)
        if ($newDataDir) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
        $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
        $dataAcl = New-Object Security.AccessControl.DirectorySecurity
        $dataAcl.SetAccessRuleProtection($true, $false)
        foreach ($sid in @($userSid,$systemSid)) {
            $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
            $dataAcl.AddAccessRule($rule)
        }
        if ($newDataDir) { Set-Acl -LiteralPath $dataDir -AclObject $dataAcl }
        $verifiedAcl = Get-Acl -LiteralPath $dataDir
        $allowedSids = @($userSid.Value,$systemSid.Value)
        $unsafe = @($verifiedAcl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids })
        if (-not $verifiedAcl.AreAccessRulesProtected -or $unsafe.Count -gt 0) { throw 'DATA_ACL_FAILED' }
        Write-Host '[LOCAL_DATA_PROTECTED] 本轮数据目录只允许当前用户与 SYSTEM。'
        $entryName = 'meeting.cjs'
    }
    & $node.Source (Join-Path $PSScriptRoot $entryName)
    $exitCode = $LASTEXITCODE
} catch {
    if ($_.Exception.Message -ne 'PRECHECK_STOP') {
        Write-Host '[LAUNCH_STOPPED] 启动已停止。原始错误已隐藏；请反馈上面的状态码。'
    }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $old[$name], 'Process') }
    if ($locked -and $mutex) { try { $mutex.ReleaseMutex() } catch {} }
    if ($mutex) { $mutex.Dispose() }
}
exit $exitCode
