@echo off
setlocal enabledelayedexpansion

echo 🚀 Launching Native Mode...
echo 🔍 Checking for Qdrant at localhost:6333...

node scripts/check-qdrant.js
set RET=!errorlevel!
echo [Debug] node returned !RET!

if !RET! neq 0 (
    echo ⚠️  No Qdrant instance detected at http://localhost:6333
    echo    Would you like to automatically download and setup Qdrant?
    echo [Simulation] we would stop here for set /p
) else (
    echo ✅ Qdrant detected.
)
echo [ SIMULATION COMPLETE ]

