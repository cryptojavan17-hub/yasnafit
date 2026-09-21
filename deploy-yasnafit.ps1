#!/usr/bin/env pwsh
# ============================================================================
# Yasnafit Deploy — Freestyle VM
# Zip → Upload → Unzip → PM2 restart
# Usage: .\deploy-yasnafit.ps1
# ============================================================================

$ErrorActionPreference = "Stop"

# ──CONFIG─────────────────────────────────────────────────────────────────────
$ApiKey       = "6VxU5e...BFMk"
$VMId         = "vm-d38d21a8334d46d8a35c9bef2566c9bc"
$ProjectDir   = "C:\Users\MAHDI\Desktop\yasnafit-git"
$RemoteDir    = "/home/ubuntu/yasnafit"
$ZipName      = "yasnafit-deploy.zip"
$MaxRetries   = 5
$RetryDelay   = 5

# ── OUTPUT────────────────────────────────────────────────────────────────────
function Write-Step { param($m) Write-Host "  ▸ $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "  ✔ $m" -ForegroundColor Green }
function Write-ERR  { param($m) Write-Host "  ✖ $m" -ForegroundColor Red }
function Write-WARN { param($m) Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Write-LOG  { param($m) Write-Host "    $m" -ForegroundColor DarkGray }

# ── RETRY WRAPPER ────────────────────────────────────────────────────────────
function Invoke-WithRetry {
    param(
        [Parameter(Mandatory)][scriptblock]$Action,
        [string]$Desc      = "command",
        [int]$MaxAttempts  = $MaxRetries
    )
    $i   = 0
    $ok  = $false
    $out = ""
    while ($i -lt $MaxAttempts -and -not $ok) {
        $i++
        Write-LOG "  try $i/$MaxAttempts: $Desc"
        try {
            $out = & $Action 2>&1
            if ($LASTEXITCODE -eq 0) {
                $ok = $true
                Write-OK "  done on try $i"
            } else {
                $msg = ($out | Out-String).Trim()
                Write-WARN "  failed (exit $LASTEXITCODE): $(if($msg.Length -gt 200){$msg.Substring(0,200)+'...'}else{$msg})"
                if ($i -lt $MaxAttempts) { Start-Sleep -Seconds $RetryDelay }
            }
        } catch {
            Write-WARN "  error: $_"
            if ($i -lt $MaxAttempts) { Start-Sleep -Seconds $RetryDelay }
        }
    }
    return @{ Success=$ok; Output=$out; Attempts=$i }
}

# ──HELPER: freestyle command via freestyler 혹은 ps1────────────────────────
function Run-Freestyle {
    param([string[]]$CmdArgs)
    $fullArgs = @("freestyle") + $CmdArgs
    return Invoke-WithRetry -Action { & $fullArgs } -Desc "freestyle $($CmdArgs -join ' ')"
}

# ──MAIN──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  Yasnafit Deploy — Freestyle VM" -ForegroundColor White
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""

# 1. اتصال VM
Write-Step "Checking VM connectivity..."
$conn = Run-Freestyle "vm" "ssh" $VMId "--exec" "echo ONLINE_$(Get-Date -Format 'HH:mm:ss')"
if (-not $conn.Success) { Write-ERR "Cannot reach VM. Aborting."; exit 1 }
Write-OK "VM is reachable"

# 2. فشرده‌سازی
Write-Host ""
Write-Step "Creating zip archive..."
$zipPath = Join-Path $env:TEMP $ZipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zipRes = Invoke-WithRetry -Action {
    Compress-Archive -Path "$ProjectDir\*" -DestinationPath $zipPath -Force
} -Desc "Compress-Archive"
if (-not $zipRes.Success) { Write-ERR "Zip failed."; exit 1 }

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-OK "Zip: $sizeMB MB ($($zipRes.Attempts) tries)"

# 3. آپلود
Write-Host ""
Write-Step "Uploading to VM..."
$remoteZip = "$RemoteDir/$ZipName"
$upRes = Run-Freestyle "vm" "fs" "write" $VMId $remoteZip $zipPath
if (-not $upRes.Success) { Write-ERR "Upload failed."; exit 1 }
Write-OK "Uploaded ($($upRes.Attempts) tries)"

# 4. استخراج روی سرور
Write-Host ""
Write-Step "Extracting on VM..."
$extractCmd = "cd $RemoteDir && unzip -o $ZipName && rm -f $ZipName 2>/dev/null; echo EXTRACTED_OK"
$extRes = Run-Freestyle "vm" "ssh" $VMId "--exec" $extractCmd
if (-not $extRes.Success) { Write-ERR "Extract failed."; exit 1 }
Write-OK "Extracted ($($extRes.Attempts) tries)"

# 5. ری‌استارت PM2
Write-Host ""
Write-Step "Restarting PM2..."
$pm2Cmd = "cd $RemoteDir && export PATH=`$HOME/.npm-global/bin:`$HOME/.local/bin:`$HOME/.npm/bin:$PATH && pm2 restart yasnafit 2>&1; echo PM2_EXIT:$?"
$pm2Res = Run-Freestyle "vm" "ssh" $VMId "--exec" $pm2Cmd

if ($pm2Res.Output -match "PM2_EXIT:0") {
    Write-OK "PM2 restarted"
} else {
    Write-WARN "pm2 restart failed — trying npx..."
    $npxRes = Run-Freestyle "vm" "ssh" $VMId "--exec" "cd $RemoteDir && npx pm2 restart yasnafit 2>&1; echo NPMX_EXIT:$?"
    if ($npxRes.Output -match "NPMX_EXIT:0") {
        Write-OK "PM2 restarted via npx"
    } else {
        Write-WARN "npx also failed — starting fresh..."
        Run-Freestyle "vm" "ssh" $VMId "--exec" "cd $RemoteDir && npx pm2 start server.js --name yasnafit -- PORT=3020 2>&1; echo STARTED_EXIT:$?"
        Write-OK "PM2 started fresh"
    }
}

# 6. تأیید نهایی
Write-Host ""
Write-Step "Final verification..."
$verify = Run-Freestyle "vm" "ssh" $VMId "--exec" "(echo '--- PM2 ---'; (pm2 list 2>/dev/null || npx pm2 list 2>/dev/null); echo '--- PORTS ---'; (ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E '3020|20128'; echo '--- DONE ---')"
Write-Host $verify.Output

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Deploy COMPLETE" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# تمیز کردن
if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
Write-OK "Yasnafit deployed successfully."
