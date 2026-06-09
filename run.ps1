# Starts backend + frontend preview.
# Port defaults: BACKEND_PORT (default 8000), FRONTEND_PORT (default 4173).
# Configure ComfyUI with $env:COMFYUI_WORKERS (default http://localhost:8188).
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$VenvPy = "$Root\backend\.venv\Scripts\python.exe"

$BackendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8000" }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "4173" }
$BackendHost = if ($env:BACKEND_HOST) { $env:BACKEND_HOST } else { "127.0.0.1" }

if (-not (Test-Path $VenvPy)) {
  Write-Error "Backend venv missing. Run .\install.ps1 first."
  exit 1
}
if (-not (Test-Path "$Root\frontend\webui\dist")) {
  Write-Error "Frontend build missing. Run .\install.ps1 first."
  exit 1
}

Write-Host "==> Starting backend on :${BackendPort}" -ForegroundColor Cyan
$env:BACKEND_PORT = $BackendPort
$env:BACKEND_HOST = $BackendHost
$backend = Start-Process -FilePath $VenvPy `
    -ArgumentList "run.py" `
    -WorkingDirectory "$Root\backend" `
    -PassThru -NoNewWindow

Write-Host "==> Starting frontend on :${FrontendPort}" -ForegroundColor Cyan
$frontend = Start-Process -FilePath "npm" `
    -ArgumentList "run","preview","--","--host","--port",$FrontendPort `
    -WorkingDirectory "$Root\frontend\webui" `
    -PassThru -NoNewWindow

Write-Host ""
Write-Host "Backend:  http://localhost:${BackendPort}" -ForegroundColor Green
Write-Host "Frontend: http://localhost:${FrontendPort}" -ForegroundColor Green
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