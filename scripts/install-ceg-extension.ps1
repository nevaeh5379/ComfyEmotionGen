# Install CEG VS Code extension from .vsix
# Run this once to enable .ceg syntax highlighting in VS Code

$vsixPath = "$PSScriptRoot\..\vscode-ceg\ceg-support-0.1.0.vsix"

if (-not (Test-Path $vsixPath)) {
    Write-Host "ERROR: .vsix not found at $vsixPath" -ForegroundColor Red
    Write-Host "Run 'vsce package' in vscode-ceg/ first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing CEG language support from .vsix..." -ForegroundColor Cyan
code --install-extension $vsixPath --force

Write-Host ""
Write-Host "Done! .ceg files now have syntax highlighting." -ForegroundColor Green
