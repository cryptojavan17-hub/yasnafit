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
echo 6. Import Exercise Images (1888 pics)
echo 7. Exit
echo.
set /p choice=Select an option (1-7):
if "%choice%"=="1" call :START & goto MENU
if "%choice%"=="2" call :STOP & call :START & goto MENU
if "%choice%"=="3" call :STOP & pause & goto MENU
if "%choice%"=="4" call :LOGS & goto MENU
if "%choice%"=="5" call :UPDATE & pause & goto MENU
if "%choice%"=="6" call :IMPORT_IMAGES & pause & goto MENU
if "%choice%"=="7" exit /b 0
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
echo Starting Yasnafit server in background (no extra window)...
REM Run node in background without new window (/B) - keeps launcher visible
start "" /B node server.js > logs\server.log 2>&1
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%
echo Yasnafit started at http://localhost:%PORT% - launcher stays open
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

:IMPORT_IMAGES
echo.
echo ====================================================
echo   Import Exercise Images (2707 movements)
echo ====================================================
set "SRC1=C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized"
set "SRC2=%USERPROFILE%\Desktop\bodybuilding\exercises_organized"
set "SRC3=C:\Users\MAHDI\Desktop\yasnafit-git\exercises_organized"
set "DST=public\assets\images\exercises\imported"
if not exist "%DST%" mkdir "%DST%"

set "SRC="
if exist "%SRC1%" set "SRC=%SRC1%"
if not defined SRC if exist "%SRC2%" set "SRC=%SRC2%"
if not defined SRC if exist "%SRC3%" set "SRC=%SRC3%"

if not defined SRC (
  echo.
  echo Image source folder not found.
  echo Checked:
  echo   - %SRC1%
  echo   - %SRC2%
  echo   - %SRC3%
  echo.
  echo Please copy your 1888 images manually:
  echo   From: C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized
  echo   To:   %CD%\%DST%
  echo.
  echo Current images in %DST%:
  if exist "%DST%\*" (dir "%DST%" | find "File(s)") else (echo No images yet - placeholder will be shown in app)
  exit /b
)

echo Found images at %SRC%
echo.
echo Copying images recursively (flatten)...
echo Source: %SRC%
echo Dest:   %CD%\%DST%
echo.

powershell -NoProfile -Command ^
  "$src='%SRC%'; $dst='%DST%'; $dstFull=Join-Path (Get-Location) $dst; " ^
  "if(!(Test-Path $dstFull)){New-Item -ItemType Directory -Path $dstFull -Force | Out-Null}; " ^
  "$files=Get-ChildItem -Path $src -Recurse -File | Where-Object { $_.Extension -match '\.(png|jpg|jpeg|gif|webp)$' }; " ^
  "Write-Host \"Found $($files.Count) image files in subfolders\" -ForegroundColor Cyan; " ^
  "if($files.Count -eq 0){ Write-Host \"No images found! Checking structure:\"; Get-ChildItem $src | Format-Table Name,Mode; Get-ChildItem $src -Recurse -Directory | Select-Object -First 10 FullName | Format-Table; } " ^
  "$copied=0; $skipped=0; $errors=0; " ^
  "foreach($f in $files){ try{ $destFile=Join-Path $dstFull $f.Name; if(!(Test-Path $destFile)){ Copy-Item $f.FullName $destFile -Force; $copied++ } else { $skipped++ } } catch { $errors++; Write-Host \"Error copying $($f.Name): $_\" -ForegroundColor Red } }; " ^
  "Write-Host \"Copied: $copied, Already existed: $skipped, Errors: $errors\"; " ^
  "$final=(Get-ChildItem $dstFull -File -ErrorAction SilentlyContinue).Count; Write-Host \"Total images in imported folder: $final\" -ForegroundColor Green; " ^
  "if($final -lt 100){ Write-Host \"Sample files in source:\"; $files | Select-Object -First 5 Name,Directory | Format-Table }"

echo.
echo Also checking for videos...
set "SRC_VID=C:\Users\MAHDI\Desktop\bodybuilding\exercises_videos"
set "DST_VID=public\assets\videos\exercises"
if exist "%SRC_VID%" (
  if not exist "%DST_VID%" mkdir "%DST_VID%"
  echo Found videos at %SRC_VID% - copying...
  powershell -NoProfile -Command "Get-ChildItem -Path '%SRC_VID%' -Recurse -File -Include *.mp4,*.mov,*.avi | ForEach-Object { Copy-Item $_.FullName (Join-Path '%DST_VID%' $_.Name) -Force }"
)

echo.
echo Done! Images are now available in %DST%
dir "%DST%" | find "File(s)"
echo.
echo If images still not showing in app, restart server (option 2)
exit /b
