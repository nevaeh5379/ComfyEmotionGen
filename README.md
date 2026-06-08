# ComfyEmotionGen

## 빠른 시작
### docker
- 일반: ```docker run -p 6974:6974 -p 5882:5882 ghcr.io/nevaeh5379/comfyemotiongen:webui```
- 개발버전: ```docker run -p 6974:6974 -p 5882:5882 ghcr.io/nevaeh5379/comfyemotiongen:webui-dev```

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

#### Windows
```ps1
git clone https://github.com/nevaeh5379/ComfyEmotionGen.git
cd ComfyEmotionGen &&./install.ps1 &&./run.ps1
```
http://localhost:6974 접속하기
