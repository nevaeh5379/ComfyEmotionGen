# build_frontend_exe.ps1 - Builds the frontend-only portable executable

$ErrorActionPreference = "Stop"

$PortableDir = $PSScriptRoot
$ProjectRoot = (Get-Item $PortableDir).Parent.FullName
$FrontendDir = Join-Path $ProjectRoot "frontend/web"
$DistDir = Join-Path $PortableDir "frontend_dist"

Set-Location $PortableDir

Write-Host "Building ComfyEmotionGen Frontend Executable..." -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "[1/2] Building React Frontend..." -ForegroundColor Yellow
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
Write-Host "[2/2] Preparing frontend assets and packaging..." -ForegroundColor Yellow
if (Test-Path $DistDir) {
    Remove-Item -Recurse -Force $DistDir
}
Copy-Item -Path (Join-Path $FrontendDir "dist") -Destination $DistDir -Recurse

Write-Host "Running PyInstaller compilation..." -ForegroundColor Gray
& python -m PyInstaller --name "ComfyEmotionGen-frontend" `
            --noconfirm `
            --onefile `
            --add-data "$DistDir;frontend_dist" `
            --clean `
            frontend_entry.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Frontend executable: $PortableDir\dist\ComfyEmotionGen-frontend.exe" -ForegroundColor Green
