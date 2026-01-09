# ComfyEmotionGen

A professional desktop application designed to streamline the generation of character emotion sprites and assets using ComfyUI. It automates prompts, seeds, and IP-Adapter settings to create consistent character assets efficiently.

## OS Support
- **Windows**: Supported ✅
- **Linux**: Not supported yet ❌
- **macOS**: Not supported yet ❌

## Installation

### Simple Setup (Windows Only)
For a quick start, use the provided PowerShell script to install ComfyUI and necessary dependencies automatically.
```powershell
.\install_comfy.ps1
```

### Manual Setup
1.  **Prerequisites**:
    -   Python 3.10+ installed.
    -   **ComfyUI** must be running locally at `127.0.0.1:8188`.
2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## Usage

To start the application, simply run:
```cmd
.\start.bat
```
Or manually:
```bash
python gui_main.py
```

---

## Interface Guide

### Top Toolbar
The top toolbar provides quick access to main execution controls.
-   **Character**: Select or create a new character profile. Changes are auto-saved.
-   **Batch**: Number of images to generate per prompt combination.
-   **Seed**: Set specific seed for reproducibility or use `-1` (Dice icon) for random.
-   **EXECUTION**:
    -   `▶ Generate`: Generates all combinations defined in your prompts/tags.
    -   `⏹ Stop`: Interrupts the current generation queue.
    -   `🧪 Test`: Generates a SINGLE image using the first value of every tag. Does NOT save to gallery.
    -   `🎲 Quick`: Generates a SINGLE image using RANDOM values for every tag. Great for brainstorming.
-   **Language**: Toggle between Korean and English UI.

### Left Panel: Configuration
The configuration panel is divided into customizable tabs.

#### 1. Identity tab
Set the core identity of your character.
-   **Character Name**: Used for folder organization.
-   **Reference Image**: Upload an image here to use with IP-Adapter (for consistent face/style).
-   **Model**: Select your Stable Diffusion Checkpoint (SDXL/SD1.5) from ComfyUI.

#### 2. Reference Tab (IP-Adapter)
Fine-tune how the reference image influences generation.
-   **Weight**: How strongly to adhere to the reference image.
-   **FaceID v2**: Specific weight for facial identity preservation.
-   **Type**: Interpolation method (Linear, Ease In/Out, etc.).
-   **Models**: Select specific IPAdapter and CLIP Vision models.

#### 3. Prompting Tab
-   **Prompt Presets**: Save and load different prompt "styles" for the same character.
-   **Quality Prompt**: Global quality boosters (e.g., `masterpiece, best quality, 8k`).
-   **Subject Prompt**: The main description using **Tag Syntax** (see below).
-   **Style Prompt**: Artist or style-specific tags (e.g., `anime style, flat color`).
-   **Negative Prompt**: Tags to exclude.
-   **Syntax Highlighting & Autocomplete**: Supports Danbooru tags!

#### 4. Tags Tab
Define dynamic variables for your prompts.
-   **Tag List**: Create categories like `emotion`, `outfit`, `pose`.
-   **Values Table**: Add multiple options for each tag.
    -   *Example*: Tag `emotion` -> Values: `Happy` ("smile, open mouth"), `Sad` ("crying, tears").
-   **Import/Export**: Share your tag lists via JSON.

#### 5. Advanced Tab
-   **Samplers**: Choose primary and secondary samplers (e.g., `dpmpp_3m_sde`).
-   **Resolution**: Set base Width/Height.
-   **Upscale**: Set latent upscale factor.

#### 6. Queue Tab
-   View the status of pending and running jobs.
-   **Trash All**: clear the pending queue.

---

## Powerful Tag Syntax
Use standard Handlebars-style syntax in your **Subject Prompt** to create dynamic workflows.

### 1. Simple Variables `{{tag}}`
Replaces the tag with EVERY value you defined for it, creating multiple images.
> Prompt: `1girl, {{emotion}}`
> Result: Generates 1 image for "Happy", 1 for "Sad", etc.

### 2. Optional Tags `{{?tag}}`
Use for elements that might not always be present.
> Prompt: `1girl, {{?outfit}}`

### 3. Conditional Logic `{{$if ...}}`
Add tags only if another tag has a certain value (or just exists).
> Prompt: `{{$if emotion=Happy}}sparkles, flowers{{$endif}}`

---

## Gallery
The **Gallery** tab allows you to manage your generated assets.
-   **Smart Filtering**: Filter by Character, or group by Emotion/Seed.
-   **Favorites**: Mark your best generations and use "Download Favs" to copy them all to a clean folder.
-   **Metadata**: Click any image to see full generation data (Seed, Prompt, Model).
-   **Drag & Drop**: Drag images directly from the app to Windows Explorer or Photoshop.

---
---

# ComfyEmotionGen (한국어)

ComfyUI를 활용하여 캐릭터 감정 표현 스프라이트 및 리소스를 효율적으로 생성할 수 있도록 설계된 전문 데스크톱 애플리케이션입니다. 프롬프트, 시드, IP-Adapter 설정을 자동화하여 일관된 캐릭터 리소스를 손쉽게 제작할 수 있습니다.

## OS 지원
- **Windows**: 지원됨 ✅
- **Linux**: 미지원 ❌
- **macOS**: 미지원 ❌

## 설치 방법

### 간편 설치 (Windows 전용)
빠른 시작을 위해 제공된 PowerShell 스크립트를 사용하여 ComfyUI 및 필요한 의존성을 자동으로 설치할 수 있습니다.
```powershell
.\install_comfy.ps1
```

### 수동 설치 (고급)
1.  **필수 사항**:
    -   Python 3.10 이상 설치.
    -   **ComfyUI**가 로컬(`127.0.0.1:8188`)에서 실행 중이어야 합니다.
2.  **의존성 설치**:
    ```bash
    pip install -r requirements.txt
    ```

## 사용 방법

애플리케이션을 시작하려면 `start.bat` 파일을 실행하세요:
```cmd
.\start.bat
```
또는 수동으로 실행:
```bash
python gui_main.py
```

---

## 인터페이스 가이드

### 상단 툴바 (Top Toolbar)
주요 실행 제어 기능에 빠르게 접근할 수 있습니다.
-   **Character**: 캐릭터 프로필을 선택하거나 새로 생성합니다. 변경 사항은 자동 저장됩니다.
-   **Batch**: 프롬프트 조합당 생성할 이미지 수입니다.
-   **Seed**: 재현성을 위해 특정 시드를 설정하거나 `-1`(주사위 아이콘)을 사용하여 랜덤 시드를 사용합니다.
-   **실행 제어 (EXECUTION)**:
    -   `▶ Generate`: 설정된 모든 프롬프트/태그 조합을 생성합니다.
    -   `⏹ Stop`: 현재 대기열에 있는 작업을 중단합니다.
    -   `🧪 Test`: 모든 태그의 **첫 번째 값**만을 사용하여 1장의 이미지를 생성합니다. 갤러리에 저장되지 않습니다.
    -   `🎲 Quick`: 모든 태그의 **랜덤 값**을 사용하여 1장의 이미지를 생성합니다. 아이디어 브레인스토밍에 유용합니다.
-   **Language**: UI 언어를 한국어/영어로 전환합니다.

### 왼쪽 패널: 설정 (Configuration)
각 설정 탭에서 세부 사항을 조정할 수 있습니다.

#### 1. Identity (기본 정보)
캐릭터의 핵심 정보를 설정합니다.
-   **Character Name**: 폴더 정리 및 파일명에 사용됩니다.
-   **Reference Image**: IP-Adapter와 함께 사용할 참조 이미지를 업로드합니다 (일관된 얼굴/스타일 유지용).
-   **Model**: ComfyUI에 설치된 Stable Diffusion 체크포인트(SDXL/SD1.5)를 선택합니다.

#### 2. Reference (IP-Adapter)
참조 이미지가 생성에 미치는 영향을 세밀하게 조정합니다.
-   **Weight**: 참조 이미지를 얼마나 강하게 반영할지 설정합니다.
-   **FaceID v2**: 얼굴 유사도(Identity) 보존 강도를 설정합니다.
-   **Type**: 보간 방식(Linear, Ease In/Out 등)을 선택합니다.
-   **Models**: 사용할 특정 IPAdapter 및 CLIP Vision 모델을 선택합니다.

#### 3. Prompting (프롬프트)
-   **Prompt Presets**: 동일 캐릭터에 대한 다양한 프롬프트 스타일을 저장하고 불러옵니다.
-   **Quality Prompt**: 전체적인 퀄리티 향상 키워드 (예: `masterpiece, best quality, 8k`).
-   **Subject Prompt**: **태그 문법**을 사용한 메인 묘사 (아래 설명 참조).
-   **Style Prompt**: 화풍이나 아티스트 태그 (예: `anime style, flat color`).
-   **Negative Prompt**: 제외할 요소들.
-   **Syntax Highlighting & Autocomplete**: Danbooru 태그 자동 완성을 지원합니다!

#### 4. Tags (태그 관리)
프롬프트에 사용할 동적 변수를 정의합니다.
-   **Tag List**: `emotion`, `outfit`, `pose`와 같은 카테고리를 생성합니다.
-   **Values Table**: 각 태그에 대한 여러 옵션을 추가합니다.
    -   *예시*: 태그 `emotion` -> 값: `Happy` ("smile, open mouth"), `Sad` ("crying, tears").
-   **Import/Export**: 태그 목록을 JSON 파일로 공유할 수 있습니다.

#### 5. Advanced (고급 설정)
-   **Samplers**: 1차 및 2차 샘플러를 선택합니다 (예: `dpmpp_3m_sde`).
-   **Resolution**: 기본 해상도(Width/Height)를 설정합니다.
-   **Upscale**: Latent 업스케일 배율을 설정합니다.

#### 6. Queue (대기열)
-   대기 중이거나 실행 중인 작업의 상태를 확인합니다.
-   **Trash All**: 대기열을 모두 비웁니다.

---

## 강력한 태그 문법 (Tag Syntax)
**Subject Prompt**에서 Handlebars 스타일의 문법을 사용하여 동적인 워크플로우를 만들 수 있습니다.

### 1. 단순 변수 `{{tag}}`
해당 태그에 정의된 **모든 값**으로 순차적으로 대체하여 여러 장의 이미지를 생성합니다.
> 입력: `1girl, {{emotion}}`
> 결과: "Happy"로 1장, "Sad"로 1장... 씩 생성.

### 2. 선택적 태그 `{{?tag}}`
해당 요소가 있을 수도 있고 없을 수도 있는 경우 사용합니다.
> 입력: `1girl, {{?outfit}}`

### 3. 조건부 로직 `{{$if ...}}`
특정 태그가 특정 값을 가질 때만(또는 존재할 때만) 추가 태그를 적용합니다.
> 입력: `{{$if emotion=Happy}}sparkles, flowers{{$endif}}`

---

## 갤러리 (Gallery)
생성된 리소스를 관리하는 탭입니다.
-   **스마트 필터링**: 캐릭터별 보기, 감정/시드별 그룹화 기능을 제공합니다.
-   **즐겨찾기 (Favorites)**: 마음에 드는 결과물을 즐겨찾기하고 "Download Favs"로 한 번에 모아서 저장할 수 있습니다.
-   **메타데이터**: 이미지를 클릭하면 생성 정보(시드, 프롬프트, 모델 등)를 확인할 수 있습니다.
-   **Drag & Drop**: 앱에서 Windows 탐색기나 포토샵으로 이미지를 직접 드래그하여 사용할 수 있습니다.
