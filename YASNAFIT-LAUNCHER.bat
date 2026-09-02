@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=3020"

:MENU
cls
echo ====================================================
echo                YASNAFIT - LAUNCHER
echo ====================================================
call :STATUS
call :CHECKCODE
echo.
echo 1. Start Server ^& Open Dashboard
echo 2. Restart Server
echo 3. Stop Server
echo 4. View Live Server Logs ^& Diagnostics
echo 5. Exit
echo.
set /p choice=Select an option (1-5):
if "%choice%"=="1" call :START & goto MENU
if "%choice%"=="2" call :STOP & call :START & goto MENU
if "%choice%"=="3" call :STOP & pause & goto MENU
if "%choice%"=="4" call :LOGS & goto MENU
if "%choice%"=="5" exit /b 0
goto MENU

:STATUS
powershell -NoProfile -Command "$l=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($l){Write-Host 'Server Status: RUNNING' -ForegroundColor Green}else{Write-Host 'Server Status: STOPPED' -ForegroundColor Red}; if(Test-Path 'data\yasnafit.db'){Write-Host 'Database Health: ONLINE' -ForegroundColor Green}else{Write-Host 'Database Health: NOT INITIALIZED' -ForegroundColor Yellow}; Write-Host 'Port: %PORT%'"
exit /b

:CHECKCODE
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do echo Git branch: %%b
for /f "delims=" %%s in ('git rev-parse --short HEAD 2^>nul') do echo Git commit: %%s
findstr /C:"credentialEditorMarkup" "public\students.js" >nul 2>&1
if errorlevel 1 goto :CODE_OLD
echo UI check: NEW CODE is in public\students.js - student password dialog is available
goto :CODE_DONE
:CODE_OLD
echo UI check: OLD CODE - the pulled update is NOT in this folder. Check the branch and run git pull again
:CODE_DONE
exit /b

:START
where node >nul 2>&1
if errorlevel 1 (echo Node.js was not found. Install Node.js 22.5 or newer, then reopen this launcher.& exit /b 1)
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 (echo Server is already running on port %PORT%. If you just pulled new code, choose 2 to restart it.& call :CHECKCODE& call :SHOW_AUTHENTICATOR& call :OPEN_DASHBOARD& exit /b)
if not exist logs mkdir logs
echo Starting Yasnafit server in background (no extra window)...
REM Run node in background without new window (/B) - keeps launcher visible
start "" /B node server.js > logs\server.log 2>&1
timeout /t 2 /nobreak >nul
call :SHOW_AUTHENTICATOR
call :OPEN_DASHBOARD
echo Yasnafit started at http://localhost:%PORT% - launcher stays open
exit /b

:SHOW_AUTHENTICATOR
if exist data\coach-authenticator.txt (
  echo.
  echo ----------------------------------------------------
  echo لینک و کلید Google Authenticator:
  type data\coach-authenticator.txt
  echo ----------------------------------------------------
  echo Notepad this file if you have not added Authenticator yet.
  start "" notepad "data\coach-authenticator.txt"
  echo.
  pause
)
exit /b

:OPEN_DASHBOARD
start "" "http://localhost:%PORT%/coach/login"
exit /b

:STOP
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Server stopped.
exit /b

:LOGS
if exist logs\server.log (powershell -NoProfile -Command "Get-Content -Path 'logs\server.log' -Tail 60") else (echo No log file exists yet. Start the server first.)
echo.
pause
exit /b
