@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "PORT=3020"
set "BRANCH=arena/01a0829c-yasnafit"

:MENU
cls
echo ====================================================
echo      YASNAFIT - TASK 27 (DRAWER SCROLL) VERIFY
echo ====================================================
call :WHEREAMI
echo.
echo 1. Pull branch %BRANCH% + run npm test (18/18)
echo 2. Check Task 27 code is present in this folder
echo 3. Restart server and verify /api/health (uptime reset)
echo 4. Verify served /program-builder.css (overscroll-behavior:contain)
echo 5. Run all checks (2 + 3 + 4)
echo 6. Exit
echo.
set /p choice=Select an option (1-6):
if "%choice%"=="1" call :PULLTEST & pause & goto MENU
if "%choice%"=="2" call :CHECKCODE & pause & goto MENU
if "%choice%"=="3" call :RESTART & call :HEALTH & pause & goto MENU
if "%choice%"=="4" call :CSSCHECK & pause & goto MENU
if "%choice%"=="5" call :CHECKCODE & call :RESTART & call :HEALTH & call :CSSCHECK & pause & goto MENU
if "%choice%"=="6" exit /b 0
goto MENU

:WHEREAMI
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do echo Git branch : %%b
for /f "delims=" %%s in ('git rev-parse --short HEAD 2^>nul') do echo Git commit : %%s
for /f "delims=" %%v in ('node -p "require('./package.json').version" 2^>nul') do echo Version    : %%v
echo Port       : %PORT%
powershell -NoProfile -Command "$l=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($l){Write-Host 'Server     : RUNNING' -ForegroundColor Green}else{Write-Host 'Server     : STOPPED' -ForegroundColor Red}"
exit /b

:CHECKCODE
echo.
echo --- Task 27 code check ---
findstr /C:"overscroll-behavior:contain" "public\program-builder.css" >nul 2>&1
if errorlevel 1 (echo [FAIL] drawer scroll fix missing in public\program-builder.css) else (echo [ OK ] #drawerTabAdd is the single scroll container ^(overscroll-behavior:contain^))
findstr /C:"body.drawer-open{overflow:hidden}" "public\program-builder.css" >nul 2>&1
if errorlevel 1 (echo [FAIL] page scroll lock missing in public\program-builder.css) else (echo [ OK ] body.drawer-open page lock present)
findstr /C:"max-height: min(42vh, 320px)" "public\program-builder.css" >nul 2>&1
if errorlevel 1 (echo [FAIL] mobile cap for .drawer-bank-flow missing) else (echo [ OK ] mobile cap min^(42vh,320px^) present)
findstr /C:"interactive-widget=resizes-content" "public\index.html" >nul 2>&1
if errorlevel 1 (echo [FAIL] viewport not updated in public\index.html) else (echo [ OK ] viewport-fit=cover + interactive-widget=resizes-content present)
findstr /C:"classList?.add('drawer-open')" "public\program-builder.js" >nul 2>&1
if errorlevel 1 (echo [FAIL] openExerciseDrawer does not lock the page) else (echo [ OK ] openExerciseDrawer locks the page ^(drawer-open^))
findstr /C:"preventScroll:true" "public\program-builder.js" >nul 2>&1
if errorlevel 1 (echo [FAIL] manual-add panel focus still jumps the page) else (echo [ OK ] manual-add panel scrolls into view + focus preventScroll)
exit /b

:PULLTEST
echo.
echo --- git pull + npm test ---
git fetch origin
git checkout %BRANCH% 2>nul
git pull --ff-only origin %BRANCH%
if errorlevel 1 (echo [WARN] pull was not fast-forward - check git status by hand)
call npm test
if errorlevel 1 (echo [FAIL] npm test did not pass - do NOT restart the server) else (echo [ OK ] npm test passed ^(expect 18/18, exit 0^))
exit /b

:RESTART
echo.
echo --- restart server ---
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul
if not exist logs mkdir logs
start "" /B node server.js > logs\server.log 2>&1
echo Server starting on port %PORT% (log: logs\server.log)
timeout /t 3 /nobreak >nul
exit /b

:HEALTH
echo.
echo --- GET /api/health (uptime must be small = restarted) ---
powershell -NoProfile -Command "try{$r=Invoke-RestMethod -Uri 'http://localhost:%PORT%/api/health' -TimeoutSec 10; $r | ConvertTo-Json -Compress | Write-Host; if($r.uptime -lt 120){Write-Host '[ OK ] uptime reset' -ForegroundColor Green}else{Write-Host '[WARN] uptime is NOT small - old process may still be serving' -ForegroundColor Yellow}}catch{Write-Host ('[FAIL] ' + $_.Exception.Message) -ForegroundColor Red}"
exit /b

:CSSCHECK
echo.
echo --- GET /program-builder.css (served file must contain the fix) ---
powershell -NoProfile -Command "try{$c=(Invoke-WebRequest -Uri 'http://localhost:%PORT%/program-builder.css' -UseBasicParsing -TimeoutSec 10).Content; if($c -match 'overscroll-behavior:contain'){Write-Host '[ OK ] served CSS contains overscroll-behavior:contain' -ForegroundColor Green}else{Write-Host '[FAIL] served CSS is stale - browser/proxy cache or wrong folder' -ForegroundColor Red}; if($c -match 'body\.drawer-open\{overflow:hidden\}'){Write-Host '[ OK ] served CSS locks the page behind the drawer' -ForegroundColor Green}}catch{Write-Host ('[FAIL] ' + $_.Exception.Message) -ForegroundColor Red}"
echo NOTE: static assets are served with max-age=86400 - on the phone/browser do a hard refresh.
exit /b
