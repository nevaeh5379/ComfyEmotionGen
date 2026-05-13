# build_backend.ps1 - Builds the backend-only portable executable

$ErrorActionPreference = "Stop"

$PortableDir = $PSScriptRoot
$ProjectRoot = (Get-Item $PortableDir).Parent.FullName
$BackendDir = Join-Path $ProjectRoot "backend"

Set-Location $PortableDir

Write-Host "Building ComfyEmotionGen Backend Executable..." -ForegroundColor Cyan

$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (!(Test-Path $VenvPython)) {
    Write-Host "Virtual environment not found at $VenvPython. Using global python..." -ForegroundColor Yellow
    $VenvPython = "python"
} else {
    Write-Host "Using virtual environment python at $VenvPython" -ForegroundColor Gray
}

& $VenvPython -m pip --version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "pip not found. Attempting to bootstrap pip..." -ForegroundColor Gray
    & $VenvPython -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install pip."
        exit 1
    }
}

& $VenvPython -m PyInstaller --version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller not found. Attempting to install..." -ForegroundColor Gray
    & $VenvPython -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install PyInstaller."
        exit 1
    }
}

Write-Host "Running PyInstaller compilation..." -ForegroundColor Gray
& $VenvPython -m PyInstaller --name "ComfyEmotionGen-backend" `
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
