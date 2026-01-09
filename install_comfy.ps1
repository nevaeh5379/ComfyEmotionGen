# ComfyUI 자동 설치 스크립트
# ============================
# 주의: NVIDIA GPU만 지원합니다!
# 
# 설치 항목:
#   - ComfyUI (최신 버전)
#   - Python Embedded (포터블)
#   - triton-windows
#   - SageAttention-for-windows
#   - ComfyUI_IPAdapter_plus
#   - cg-use-everywhere  
#   - ComfyUI-KJNodes
#   - 필수 모델 파일들

param(
    [string]$InstallPath = ".\ComfyUI",
    [string]$PythonVersion = "3.11.9",
    [switch]$SkipModels = $false
)

$ErrorActionPreference = "Stop"

# 스크립트 레벨 변수
$script:pythonExe = $null
$script:pipExe = $null

# 색상 출력 함수
function Write-Step { param([string]$Message) Write-Host "`n[*] $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[+] $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "[!] $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "[x] $Message" -ForegroundColor Red }

Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host "              ComfyUI 자동 설치 스크립트                      " -ForegroundColor Magenta
Write-Host "                                                              " -ForegroundColor Magenta
Write-Host "  [!] NVIDIA GPU만 지원합니다!                                " -ForegroundColor Magenta
Write-Host "  [i] Python Embedded 사용 (포터블)                           " -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta

# NVIDIA GPU 확인
Write-Step "NVIDIA GPU 확인 중..."
$nvidiaGpu = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" }
if (-not $nvidiaGpu) {
    Write-Error "NVIDIA GPU를 찾을 수 없습니다. 이 스크립트는 NVIDIA GPU만 지원합니다."
    exit 1
}
Write-Success "NVIDIA GPU 발견: $($nvidiaGpu.Name)"

# Git 확인
Write-Step "Git 확인 중..."
try {
    $gitVersion = git --version 2>&1
    Write-Success "Git 발견: $gitVersion"
} catch {
    Write-Error "Git이 설치되어 있지 않습니다. Git 설치 후 다시 시도해주세요."
    exit 1
}

# ComfyUI 클론
Write-Step "ComfyUI 클론 중..."
if (Test-Path $InstallPath) {
    Write-Warning "ComfyUI 폴더가 이미 존재합니다: $InstallPath"
    $response = Read-Host "기존 폴더를 사용하시겠습니까? (y/n)"
    if ($response -ne 'y') {
        Write-Host "설치를 취소합니다."
        exit 0
    }
} else {
    git clone https://github.com/comfyanonymous/ComfyUI.git $InstallPath
    Write-Success "ComfyUI 클론 완료"
}

Push-Location $InstallPath

try {
    # Python Embedded 다운로드 및 설치
    $pythonEmbedPath = "python_embeded"
    $script:pythonExe = Join-Path (Get-Location) "$pythonEmbedPath\python.exe"
    $script:pipExe = Join-Path (Get-Location) "$pythonEmbedPath\Scripts\pip.exe"
    
    if (-not (Test-Path $script:pythonExe)) {
        Write-Step "Python $PythonVersion Embedded 다운로드 중..."
        
        $pythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
        $pythonZipPath = Join-Path $env:TEMP "python-embed.zip"
        
        curl.exe -L -# -o $pythonZipPath $pythonZipUrl
        Write-Success "Python Embedded 다운로드 완료"
        
        Write-Step "Python Embedded 압축 해제 중..."
        if (Test-Path $pythonEmbedPath) {
            Remove-Item $pythonEmbedPath -Recurse -Force
        }
        Expand-Archive -Path $pythonZipPath -DestinationPath $pythonEmbedPath
        Remove-Item $pythonZipPath
        Write-Success "Python Embedded 설치 완료"
        
        # pip 설치
        Write-Step "pip 설치 중..."
        $getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
        $getPipPath = Join-Path $pythonEmbedPath "get-pip.py"
        curl.exe -L -# -o $getPipPath $getPipUrl
        
        # python*._pth 파일 수정하여 import 활성화
        $pthFile = Get-ChildItem -Path $pythonEmbedPath -Filter "python*._pth" | Select-Object -First 1
        if ($pthFile) {
            $pthContent = Get-Content $pthFile.FullName
            $pthContent = $pthContent -replace '#import site', 'import site'
            # 현재 디렉토리, 상위 디렉토리, Lib\site-packages 추가
            $pthContent += "`n."
            $pthContent += "`n.."
            $pthContent += "`nLib\site-packages"
            Set-Content -Path $pthFile.FullName -Value $pthContent
            Write-Success "Python path 설정 완료"
        }
        
        & $script:pythonExe $getPipPath
        Remove-Item $getPipPath
        Write-Success "pip 설치 완료"
    } else {
        Write-Warning "Python Embedded가 이미 설치되어 있습니다"
    }

    # pip 업그레이드
    Write-Step "pip 업그레이드 중..."
    & $script:pythonExe -m pip install --upgrade pip

    # PyTorch 설치 (CUDA)
    Write-Step "PyTorch (CUDA) 설치 중..."
    & $script:pipExe install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130
    Write-Success "PyTorch 설치 완료"

    # ComfyUI 의존성 설치
    Write-Step "ComfyUI 의존성 설치 중..."
    & $script:pipExe install -r requirements.txt
    Write-Success "ComfyUI 의존성 설치 완료"

    # triton-windows 설치
    Write-Step "triton-windows 설치 중..."
    & $script:pipExe install triton-windows
    Write-Success "triton-windows 설치 완료"

    # SageAttention-for-windows 설치
    Write-Step "SageAttention-for-windows 설치 중..."
    $sageWheelUrl = "https://github.com/sdbds/SageAttention-for-windows/releases/download/torch291%2Bcu130/sageattention-2.2.0+cu130torch2.9.1-cp311-cp311-win_amd64.whl"
    $sageWheelName = "sageattention-2.2.0+cu130torch2.9.1-cp311-cp311-win_amd64.whl"
    $sageWheelPath = Join-Path $env:TEMP $sageWheelName
    
    try {
        Write-Host "  다운로드 중: sageattention-2.2.0+cu130torch2.9.1-cp311-cp311-win_amd64.whl" -ForegroundColor Gray
        curl.exe -L -# -o $sageWheelPath $sageWheelUrl
        & $script:pipExe install $sageWheelPath
        Remove-Item $sageWheelPath -ErrorAction SilentlyContinue
        Write-Success "SageAttention 설치 완료"
    } catch {
        Write-Warning "SageAttention 설치 실패: $_"
        Write-Host "  수동 다운로드: $sageWheelUrl" -ForegroundColor Yellow
    }

    # insightface 설치 (IPAdapter FaceID에 필요)
    Write-Step "insightface 설치 중..."
    & $script:pipExe install insightface onnxruntime
    Write-Success "insightface 설치 완료"

    # custom_nodes 폴더 생성
    $customNodesPath = "custom_nodes"
    if (-not (Test-Path $customNodesPath)) {
        New-Item -ItemType Directory -Path $customNodesPath | Out-Null
    }
    Push-Location $customNodesPath

    # 커스텀 노드 설치 함수
    function Install-CustomNode {
        param(
            [string]$RepoUrl,
            [string]$NodeName
        )
        
        Write-Step "$NodeName 설치 중..."
        $folderName = $RepoUrl.Split('/')[-1]
        
        if (Test-Path $folderName) {
            Write-Warning "$NodeName 이미 설치됨, 업데이트 중..."
            Push-Location $folderName
            git pull
            Pop-Location
        } else {
            git clone $RepoUrl
        }
        
        # requirements.txt가 있으면 설치
        $reqPath = Join-Path $folderName "requirements.txt"
        if (Test-Path $reqPath) {
            Write-Host "  의존성 설치 중..." -ForegroundColor Gray
            & $script:pipExe install -r $reqPath
        }
        
        Write-Success "$NodeName 설치 완료"
    }

    # 커스텀 노드들 설치
    Install-CustomNode "https://github.com/cubiq/ComfyUI_IPAdapter_plus" "ComfyUI_IPAdapter_plus"
    Install-CustomNode "https://github.com/chrisgoringe/cg-use-everywhere" "cg-use-everywhere"
    Install-CustomNode "https://github.com/kijai/ComfyUI-KJNodes" "ComfyUI-KJNodes"

    Pop-Location  # custom_nodes에서 나오기

    # ============================================
    # 모델 파일 다운로드
    # ============================================
    if (-not $SkipModels) {
        Write-Step "모델 파일 다운로드 중..."
        
        # 모델 다운로드 함수
        function Download-Model {
            param(
                [string]$Url,
                [string]$DestFolder,
                [string]$FileName,
                [string]$DisplayName
            )
            
            $destPath = Join-Path "models" $DestFolder
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
            
            $filePath = Join-Path $destPath $FileName
            
            if (Test-Path $filePath) {
                Write-Warning "$DisplayName 이미 존재함: $FileName"
                return
            }
            
            Write-Host "  [>] $DisplayName 다운로드 중..." -ForegroundColor Gray
            Write-Host "     -> $DestFolder\$FileName" -ForegroundColor DarkGray
            
            try {
                curl.exe -L -# -o $filePath $Url
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "$DisplayName 다운로드 완료"
                } else {
                    throw "curl exit code: $LASTEXITCODE"
                }
            } catch {
                Write-Warning "$DisplayName 다운로드 실패: $_"
                Write-Host "     수동 다운로드: $Url" -ForegroundColor Yellow
            }
        }
        
        # IPAdapter 모델
        Download-Model `
            -Url "https://huggingface.co/nnnn1111/models-moved/resolve/main/noobIPAMARK1_mark1.safetensors" `
            -DestFolder "ipadapter" `
            -FileName "noobIPAMARK1_mark1.safetensors" `
            -DisplayName "IPAdapter SDXL 모델"
        
        # CLIP Vision 모델
        Download-Model `
            -Url "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/image_encoder/model.safetensors" `
            -DestFolder "clip_vision" `
            -FileName "CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors" `
            -DisplayName "CLIP Vision 모델"
        
        # RealESRGAN 업스케일러
        Download-Model `
            -Url "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth" `
            -DestFolder "upscale_models" `
            -FileName "RealESRGAN_x4plus_anime_6B.pth" `
            -DisplayName "RealESRGAN x4 Anime 업스케일러"
        
        # Stable Diffusion SDXL 체크포인트
        Download-Model `
            -Url "https://civitai.com/api/download/models/1761560?type=Model&format=SafeTensor&size=pruned&fp=fp16" `
            -DestFolder "checkpoints" `
            -FileName "waiIllustriousSDXL_v140.safetensors" `
            -DisplayName "SDXL 체크포인트"
        
        Write-Success "모델 다운로드 완료"
    } else {
        Write-Warning "모델 다운로드 건너뜀 (-SkipModels 옵션)"
    }

    # 실행 배치 파일 생성
    Write-Step "실행 스크립트 생성 중..."
    $runBatContent = "@echo off`r`ncd /d %~dp0`r`npython_embeded\python.exe main.py --preview-method auto %*`r`npause"
    Set-Content -Path "run_comfyui.bat" -Value $runBatContent -Encoding ASCII
    Write-Success "run_comfyui.bat 생성 완료 (실시간 프리뷰 활성화)"

    # 설치 완료 메시지
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "                    [+] 설치 완료!                             " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "설치된 항목:" -ForegroundColor White
    Write-Host "  - ComfyUI" -ForegroundColor White
    Write-Host "  - Python $PythonVersion Embedded (python_embeded 폴더)" -ForegroundColor White
    Write-Host "  - PyTorch (CUDA 12.6)" -ForegroundColor White
    Write-Host "  - triton-windows" -ForegroundColor White
    Write-Host "  - SageAttention-for-windows (자동 설치 시도)" -ForegroundColor White
    Write-Host "  - ComfyUI_IPAdapter_plus" -ForegroundColor White
    Write-Host "  - cg-use-everywhere" -ForegroundColor White
    Write-Host "  - ComfyUI-KJNodes" -ForegroundColor White
    Write-Host ""
    Write-Host "다운로드된 모델:" -ForegroundColor White
    Write-Host "  - models/ipadapter/ip-adapter_sdxl.safetensors" -ForegroundColor White
    Write-Host "  - models/clip_vision/CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors" -ForegroundColor White
    Write-Host "  - models/upscale_models/RealESRGAN_x4plus_anime_6B.pth" -ForegroundColor White
    Write-Host "  - models/checkpoints/sdxl_model.safetensors" -ForegroundColor White
    Write-Host ""
    Write-Host "실행 방법:" -ForegroundColor Cyan
    Write-Host "  방법 1: run_comfyui.bat 더블클릭" -ForegroundColor White
    Write-Host "  방법 2: cd $InstallPath; python_embeded\python.exe main.py" -ForegroundColor White
    Write-Host ""
    Write-Host "웹 UI: http://127.0.0.1:8188" -ForegroundColor Yellow

} finally {
    Pop-Location
}
