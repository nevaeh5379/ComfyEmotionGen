# Starts backend (port 8000) + frontend preview (port 4173).
# Configure ComfyUI with $env:COMFYUI_WORKERS (default http://localhost:8188).
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$VenvPy = "$Root\backend\.venv\Scripts\python.exe"

if (-not (Test-Path $VenvPy)) {
    Write-Error "Backend venv missing. Run .\install.ps1 first."
    exit 1
}
if (-not (Test-Path "$Root\frontend\web\dist")) {
    Write-Error "Frontend build missing. Run .\install.ps1 first."
    exit 1
}

Write-Host "==> Starting backend on :8000" -ForegroundColor Cyan
$backend = Start-Process -FilePath $VenvPy `
    -ArgumentList "run.py" `
    -WorkingDirectory "$Root\backend" `
    -PassThru -NoNewWindow

Write-Host "==> Starting frontend on :4173" -ForegroundColor Cyan
$frontend = Start-Process -FilePath "npm" `
    -ArgumentList "run","preview","--","--host" `
    -WorkingDirectory "$Root\frontend\web" `
    -PassThru -NoNewWindow

Write-Host ""
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:4173" -ForegroundColor Green
Write-Host "Press Ctrl-C to stop." -ForegroundColor Yellow

try {
    Wait-Process -Id $backend.Id, $frontend.Id
}
finally {
    foreach ($p in @($backend, $frontend)) {
        if ($p -and -not $p.HasExited) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
