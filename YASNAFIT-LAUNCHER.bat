@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=3020"
set "PID_FILE=%~dp0yasnafit.pid"

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

:START
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 (
  echo Server is already running on port %PORT%.
  start "" http://localhost:%PORT%
  exit /b
)
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

:LOGS
if exist logs\server.log (
  powershell -NoProfile -Command "Get-Content -Path 'logs\server.log' -Tail 60"
) else (
  echo No log file exists yet. Start the server first.
)
echo.
pause
exit /b
