# build.ps1 - Builds the portable ComfyEmotionGen application

$ErrorActionPreference = "Stop"

$ProjectRoot = (Get-Item ..).FullName
$PortableDir = $PWD.Path
$FrontendDir = Join-Path $ProjectRoot "frontend/web"
$BackendDir = Join-Path $ProjectRoot "backend"
$DistDir = Join-Path $PortableDir "frontend_dist"

Write-Host "🚀 Building ComfyEmotionGen Portable Executable..." -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "`n[1/3] Building React Frontend..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Gray
    npm install
    npm run build
}
finally {
    Pop-Location
}

# 2. Copy Frontend Dist
Write-Host "`n[2/3] Preparing frontend assets..." -ForegroundColor Yellow
if (Test-Path $DistDir) {
    Remove-Item -Recurse -Force $DistDir
}
Copy-Item -Path (Join-Path $FrontendDir "dist") -Destination $DistDir -Recurse

# 3. Build Backend using PyInstaller
Write-Host "`n[3/3] Packaging with PyInstaller..." -ForegroundColor Yellow

$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (!(Test-Path $VenvPython)) {
    Write-Host "Virtual environment not found at $VenvPython. Using global python..." -ForegroundColor Yellow
    $VenvPython = "python"
} else {
    Write-Host "Using virtual environment python at $VenvPython" -ForegroundColor Gray
}

# Ensure pip is available in the environment
& $VenvPython -m pip --version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "pip not found. Attempting to bootstrap pip..." -ForegroundColor Gray
    & $VenvPython -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install pip. Please ensure pip is installed in your python environment."
        exit 1
    }
}

# Ensure pyinstaller is available
& $VenvPython -m PyInstaller --version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller not found. Attempting to install..." -ForegroundColor Gray
    & $VenvPython -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install PyInstaller."
        exit 1
    }
}

# Build the executable
Write-Host "Running PyInstaller compilation..." -ForegroundColor Gray
& $VenvPython -m PyInstaller --name "ComfyEmotionGen" `
            --noconfirm `
            --onefile `
            --paths $BackendDir `
            --add-data "$BackendDir;backend" `
            --add-data "$DistDir;frontend_dist" `
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
            launcher.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build Failed! PyInstaller encountered an error." -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Build Complete!" -ForegroundColor Green
Write-Host "Your portable executable is located at: $(Join-Path $PortableDir 'dist/ComfyEmotionGen.exe')" -ForegroundColor Cyan
