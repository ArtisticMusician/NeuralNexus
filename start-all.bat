@echo off
cd /d "%~dp0"
echo Starting Qdrant in background...
start "Qdrant" powershell -ExecutionPolicy Bypass -File scripts\run-qdrant.ps1
timeout /t 2 /nobreak >nul
echo Starting Neural Nexus server + dashboard...
npm run dev:all
