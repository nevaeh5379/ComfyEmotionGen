# deploy-personal.ps1 - 개인용: 빌드 후 F:\ceg로 배포

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

$BuildScript = "F:\source\ComfyEmotionGen\portable\build.ps1"
$SourceExe  = "F:\source\ComfyEmotionGen\portable\dist\ComfyEmotionGen.exe"
$TargetDir  = "F:\ceg"

Write-Host "======= 개인용 배포 스크립트 =======" -ForegroundColor Cyan

# 1. 빌드 실행
Write-Host "`n[1/2] 빌드 시작..." -ForegroundColor Yellow
& $BuildScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 빌드 실패!" -ForegroundColor Red
    exit 1
}

# 2. 실행 파일 복사
Write-Host "`n[2/2] 실행 파일 복사 중..." -ForegroundColor Yellow
if (!(Test-Path $SourceExe)) {
    Write-Host "`n❌ 빌드 산출물 없음: $SourceExe" -ForegroundColor Red
    exit 1
}
if (!(Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}
Copy-Item -Path $SourceExe -Destination $TargetDir -Force
Write-Host "  → $SourceExe -> $TargetDir\ComfyEmotionGen.exe" -ForegroundColor Gray

Write-Host "`n[3/2] 실행 파일 실행 중..." -ForegroundColor Yellow
$TargetExe = Join-Path $TargetDir "ComfyEmotionGen.exe"
Start-Process -FilePath $TargetExe
Write-Host "  → $TargetExe 실행됨" -ForegroundColor Gray

Write-Host "`n✅ 배포 완료!" -ForegroundColor Green
