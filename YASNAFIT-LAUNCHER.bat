@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=3020"
set "BRANCH=arena/01a028ff-yasnafit"

:MENU
cls
echo ====================================================
echo                YASNAFIT - LAUNCHER
echo ====================================================
call :STATUS
echo.
echo 1. Start Server ^& Open Dashboard
echo 2. Restart Server
echo 3. Stop Server
echo 4. View Live Server Logs ^& Diagnostics
echo 5. Update Yasnafit from GitHub
echo 6. Exit
echo.
set /p choice=Select an option (1-6):
if "%choice%"=="1" call :START & goto MENU
if "%choice%"=="2" call :STOP & call :START & goto MENU
if "%choice%"=="3" call :STOP & pause & goto MENU
if "%choice%"=="4" call :LOGS & goto MENU
if "%choice%"=="5" call :UPDATE & pause & goto MENU
if "%choice%"=="6" exit /b 0
goto MENU

:STATUS
powershell -NoProfile -Command "$l=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($l){Write-Host 'Server Status: RUNNING' -ForegroundColor Green}else{Write-Host 'Server Status: STOPPED' -ForegroundColor Red}; if(Test-Path 'data\yasnafit.db'){Write-Host 'Database Health: ONLINE' -ForegroundColor Green}else{Write-Host 'Database Health: NOT INITIALIZED' -ForegroundColor Yellow}; Write-Host 'Port: %PORT%'"
exit /b

:START
where node >nul 2>&1
if errorlevel 1 (echo Node.js was not found. Install Node.js 22.5 or newer, then reopen this launcher.& exit /b 1)
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 (echo Server is already running on port %PORT%.& start "" http://localhost:%PORT%& exit /b)
if not exist logs mkdir logs
start "Yasnafit Server" /min cmd /c "node server.js > logs\server.log 2>&1"
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%
echo Yasnafit started at http://localhost:%PORT%
exit /b

:STOP
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Server stopped.
exit /b

:UPDATE
where git >nul 2>&1
if errorlevel 1 (echo Git was not found. Install Git for Windows first.& exit /b 1)
echo.
echo Checking for updates from GitHub...
call :STOP
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
if not defined BRANCH set "BRANCH=arena/01a028ff-yasnafit"
echo Pulling latest changes from branch %BRANCH%...
git pull origin %BRANCH%
if errorlevel 1 (echo. & echo Update failed. Check your internet connection and Git status.& exit /b 1)
echo.
echo Yasnafit is now up to date.
echo Starting updated server automatically...
call :START
exit /b

:LOGS
if exist logs\server.log (powershell -NoProfile -Command "Get-Content -Path 'logs\server.log' -Tail 60") else (echo No log file exists yet. Start the server first.)
echo.
pause
exit /b
