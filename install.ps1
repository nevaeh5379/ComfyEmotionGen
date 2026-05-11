# One-time setup: create backend venv, install Python deps, build frontend.
# Prereqs: Python 3.10+, Node 20+.
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$Py = if ($env:PYTHON) { $env:PYTHON } else { "python" }

Write-Host "==> Creating backend venv ($Py)" -ForegroundColor Cyan
& $Py -m venv "$Root\backend\.venv"

$VenvPy = "$Root\backend\.venv\Scripts\python.exe"

Write-Host "==> Installing backend dependencies" -ForegroundColor Cyan
& $VenvPy -m pip install --upgrade pip
& $VenvPy -m pip install -r "$Root\backend\requirements.txt"

Write-Host "==> Installing frontend dependencies" -ForegroundColor Cyan
Push-Location "$Root\frontend\web"
try {
    npm install
    Write-Host "==> Building frontend" -ForegroundColor Cyan
    npm run build
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "✅ Install complete. Run .\run.ps1 to start." -ForegroundColor Green
