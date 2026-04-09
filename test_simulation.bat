@echo off
setlocal enabledelayedexpansion

echo [ TEST SIMULATION ]

:: 1. Setup .env from .env.example
copy .env.example .env.test_sim > nul
echo ✅ Test .env created.

:: 2. Run .env update
echo ⚙️  Updating .env with test password...
node scripts/setup-env.js "test_secure_pass" .env.test_sim
if %errorlevel% neq 0 (
    echo ❌ .env update FAILED.
    exit /b 1
)
echo ✅ .env update success.

:: 3. Run Qdrant health check
echo 🔍 Checking for Qdrant (this should fail fast if not running)...
node scripts/check-qdrant.js
if %errorlevel% neq 0 (
    echo ⚠️  Qdrant not detected (EXPECTED if not running).
) else (
    echo ✅ Qdrant detected.
)

echo [ SIMULATION COMPLETE ]
