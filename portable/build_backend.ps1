# build_backend.ps1 - Builds the backend-only portable executable

$ErrorActionPreference = "Stop"

$PortableDir = $PSScriptRoot
$ProjectRoot = (Get-Item $PortableDir).Parent.FullName
$BackendDir = Join-Path $ProjectRoot "backend"

Set-Location $PortableDir

Write-Host "Building ComfyEmotionGen Backend Executable..." -ForegroundColor Cyan

# Ensure PyInstaller is available
python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller not found. Installing..." -ForegroundColor Gray
    python -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install PyInstaller."
        exit 1
    }
}

Write-Host "Running PyInstaller compilation..." -ForegroundColor Gray
python -m PyInstaller --name "ComfyEmotionGen-backend" `
            --noconfirm `
            --onefile `
            --paths $BackendDir `
            --add-data "$BackendDir;backend" `
            --hidden-import "uvicorn.logging" `
            --hidden-import "uvicorn.loops" `
            --hidden-import "uvicorn.loops.auto" `
            --hidden-import "uvicorn.protocols" `
            --hidden-import "uvicorn.protocols.http" `
            --hidden-import "uvicorn.protocols.http.auto" `
            --hidden-import "uvicorn.protocols.websockets" `
            --hidden-import "uvicorn.protocols.websockets.auto" `
            --hidden-import "uvicorn.lifespan" `
            --hidden-import "uvicorn.lifespan.on" `
            --clean `
            backend_entry.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Backend executable: $PortableDir\dist\ComfyEmotionGen-backend.exe" -ForegroundColor Green
