# reset-qdrant.ps1: Cleanup script to reset Qdrant installation
$ProgressPreference = 'SilentlyContinue'

Write-Host "🧹 Cleaning up Qdrant installation..." -ForegroundColor Cyan

# Stop any running Qdrant processes
Write-Host "🛑 Stopping any running Qdrant processes..." -ForegroundColor Yellow
Get-Process -Name "qdrant" -ErrorAction SilentlyContinue | Stop-Process -Force

# Remove directories
$dirsToRemove = @("bin", "qdrant_data", "config", "static")
foreach ($dir in $dirsToRemove) {
    if (Test-Path $dir) {
        Write-Host "🗑️  Removing directory: $dir" -ForegroundColor Yellow
        Remove-Item -Path $dir -Recurse -Force
    }
}

# Remove initialization marker
if (Test-Path ".qdrant-initialized") {
    Remove-Item ".qdrant-initialized" -Force
}

Write-Host "✅ Qdrant cleanup complete!" -ForegroundColor Green
Write-Host "You can now run quickstart.bat again for a fresh installation." -ForegroundColor Green
