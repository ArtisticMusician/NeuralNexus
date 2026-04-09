@echo off
cd /d "%~dp0"
echo Stopping Qdrant...
taskkill /IM qdrant.exe /F 2>nul
timeout /t 2 /nobreak >nul
echo Starting Qdrant...
powershell -ExecutionPolicy Bypass -File scripts\run-qdrant.ps1
