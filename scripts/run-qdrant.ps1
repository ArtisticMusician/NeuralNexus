Write-Host 'Starting Qdrant...' -ForegroundColor Green
$env:QDRANT__STORAGE__STORAGE_PATH = 'qdrant_data'
$env:QDRANT__SERVICE__HTTP_PORT = '5304'
& (Join-Path 'bin' 'qdrant.exe')
