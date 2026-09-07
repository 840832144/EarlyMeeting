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
function Read-Hidden([string]$label) {
    $secure = Read-Host $label -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}
try {
    Write-Host 'EarlyMeeting 本机回调测试（不保存、不更新、不定时发送）'
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
    & $node.Source (Join-Path $PSScriptRoot 'probe.cjs') --self-test
    if ($LASTEXITCODE -ne 0) { throw 'SELF_TEST_FAILED' }
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
        $installOutput = & $npm.Source install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=30000 2>&1
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
    Write-Host '下面三项只在本窗口输入，不写入文件，不发到聊天。'
    Write-Host '群 ID 就用你成功发送测试卡片时填写的 CHAT_ID。输入都用星号隐藏。'
    $env:EARLYMEETING_APP_ID = Read-Hidden '粘贴晨会记录应用的 App ID'
    $env:EARLYMEETING_APP_SECRET = Read-Hidden '粘贴该应用当前有效的 App Secret'
    $env:EARLYMEETING_TEST_CHAT_ID = Read-Hidden '粘贴指定测试群的 CHAT_ID'
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
    & $node.Source (Join-Path $PSScriptRoot 'probe.cjs')
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
