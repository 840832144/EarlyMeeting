@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0control.ps1" -Mode Meeting -Action Check
pause
endlocal
