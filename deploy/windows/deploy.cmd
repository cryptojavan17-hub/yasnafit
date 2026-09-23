@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deploy-Yasnafit.ps1" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto hold
if "%~1"=="" goto hold
exit /b 0
:hold
pause
exit /b %RC%
