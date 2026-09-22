#Requires -Version 5.1
<#
  Yasnafit Windows deploy kit.
  PowerShell 5.1 and 7. UTF-8 BOM required so Windows PowerShell 5.1 reads Persian.
  Not executed in the agent sandbox (no PowerShell there). Syntax review only.

  5.1 rules used here:
  - no pipeline-chaining operator, no null-coalescing operator, no ternary
  - native commands with stderr merged are run under Continue, then LASTEXITCODE
  - single-line git output is the last non-empty line
  - the automatic process-id variable is never used as a name
  - Join-Path takes two arguments only
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('deploy', 'update', 'start', 'stop', 'restart', 'status', 'logs', 'backup')]
  [string]$Action = 'deploy',

  [string]$AppDir = '',

  [string]$Repo = 'https://github.com/cryptojavan17-hub/yasnafit.git',

  [string]$Branch = 'main',

  [int]$Port = 3020,

  [switch]$NoBrowser,

  [switch]$Force
)

$ErrorActionPreference = 'Stop'
try {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [Console]::OutputEncoding = $utf8
  [Console]::InputEncoding = $utf8
} catch {}

$Script:KitDir = $PSScriptRoot
if (-not $Script:KitDir) {
  $Script:KitDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Fail {
  param([string]$Message)
  Write-Host $Message
  exit 1
}

function Test-SensitiveName {
  param([string]$Name)
  $upper = $Name.ToUpperInvariant()
  if ($upper.Contains('TOKEN')) { return $true }
  if ($upper.Contains('SECRET')) { return $true }
  if ($upper.Contains('PASS')) { return $true }
  return $false
}

function Get-LastNonEmpty {
  param([object[]]$Lines)
  $last = ''
  foreach ($line in @($Lines)) {
    $text = ([string]$line).Trim()
    if ($text.Length -gt 0) { $last = $text }
  }
  return $last
}

function Write-NativeLines {
  param($Result)
  foreach ($line in @($Result.Lines)) {
    $text = ([string]$line).Trim()
    if ($text.Length -gt 0) { Write-Host $text }
  }
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory
  )
  if ($null -eq $ArgumentList) { $ArgumentList = @() }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $pushed = $false
  $code = 1
  $bucket = New-Object System.Collections.Generic.List[string]
  try {
    if ($WorkingDirectory) {
      Push-Location -LiteralPath $WorkingDirectory
      $pushed = $true
    }
    $output = & $FilePath @ArgumentList 2>&1
    if ($null -ne $LASTEXITCODE) { $code = [int]$LASTEXITCODE } else { $code = 0 }
    foreach ($item in @($output)) {
      if ($null -eq $item) { continue }
      $text = [string]$item
      if ($text.Length -gt 0) { [void]$bucket.Add($text) }
    }
  } catch {
    $code = 1
    $msg = [string]$_.Exception.Message
    if ($msg.Length -gt 0) { [void]$bucket.Add($msg) }
  } finally {
    if ($pushed) { Pop-Location }
    $ErrorActionPreference = $previous
  }
  $obj = New-Object PSObject
  $obj | Add-Member -NotePropertyName Code -NotePropertyValue ([int]$code)
  $obj | Add-Member -NotePropertyName Lines -NotePropertyValue (@($bucket.ToArray()))
  return $obj
}

function Assert-Native {
  param($Result, [string]$What)
  if ([int]$Result.Code -ne 0) {
    Write-NativeLines $Result
    Fail ("ناموفق: {0} (exit {1})" -f $What, $Result.Code)
  }
}

function Write-WingetHint {
  Write-Host 'راهنمای نصب با winget (این اسکریپت خودش چیزی نصب نمی‌کند):'
  Write-Host '  winget install --id Git.Git -e --source winget'
  Write-Host '  winget install --id OpenJS.NodeJS -e --source winget'
  Write-Host 'بعد از نصب، پنجره را ببندید و دوباره باز کنید. node -v باید 22.5 یا جدیدتر باشد.'
}

function Test-NodeReady {
  $probe = Invoke-Native -FilePath 'node' -ArgumentList @('-v')
  $text = ''
  foreach ($line in @($probe.Lines)) {
    if ([string]$line -match 'v(\d+)\.(\d+)\.(\d+)') {
      $text = [string]$line
      break
    }
  }
  if (-not $text) {
    Write-Host 'Node.js پیدا نشد.'
    Write-WingetHint
    Fail 'Node.js 22.5 یا جدیدتر لازم است.'
  }
  $ok = $false
  if ($text -match 'v(\d+)\.(\d+)\.(\d+)') {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if ($major -gt 22) { $ok = $true }
    elseif ($major -eq 22 -and $minor -ge 5) { $ok = $true }
  }
  if (-not $ok) {
    Write-Host ("نسخهٔ Node کافی نیست: {0}" -f $text.Trim())
    Write-WingetHint
    Fail 'Node.js 22.5 یا جدیدتر لازم است (node:sqlite).'
  }
  Write-Host ("Node: {0}" -f (Get-LastNonEmpty @($probe.Lines)))
}

function Test-GitReady {
  $probe = Invoke-Native -FilePath 'git' -ArgumentList @('--version')
  if ([int]$probe.Code -ne 0) {
    Write-Host 'Git پیدا نشد.'
    Write-WingetHint
    Fail 'Git لازم است.'
  }
  Write-Host ("Git: {0}" -f (Get-LastNonEmpty @($probe.Lines)))
}

function Resolve-AppDir {
  param([string]$Explicit)
  if ($Explicit) {
    $full = $Explicit
    if (-not [System.IO.Path]::IsPathRooted($full)) {
      $full = Join-Path (Get-Location).Path $full
    }
    return [System.IO.Path]::GetFullPath($full)
  }
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $Script:KitDir '..\..'))
  $serverJs = Join-Path $candidate 'server.js'
  $gitDir = Join-Path $candidate '.git'
  if ((Test-Path -LiteralPath $serverJs) -and (Test-Path -LiteralPath $gitDir)) {
    return $candidate
  }
  return [System.IO.Path]::GetFullPath((Join-Path $Script:KitDir 'app'))
}

function Ensure-EnvFile {
  $envFile = Join-Path $Script:KitDir 'yasnafit.env'
  $example = Join-Path $Script:KitDir 'yasnafit.env.example'
  if (Test-Path -LiteralPath $envFile) { return $envFile }
  if (-not (Test-Path -LiteralPath $example)) {
    Write-Host 'yasnafit.env.example نیست؛ متغیر محیطی از فایل خوانده نشد.'
    return $envFile
  }
  Copy-Item -LiteralPath $example -Destination $envFile
  Write-Host 'yasnafit.env از روی example ساخته شد. این فایل در Git نیست. مقدار TOKEN/SECRET/PASS را فقط اینجا بگذارید، نه در چت.'
  Write-Host 'اگر PORT در فایل باشد، بر -Port مقدم است.'
  return $envFile
}

function Import-KitEnv {
  param(
    [string]$Path,
    [ref]$ListenPort
  )
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $text = [System.IO.File]::ReadAllText($Path)
  $lines = $text -split "`r?`n"
  foreach ($raw in @($lines)) {
    $trim = ([string]$raw).Trim()
    if ($trim.Length -eq 0) { continue }
    if ($trim.StartsWith('#')) { continue }
    $eq = $trim.IndexOf('=')
    if ($eq -lt 1) { continue }
    $name = $trim.Substring(0, $eq).Trim()
    $value = $trim.Substring($eq + 1)
    if ($value.Length -ge 2) {
      $quote = $value.Substring(0, 1)
      if (($quote -eq '"' -or $quote -eq "'") -and $value.EndsWith($quote)) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
      Write-Host ("خط env نادیده گرفته شد (نام نامعتبر): {0}" -f $name)
      continue
    }
    $sensitive = Test-SensitiveName $name
    if ($value.Length -eq 0) {
      Remove-Item -Path ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
      Write-Host ("{0} = (خالی — تنظیم نشد)" -f $name)
      continue
    }
    Set-Item -Path ("Env:{0}" -f $name) -Value $value
    if ($name -eq 'PORT') {
      $parsed = 0
      if ([int]::TryParse($value, [ref]$parsed) -and $parsed -gt 0 -and $parsed -lt 65536) {
        $ListenPort.Value = $parsed
        Write-Host ("PORT فایل = {0} (بر -Port مقدم است)" -f $parsed)
      } else {
        Write-Host 'PORT در فایل نامعتبر است؛ از -Port استفاده می‌شود.'
      }
      continue
    }
    if ($sensitive) {
      Write-Host ("{0} = (ست شد — مقدار چاپ نمی‌شود)" -f $name)
    } else {
      Write-Host ("{0} = {1}" -f $name, $value)
    }
  }
}

function Test-GitCheckout {
  param([string]$Root)
  $gitDir = Join-Path $Root '.git'
  if (-not (Test-Path -LiteralPath $gitDir)) { return $false }
  $probe = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', '--is-inside-work-tree') -WorkingDirectory $Root
  $line = Get-LastNonEmpty @($probe.Lines)
  if ([int]$probe.Code -eq 0 -and $line -eq 'true') { return $true }
  return $false
}

function Test-TrackedDirty {
  param([string]$Root)
  $unstaged = Invoke-Native -FilePath 'git' -ArgumentList @('diff', '--name-only') -WorkingDirectory $Root
  $staged = Invoke-Native -FilePath 'git' -ArgumentList @('diff', '--cached', '--name-only') -WorkingDirectory $Root
  foreach ($line in (@($unstaged.Lines) + @($staged.Lines))) {
    if (([string]$line).Trim().Length -gt 0) { return $true }
  }
  return $false
}

function Update-Repo {
  param(
    [string]$Root,
    [string]$RemoteUrl,
    [string]$RemoteBranch,
    [bool]$DiscardTracked
  )
  $dbPath = Join-Path $Root 'data\yasnafit.db'
  $dbBefore = Test-Path -LiteralPath $dbPath
  $isRepo = Test-GitCheckout -Root $Root
  if (-not $isRepo) {
    if (Test-Path -LiteralPath $Root) {
      $items = @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue)
      if ($items.Count -gt 0) {
        Fail ("AppDir خالی نیست و checkout گیت نیست: {0}" -f $Root)
      }
    }
    $parent = Split-Path -Parent $Root
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    Write-Host ("clone: {0} branch {1}" -f $RemoteUrl, $RemoteBranch)
    $clone = Invoke-Native -FilePath 'git' -ArgumentList @('clone', '--branch', $RemoteBranch, $RemoteUrl, $Root)
    Assert-Native $clone 'git clone'
    $head = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', '--short', 'HEAD') -WorkingDirectory $Root
    Write-Host ("HEAD: {0}" -f (Get-LastNonEmpty @($head.Lines)))
    Write-Host 'clone تازه است؛ git log old..new موردی ندارد.'
    return
  }

  $oldProbe = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', 'HEAD') -WorkingDirectory $Root
  $oldHash = Get-LastNonEmpty @($oldProbe.Lines)

  if ((Test-TrackedDirty -Root $Root) -and -not $DiscardTracked) {
    Fail 'تغییر محلی tracked هست. بدون -Force متوقف شد. data\ (gitignore) دست نمی‌خورد. -Force تغییرات tracked و کامیت‌های محلی آن شاخه را دور می‌ریزد.'
  }
  if ($DiscardTracked) {
    Write-Host 'هشدار: -Force فعال است. git reset --hard تغییرات tracked را دور می‌ریزد. data\ پاک نمی‌شود. git clean اجرا نمی‌شود.'
  }

  Write-Host 'git fetch --prune origin'
  $fetch = Invoke-Native -FilePath 'git' -ArgumentList @('fetch', '--prune', 'origin') -WorkingDirectory $Root
  Assert-Native $fetch 'git fetch --prune'

  $remoteName = 'refs/remotes/origin/{0}' -f $RemoteBranch
  $remoteRef = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', '--verify', $remoteName) -WorkingDirectory $Root
  if ([int]$remoteRef.Code -ne 0) {
    Write-NativeLines $remoteRef
    Fail ("شاخهٔ origin/{0} بعد از fetch پیدا نشد." -f $RemoteBranch)
  }

  $originBranch = 'origin/{0}' -f $RemoteBranch
  if ($DiscardTracked) {
    $checkout = Invoke-Native -FilePath 'git' -ArgumentList @('checkout', '-f', '-B', $RemoteBranch, $originBranch) -WorkingDirectory $Root
    Assert-Native $checkout 'git checkout -f -B'
    $reset = Invoke-Native -FilePath 'git' -ArgumentList @('reset', '--hard', $originBranch) -WorkingDirectory $Root
    Assert-Native $reset 'git reset --hard'
  } else {
    $localName = 'refs/heads/{0}' -f $RemoteBranch
    $local = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', '--verify', $localName) -WorkingDirectory $Root
    if ([int]$local.Code -eq 0) {
      $checkout = Invoke-Native -FilePath 'git' -ArgumentList @('checkout', $RemoteBranch) -WorkingDirectory $Root
      Assert-Native $checkout 'git checkout'
    } else {
      $checkout = Invoke-Native -FilePath 'git' -ArgumentList @('checkout', '--track', $originBranch) -WorkingDirectory $Root
      Assert-Native $checkout 'git checkout --track'
    }
    $pull = Invoke-Native -FilePath 'git' -ArgumentList @('pull', '--ff-only', 'origin', $RemoteBranch) -WorkingDirectory $Root
    if ([int]$pull.Code -ne 0) {
      Write-NativeLines $pull
      Fail 'git pull --ff-only ناموفق بود. اگر عمداً می‌خواهید تاریخچهٔ محلی tracked دور ریخته شود: update -Force. data\ با آن کار پاک نمی‌شود.'
    }
  }

  if ($dbBefore -and -not (Test-Path -LiteralPath $dbPath)) {
    Fail 'data\yasnafit.db بعد از git نیست. ادامه متوقف شد. data\ نباید دست بخورد.'
  }

  $newProbe = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', 'HEAD') -WorkingDirectory $Root
  $newHash = Get-LastNonEmpty @($newProbe.Lines)
  Write-Host ("قدیم: {0}" -f $oldHash)
  Write-Host ("جدید: {0}" -f $newHash)
  if ($oldHash -and $newHash -and ($oldHash -ne $newHash)) {
    $range = '{0}..{1}' -f $oldHash, $newHash
    $log = Invoke-Native -FilePath 'git' -ArgumentList @('log', '--oneline', $range) -WorkingDirectory $Root
    Write-Host 'git log --oneline old..new:'
    Write-NativeLines $log
  } else {
    Write-Host 'کامیت جدیدی نسبت به checkout قبلی نیست.'
  }
}

function Backup-Database {
  param([string]$Root)
  $db = Join-Path $Root 'data\yasnafit.db'
  if (-not (Test-Path -LiteralPath $db)) {
    Write-Host 'data\yasnafit.db نیست. بکاپ رد شد. data\ ساخته یا پاک نمی‌شود.'
    return
  }
  $backupDir = Join-Path $Root 'backups'
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dest = Join-Path $backupDir ('deploy-{0}.db' -f $stamp)
  if (Test-Path -LiteralPath $dest) {
    Start-Sleep -Seconds 1
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dest = Join-Path $backupDir ('deploy-{0}.db' -f $stamp)
  }
  Copy-Item -LiteralPath $db -Destination $dest -Force
  foreach ($suffix in @('-wal', '-shm')) {
    $side = $db + $suffix
    if (Test-Path -LiteralPath $side) {
      Copy-Item -LiteralPath $side -Destination ($dest + $suffix) -Force
    }
  }
  Write-Host ("بکاپ: {0}" -f $dest)
  $kept = New-Object System.Collections.Generic.List[System.IO.FileInfo]
  $matches = @(Get-ChildItem -LiteralPath $backupDir -Filter 'deploy-*.db' -File -ErrorAction SilentlyContinue)
  foreach ($file in $matches) {
    if ($file.Name -match '^deploy-\d{8}-\d{6}\.db$') { [void]$kept.Add($file) }
  }
  $ordered = @($kept | Sort-Object LastWriteTime -Descending)
  if ($ordered.Count -gt 10) {
    $index = 0
    foreach ($file in $ordered) {
      if ($index -ge 10) {
        Remove-Item -LiteralPath $file.FullName -Force
        foreach ($suffix in @('-wal', '-shm')) {
          $side = $file.FullName + $suffix
          if (Test-Path -LiteralPath $side) { Remove-Item -LiteralPath $side -Force }
        }
        Write-Host ("بکاپ قدیمی حذف شد: {0}" -f $file.Name)
      }
      $index = $index + 1
    }
  }
}

function Get-ListenProcessIds {
  param([int]$ListenPort)
  $found = New-Object System.Collections.Generic.List[int]
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $conns = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($conn in $conns) {
      $owner = 0
      try { $owner = [int]$conn.OwningProcess } catch { $owner = 0 }
      if ($owner -gt 4) { [void]$found.Add($owner) }
    }
  } catch {}
  if ($found.Count -eq 0) {
    $raw = & netstat.exe -ano 2>&1
    $pattern = ':{0}\s' -f $ListenPort
    foreach ($item in @($raw)) {
      $line = [string]$item
      if ($line -notmatch 'LISTENING') { continue }
      if ($line -notmatch $pattern) { continue }
      $parts = $line.Trim() -split '\s+'
      if ($parts.Length -lt 5) { continue }
      $parsed = 0
      $token = [string]$parts[$parts.Length - 1]
      if ([int]::TryParse($token, [ref]$parsed) -and $parsed -gt 4) {
        [void]$found.Add($parsed)
      }
    }
  }
  $ErrorActionPreference = $previous
  $unique = New-Object System.Collections.Generic.List[int]
  foreach ($item in @($found)) {
    $id = [int]$item
    $seen = $false
    foreach ($have in @($unique)) {
      if ([int]$have -eq $id) { $seen = $true }
    }
    if (-not $seen) { [void]$unique.Add($id) }
  }
  if ($unique.Count -eq 0) { return '' }
  return ($unique -join ',')
}

function Stop-Listeners {
  param([int]$ListenPort)
  $raw = Get-ListenProcessIds -ListenPort $ListenPort
  if (-not $raw) {
    Write-Host ("پورت {0} شنونده ندارد." -f $ListenPort)
    return
  }
  $selfId = [System.Diagnostics.Process]::GetCurrentProcess().Id
  foreach ($part in $raw.Split(',')) {
    $procId = 0
    if (-not [int]::TryParse($part, [ref]$procId)) { continue }
    if ($procId -le 4) { continue }
    if ($procId -eq $selfId) { continue }
    Write-Host ("توقف PID {0} روی پورت {1}" -f $procId, $ListenPort)
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
  $left = Get-ListenProcessIds -ListenPort $ListenPort
  if ($left) {
    Fail ("پورت {0} هنوز شنونده دارد (PID {1})." -f $ListenPort, $left)
  }
}

function Start-ServerHidden {
  param([string]$Root, [int]$ListenPort)
  $serverJs = Join-Path $Root 'server.js'
  if (-not (Test-Path -LiteralPath $serverJs)) {
    Fail ("server.js نیست: {0}. اول deploy را اجرا کنید." -f $serverJs)
  }
  $logDir = Join-Path $Root 'logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Set-Item -Path 'Env:PORT' -Value ([string]$ListenPort)
  $already = Get-ListenProcessIds -ListenPort $ListenPort
  if ($already) {
    Write-Host ("سرور از قبل روی پورت {0} روشن است (PID {1})." -f $ListenPort, $already)
    return $null
  }
  Write-Host 'استارت مخفی: cmd /c node server.js >> logs\server.log 2>&1'
  # One string, not an array: an array would quote the redirection and cmd would not apply it.
  $cmdArgs = '/c node server.js >> logs\server.log 2>&1'
  $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  return $proc
}

function Read-ServerLogText {
  param([string]$Root)
  $logFile = Join-Path $Root 'logs\server.log'
  if (-not (Test-Path -LiteralPath $logFile)) { return '' }
  $stream = $null
  $reader = $null
  $text = ''
  try {
    $stream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true)
    $text = $reader.ReadToEnd()
  } catch {
    Write-Host 'خواندن logs\server.log ممکن نشد.'
    $text = ''
  } finally {
    if ($reader) { $reader.Close() }
    elseif ($stream) { $stream.Close() }
  }
  return $text
}

function Write-LogTail {
  param([string]$Root, [int]$Count)
  $text = Read-ServerLogText -Root $Root
  if (-not $text) {
    Write-Host 'logs\server.log هنوز نیست یا خوانده نشد.'
    return
  }
  $all = @($text -split "`r?`n")
  $start = 0
  if ($all.Count -gt $Count) { $start = $all.Count - $Count }
  Write-Host ("--- آخرین {0} خط logs\server.log ---" -f $Count)
  $index = 0
  foreach ($line in $all) {
    if ($index -ge $start) { Write-Host $line }
    $index = $index + 1
  }
}

function Get-ProbeHosts {
  param([int]$ListenPort)
  $hosts = New-Object System.Collections.Generic.List[string]
  [void]$hosts.Add('127.0.0.1')
  $bind = [Environment]::GetEnvironmentVariable('YASNAFIT_HOST')
  if (-not $bind) { $bind = [Environment]::GetEnvironmentVariable('HOST') }
  if ($bind) {
    $bind = $bind.Trim()
    if ($bind.Length -gt 0 -and $bind -ne '0.0.0.0' -and $bind -ne '127.0.0.1' -and $bind -ne '::' -and $bind -ne 'localhost') {
      [void]$hosts.Add($bind)
    }
  }
  return ($hosts -join ',')
}

function Get-HealthFromHost {
  param([string]$TargetHost, [int]$ListenPort)
  $url = 'http://{0}:{1}/api/health' -f $TargetHost, $ListenPort
  $response = $null
  $reader = $null
  $body = ''
  try {
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Method = 'GET'
    $request.Timeout = 4000
    $request.ReadWriteTimeout = 4000
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
  } catch {
    $body = ''
  } finally {
    if ($reader) { $reader.Close() }
    elseif ($response) { $response.Close() }
  }
  return $body
}

function Get-HealthBody {
  param([int]$ListenPort)
  $raw = Get-ProbeHosts -ListenPort $ListenPort
  foreach ($target in $raw.Split(',')) {
    if (-not $target) { continue }
    $body = Get-HealthFromHost -TargetHost $target -ListenPort $ListenPort
    if ($body) { return $body }
  }
  return ''
}

function Show-StartupSummary {
  param([string]$Root)
  $text = Read-ServerLogText -Root $Root
  if (-not $text) {
    Write-Host 'خلاصهٔ لاگ هنوز در logs\server.log ظاهر نشده (وقتی خروجی فایل است stdout بافر می‌شود). version/uptime از /api/health خوانده شد.'
    return
  }
  $all = @($text -split "`r?`n")
  $indexes = New-Object System.Collections.Generic.List[int]
  $i = 0
  foreach ($line in $all) {
    if (([string]$line).Contains('Yasnafit is running')) { [void]$indexes.Add($i) }
    $i = $i + 1
  }
  # Window = after the previous boot's running line through EOF.
  # Migrations and [Telegram] are logged before that line; stamp lines are after it.
  # Zero or one running line => the whole file (first boot, or still starting).
  $start = 0
  if ($indexes.Count -ge 2) { $start = $indexes[$indexes.Count - 2] + 1 }
  Write-Host '--- خلاصهٔ آخرین بوت (بعد از Yasnafit is running بوت قبلی تا پایان لاگ) ---'
  $applied = 0
  $j = 0
  foreach ($line in $all) {
    if ($j -ge $start) {
      $textLine = [string]$line
      if ($textLine -cmatch '\[Migrations\] ✅ .+ applied') {
        $applied = $applied + 1
        Write-Host $textLine
      } elseif ($textLine.Contains('Database schema version:')) {
        Write-Host $textLine
      } elseif ($textLine.Contains('Build stamp:')) {
        Write-Host $textLine
      } elseif ($textLine.Contains('[Telegram]')) {
        Write-Host $textLine
      }
    }
    $j = $j + 1
  }
  Write-Host ("تعداد خطوط [Migrations] ✅ … applied (نه Skipping و نه Applying): {0}" -f $applied)
  if ($applied -eq 0 -and $indexes.Count -eq 0) {
    Write-Host 'اگر سرور سالم است و این خلاصه خالی ماند، چند ثانیه بعد logs را ببینید.'
  }
}

function Wait-Health {
  param(
    [int]$ListenPort,
    [string]$Root,
    $StartedProcess
  )
  $deadline = (Get-Date).AddSeconds(120)
  $body = ''
  while ((Get-Date) -lt $deadline) {
    $body = Get-HealthBody -ListenPort $ListenPort
    if ($body) { break }
    if ($null -ne $StartedProcess) {
      try {
        if ($StartedProcess.HasExited) { break }
      } catch {}
    }
    Start-Sleep -Seconds 2
  }
  if (-not $body) {
    Write-Host 'health تا ۱۲۰ ثانیه پاسخ نداد.'
    Write-LogTail -Root $Root -Count 40
    Fail 'استارت ناموفق بود. ۴۰ خط آخر logs\server.log بالا چاپ شد.'
  }
  $version = ''
  $uptime = ''
  try {
    $obj = $body | ConvertFrom-Json
    $version = [string]$obj.version
    $uptime = [string]$obj.uptime
  } catch {
    Write-Host 'health پاسخ داد ولی JSON خوانده نشد.'
  }
  if (-not $version) {
    Write-Host 'پاسخ /api/health فیلد version نداشت.'
    Write-LogTail -Root $Root -Count 40
    Fail 'استارت ناموفق بود. ۴۰ خط آخر logs\server.log بالا چاپ شد.'
  }
  Write-Host ("health OK — version: {0} — uptime: {1}" -f $version, $uptime)
  Show-StartupSummary -Root $Root
}

function Open-Site {
  param([int]$ListenPort, [bool]$Skip)
  if ($Skip) {
    Write-Host 'مرورگر باز نشد (-NoBrowser).'
    return
  }
  $target = '127.0.0.1'
  $raw = Get-ProbeHosts -ListenPort $ListenPort
  foreach ($part in $raw.Split(',')) {
    if ($part -and $part -ne '127.0.0.1') { $target = [string]$part }
  }
  $url = 'http://{0}:{1}/' -f $target, $ListenPort
  Write-Host ("باز کردن مرورگر: {0}" -f $url)
  Start-Process $url
}

function Show-Status {
  param([string]$Root, [int]$ListenPort)
  Write-Host ("AppDir: {0}" -f $Root)
  if (Test-Path -LiteralPath $Root) {
    if (Test-GitCheckout -Root $Root) {
      $branchProbe = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', '--abbrev-ref', 'HEAD') -WorkingDirectory $Root
      $commitProbe = Invoke-Native -FilePath 'git' -ArgumentList @('rev-parse', '--short', 'HEAD') -WorkingDirectory $Root
      Write-Host ("شاخه: {0}" -f (Get-LastNonEmpty @($branchProbe.Lines)))
      Write-Host ("کامیت: {0}" -f (Get-LastNonEmpty @($commitProbe.Lines)))
    } else {
      Write-Host 'checkout گیت نیست.'
    }
  } else {
    Write-Host 'AppDir هنوز وجود ندارد.'
  }
  $ids = Get-ListenProcessIds -ListenPort $ListenPort
  if ($ids) {
    Write-Host ("پورت {0}: LISTEN PID {1}" -f $ListenPort, $ids)
    $body = Get-HealthBody -ListenPort $ListenPort
    if ($body) {
      try {
        $obj = $body | ConvertFrom-Json
        Write-Host ("health version: {0} uptime: {1}" -f $obj.version, $obj.uptime)
      } catch {
        Write-Host 'health پاسخ داد ولی JSON خوانده نشد.'
      }
    } else {
      Write-Host 'شنونده هست ولی /api/health پاسخ نداد.'
    }
  } else {
    Write-Host ("پورت {0}: شنونده ندارد." -f $ListenPort)
  }
  $db = Join-Path $Root 'data\yasnafit.db'
  if (Test-Path -LiteralPath $db) {
    $item = Get-Item -LiteralPath $db
    Write-Host ("DB: {0} bytes, {1}" -f $item.Length, $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
  } else {
    Write-Host 'DB: نیست'
  }
  $backupDir = Join-Path $Root 'backups'
  if (Test-Path -LiteralPath $backupDir) {
    $latest = $null
    $matches = @(Get-ChildItem -LiteralPath $backupDir -Filter 'deploy-*.db' -File -ErrorAction SilentlyContinue)
    foreach ($file in $matches) {
      if ($file.Name -match '^deploy-\d{8}-\d{6}\.db$') {
        if ($null -eq $latest -or $file.LastWriteTime -gt $latest.LastWriteTime) { $latest = $file }
      }
    }
    if ($null -ne $latest) {
      Write-Host ("آخرین بکاپ: {0}" -f $latest.Name)
    } else {
      Write-Host 'بکاپ deploy-*.db نیست.'
    }
  } else {
    Write-Host 'پوشهٔ backups نیست.'
  }
}

function Invoke-BringUp {
  param(
    [string]$Root,
    [int]$ListenPort,
    [bool]$SkipBrowser,
    [bool]$StopFirst
  )
  Test-NodeReady
  if ($StopFirst) { Stop-Listeners -ListenPort $ListenPort }
  $proc = Start-ServerHidden -Root $Root -ListenPort $ListenPort
  Wait-Health -ListenPort $ListenPort -Root $Root -StartedProcess $proc
  Open-Site -ListenPort $ListenPort -Skip $SkipBrowser
}

Write-Host ("Yasnafit Windows kit — action: {0}" -f $Action)
if ($Branch -notmatch '^[A-Za-z0-9._/-]+$') { Fail 'نام شاخه نامعتبر است.' }
if ($Repo -notmatch '^(https://|git@)') { Fail 'آدرس Repo باید https:// یا git@ باشد.' }
if ($Port -lt 1 -or $Port -gt 65535) { Fail '-Port نامعتبر است.' }

$Root = Resolve-AppDir -Explicit $AppDir
Write-Host ("AppDir: {0}" -f $Root)
Write-Host ("Repo: {0}" -f $Repo)
Write-Host ("Branch: {0}" -f $Branch)

$envFile = Ensure-EnvFile
$ListenPort = $Port
Import-KitEnv -Path $envFile -ListenPort ([ref]$ListenPort)
if ($ListenPort -lt 1 -or $ListenPort -gt 65535) { Fail 'پورت نامعتبر است.' }
Set-Item -Path 'Env:PORT' -Value ([string]$ListenPort)
Write-Host ("پورت شنود: {0}" -f $ListenPort)

if ($Action -eq 'deploy' -or $Action -eq 'update') {
  Test-GitReady
  Test-NodeReady
  Update-Repo -Root $Root -RemoteUrl $Repo -RemoteBranch $Branch -DiscardTracked ([bool]$Force)
  Backup-Database -Root $Root
  Invoke-BringUp -Root $Root -ListenPort $ListenPort -SkipBrowser ([bool]$NoBrowser) -StopFirst $true
  exit 0
}
if ($Action -eq 'start') {
  Invoke-BringUp -Root $Root -ListenPort $ListenPort -SkipBrowser ([bool]$NoBrowser) -StopFirst $false
  exit 0
}
if ($Action -eq 'stop') {
  Stop-Listeners -ListenPort $ListenPort
  exit 0
}
if ($Action -eq 'restart') {
  Invoke-BringUp -Root $Root -ListenPort $ListenPort -SkipBrowser ([bool]$NoBrowser) -StopFirst $true
  exit 0
}
if ($Action -eq 'status') {
  Show-Status -Root $Root -ListenPort $ListenPort
  exit 0
}
if ($Action -eq 'logs') {
  $logFile = Join-Path $Root 'logs\server.log'
  if (-not (Test-Path -LiteralPath $logFile)) {
    Fail 'logs\server.log نیست. اول سرور را استارت کنید.'
  }
  Write-LogTail -Root $Root -Count 60
  exit 0
}
if ($Action -eq 'backup') {
  Backup-Database -Root $Root
  exit 0
}

Fail ("اکشن ناشناخته: {0}" -f $Action)
