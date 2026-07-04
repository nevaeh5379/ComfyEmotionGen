# ComfyEmotionGen

## 빠른 시작
### Docker
- 일반: `docker run -p 6974:6974 -p 5882:5882 ghcr.io/nevaeh5379/comfyemotiongen:webui`
- 개발버전: `docker run -p 6974:6974 -p 5882:5882 ghcr.io/nevaeh5379/comfyemotiongen:webui-dev`

도커 실행 후 http://localhost:6974 접속하기

#### 직접 docker 빌드하기
```bash
git clone https://github.com/nevaeh5379/ComfyEmotionGen.git
cd ComfyEmotionGen && docker compose up -d
```

도커 실행 후 http://localhost:6974 접속하기


### 직접 빌드하기
권장 버전:
- Python 3.14
- node.js v26.2.0+

#### Linux / MacOS
```bash
git clone https://github.com/nevaeh5379/ComfyEmotionGen.git
cd ComfyEmotionGen
chmod +x ./install.sh ./run.sh
./install.sh
./run.sh
```
http://localhost:6974 접속하기

## 선택 기능: 이미지 편집기 객체 제거 (LaMa)

갤러리/큐레이션 탭의 이미지 카드 메뉴에서 "이미지 편집"으로 GIMP급 편집기(선택 도구, 복제/치유 브러시, 자르기, 색보정, 레이어)를 사용할 수 있습니다. 객체 제거 도구는 백엔드 LaMa 모델을 사용하며, 이는 **선택적 의존성**입니다 — LaMa가 없어도 편집기 나머지 도구는 정상 동작합니다.

### LaMa 설치 (객체 제거 활성화)

```bash
cd backend
# CPU 환경
pip install -r requirements-inpaint.txt

# CUDA(GPU) 환경
pip install -r requirements-inpaint.txt --index-url https://download.pytorch.org/whl/cu121
```

첫 객체 제거 실행 시 LaMa 모델(~200MB)을 `~/.cache/torch/hub`에 다운로드합니다.

### 환경변수

- `CEG_LAMA_DEVICE`: `cpu` (기본) | `cuda` — LaMa 추론 장치

### 동작 확인

- `GET /inpaint/capabilities` → `{ enabled: true, device: "cuda" }` 이면 활성화됨
- 편집기의 "객체 제거" 도구가 비활성화되어 있으면 백엔드에 LaMa 의존성이 설치되지 않은 것입니다.

#### Windows
```ps1
git clone https://github.com/nevaeh5379/ComfyEmotionGen.git
cd ComfyEmotionGen; ./install.ps1; ./run.ps1
```
http://localhost:6974 접속하기
