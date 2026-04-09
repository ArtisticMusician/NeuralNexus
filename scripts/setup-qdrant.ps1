# setup-qdrant.ps1: Automates Qdrant setup using curl
$ProgressPreference = 'SilentlyContinue'

$QDRANT_VERSION = "v1.17.0"
$BIN_DIR = "bin"
$DATA_DIR = "qdrant_data"

Write-Host "Setting up Qdrant for Native Mode..." -ForegroundColor Cyan

if (!(Test-Path $BIN_DIR)) { New-Item -ItemType Directory -Path $BIN_DIR | Out-Null }
if (!(Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR | Out-Null }
if (!(Test-Path "config")) { New-Item -ItemType Directory -Path "config" | Out-Null }
if (!(Test-Path "static")) { New-Item -ItemType Directory -Path "static" | Out-Null }

$URL = "https://github.com/qdrant/qdrant/releases/download/$QDRANT_VERSION/qdrant-x86_64-pc-windows-msvc.zip"
$ZIP_PATH = Join-Path $BIN_DIR "qdrant.zip"
$EXE_PATH = Join-Path $BIN_DIR "qdrant.exe"

if (!(Test-Path $EXE_PATH)) {
    Write-Host "Downloading Qdrant via curl..." -ForegroundColor Yellow
    try {
        curl.exe -L $URL -o $ZIP_PATH --connect-timeout 30 --max-time 300 --silent
        
        if ($LASTEXITCODE -ne 0) {
            throw "curl failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Host "curl failed, falling back to Invoke-WebRequest..." -ForegroundColor Yellow
        try {
            Invoke-WebRequest -Uri $URL -OutFile $ZIP_PATH -UseBasicParsing -TimeoutSec 300
        }
        catch {
            Write-Host "ERROR: Failed to download Qdrant from $URL" -ForegroundColor Red
            Write-Host "Please check your internet connection and try again." -ForegroundColor Red
            exit 1
        }
    }
    
    if (!(Test-Path $ZIP_PATH)) {
        Write-Host "ERROR: Download failed - ZIP file not created" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Extracting Qdrant..." -ForegroundColor Yellow
    try {
        Expand-Archive -Path $ZIP_PATH -DestinationPath $BIN_DIR -Force
        Remove-Item $ZIP_PATH -Force
        
        if (!(Test-Path $EXE_PATH)) {
            Write-Host "ERROR: Extraction failed - qdrant.exe not found" -ForegroundColor Red
            exit 1
        }
    }
    catch {
        Write-Host "ERROR: Failed to extract Qdrant archive" -ForegroundColor Red
        Write-Host $_ -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Qdrant binary already exists in $BIN_DIR" -ForegroundColor Green
}

$CONFIG_CONTENT = "storage:`r`n  storage_path: `$DATA_DIR`r`ntelemetry_disabled: true"
Set-Content -Path "config/config.yaml" -Value $CONFIG_CONTENT -Encoding Ascii
Set-Content -Path "config/development.yaml" -Value $CONFIG_CONTENT -Encoding Ascii

$RUN_SCRIPT = "Write-Host 'Starting Qdrant...' -ForegroundColor Green`r`n`$env:QDRANT__STORAGE__STORAGE_PATH = 'qdrant_data'`r`n`$env:QDRANT__SERVICE__HTTP_PORT = '5304'`r`n`& (Join-Path 'bin' 'qdrant.exe')"
Set-Content -Path "scripts/run-qdrant.ps1" -Value $RUN_SCRIPT -Encoding Ascii

Write-Host "Setup complete!" -ForegroundColor Green

