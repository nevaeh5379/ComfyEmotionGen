# ComfyEmotionGen 사용 설명서 (Created by GEMINI PRO 3.1)

ComfyEmotionGen은 **Prompt DSL(`.ceg` 문법)**을 활용하여 AI 이미지 생성용 프롬프트를 체계적으로 조합하고, ComfyUI 백엔드와 연동하여 대량의 이미지를 생성 및 큐레이션(분류/관리)할 수 있는 통합 환경입니다.

---

## 1. CEG 문법 가이드 (Prompt DSL)

에디터 좌측의 코드 창에 `.ceg` 문법을 작성하여 다양한 프롬프트 조합을 만들어낼 수 있습니다. 핵심은 **축(Axis)**을 정의하고, 이를 **조합(Combine)**하여 반복적인 프롬프트 작성을 자동화하는 것입니다.

### 1.1 변수 선언 (`{{set}}`)
코드 전반에서 공통으로 사용할 고정 값을 정의합니다.
```ceg
{{set character = "1girl, silver hair, blue eyes"}}
```
- 템플릿 하단에서 `{{character}}` 형태로 불러와서 사용합니다.

### 1.2 축 정의 (`{{axis}}`)
변화시킬 요소(예: 의상, 표정, 포즈 등)를 목록 형태로 정의합니다.
```ceg
{{axis outfit}}
  uniform : "school uniform, pleated skirt"
  casual  : "white hoodie, denim jeans"
  dress   : "elegant black evening dress"
{{/axis}}

{{axis emotion weighted}}
  happy   : "smiling, joyful" @ 5
  sad     : "crying, tears"   @ 1
{{/axis}}
```
- `식별자(key) : "프롬프트 내용"` 형태로 작성합니다.
- `weighted` 키워드를 붙이고 `@ 숫자`를 적으면 샘플링 시 가중치 확률을 부여할 수 있습니다.

### 1.3 조합 선언 (`{{combine}}`)
정의한 축들을 어떻게 조합할지 결정합니다. (카르테시안 곱)
```ceg
{{combine outfit * emotion}}
```
**옵션 추가 (샘플링 및 시드):**
```ceg
{{combine outfit * emotion : sample=5 seed=42}}
```
- `sample=5`: 전체 조합 중 무작위로 5개만 뽑습니다. (가중치 반영됨)
- `seed=42`: 난수 시드를 고정하여 매번 동일한 무작위 결과를 얻습니다.

### 1.4 조합 제외 (`{{exclude}}`)
문맥상 어울리지 않는 특정 조합을 생성 결과에서 뺍니다.
```ceg
{{exclude outfit=casual AND emotion=sad}}
```

### 1.5 템플릿 및 파일명 규칙 (`{{template}}`, `{{filename}}`)
ComfyUI로 전송될 최종 프롬프트 형태와 저장될 파일명을 정의합니다.
```ceg
{{template}}
  {{character}}, {{outfit}}, {{emotion}}, masterpiece, best quality
{{/template}}

{{filename}}
  char_{{outfit.key}}_{{emotion.key}}
{{/filename}}
```
- `{{축이름.key}}`를 사용하면 축에서 정의한 짧은 식별자(예: uniform, happy)를 파일명에 쓸 수 있습니다.
- 가중치 문법: `{{w:1.2:content}}` 라고 적으면 ComfyUI 규격인 `(content:1.2)` 로 자동 치환됩니다.

---

## 2. 프론트엔드 웹 UI 사용법

### 2.1 워크플로우 연동 (Workflow 탭)
1. ComfyUI에서 `Save (API format)`으로 저장한 워크플로우 JSON 파일을 불러옵니다.
2. 프롬프트가 들어갈 텍스트 노드(CLIP Text Encode) 값에 `{{input}}` 이라고 적어둡니다. (또는 positive, negative를 분리했다면 `{{positive}}`, `{{negative}}` 사용 가능)
3. ComfyEmotionGen이 이 자리표시자(Placeholder)를 찾아 CEG 코드로 생성된 프롬프트를 자동으로 주입(Inject)합니다.

### 2.2 코드 에디터 (Editor 탭)
- 좌측 에디터에 CEG 문법으로 코드를 작성합니다.
- 하단의 **[Run / Preview]** 버튼을 누르면 문법 오류를 검사하고, 우측 패널에 생성될 프롬프트 목록과 예상 파일명 리스트를 미리 보여줍니다.
- 오류가 있다면 에디터 하단에 붉은색 글씨로 에러 위치와 기대되는 문법이 한글로 안내됩니다.
- 확인 후 **[Submit Jobs]** 버튼을 누르면 백엔드(ComfyUI)로 실제 생성 요청을 보냅니다.

### 2.3 저장된 이미지 관리 (Gallery 탭)
생성된 이미지를 한눈에 확인하고 분류할 수 있는 핵심 기능입니다.

* **실시간 연동:** ComfyUI에서 이미지가 생성될 때마다 새로고침 없이 갤러리에 자동으로 이미지가 팝업됩니다.
* **상태 큐레이션 (Status):** 각 이미지의 썸네일 아래에 있는 버튼을 눌러 상태를 분류합니다.
  - `Pending`: 기본 상태 (분류 전)
  - `Keep` (초록색): 마음에 들어서 보관할 이미지
  - `Reject` (빨간색): 휴지통으로 보낼 이미지
* **필터링:** 상단의 필터 바를 이용해 상태별(Keep만 보기 등), 태그별, 혹은 파일명 별로 이미지를 검색할 수 있습니다.
* **태그 및 노트:** 이미지 클릭 시 세부 정보 창이 열리며, 사용자 지정 태그(`+`버튼)를 달거나 메모(Note)를 남길 수 있습니다.
* **부분 재성성 (Regenerate):** 특정 결과물이 아쉽다면, 해당 그룹(동일 파일명)을 선택한 뒤 **[Regenerate]** 버튼을 눌러 새로운 시드(Seed) 값으로 3장, 5장 등 원하는 개수만큼 다시 생성하도록 요청할 수 있습니다.
* **추출 (Export):** 큐레이션이 끝난 후 우측 상단의 **[Export Dataset]** 버튼을 누르면, 'Keep' 상태인 이미지들만 모아서 하나의 `.zip` 파일로 깔끔하게 다운로드할 수 있습니다.
