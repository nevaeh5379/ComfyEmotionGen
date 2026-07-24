# CEG 문법 가이드

`.ceg` 파일은 **한 번에 여러 장의 AI 이미지 프롬프트를 자동으로 만들어주는 템플릿**입니다.
"의상 4종 × 표정 4종 × 포즈 2종 = 32장" 같은 조합을 손으로 적지 않고, **축(axis)** 으로 선언하면 자동으로 펼쳐줍니다.

이 문서는 **CEG를 처음 쓰는 사람**부터 **고급 조합 최적화를 원하는 전문가**까지 모두를 위한 종합 Wiki 가이드입니다.

---

## 한눈에 보는 예시

먼저 완전한 예시부터 봅시다. 이게 CEG의 전부입니다.

```jinja
{{# 캐릭터 에셋 생성 #}}

{{set character = "1girl, silver hair, blue eyes"}}
{{set quality   = "masterpiece, best quality"}}

{{axis outfit}}
  uniform  : "school uniform, pleated skirt"
  casual   : "hoodie, jeans"
  dress    : "elegant black dress"
{{/axis}}

{{axis emotion}}
  happy : "smiling, cheerful"
  sad   : "teary eyes, frowning"
{{/axis}}

{{combine outfit * emotion}}

{{template}}
{{quality}}, {{character}}, {{outfit}}, {{emotion}}
{{/template}}

{{filename}}char_{{outfit.key}}_{{emotion.key}}{{/filename}}
```

이 파일은 **6장의 프롬프트**(3 × 2)를 만들어냅니다.
예시:
- `char_uniform_happy` → `masterpiece, best quality, 1girl, silver hair, blue eyes, school uniform, pleated skirt, smiling, cheerful`
- `char_uniform_sad` → ...
- `char_casual_happy` → ...
- ... (총 6장)

---

## CEG 파일은 6개의 부품으로 이루어집니다

| 부품 | 역할 | 예시 |
|---|---|---|
| 주석 | 메모. 결과에 안 들어감 | `{{# 메모 #}}` |
| `{{set}}` | 변수 정의 및 환경 설정 | `{{set quality = "..."}}` <br> `{{set clean_filename = "true"}}` |
| `{{axis}}` | 변동 축 정의 (의상, 표정 같은 묶음) | `{{axis outfit}} ... {{/axis}}` <br> `{{axis emotion?}} ... {{/axis}}` |
| `{{combine}}` | 어떤 축들을 어떻게 조합할지 결정 | `{{combine outfit * emotion}}` |
| `{{template}}` | 프롬프트 모양 | `{{template}} ... {{/template}}` |
| `{{filename}}` | 출력 파일명 모양 | `{{filename}} ... {{/filename}}` |
| `{{exclude}}` | 원치 않는 조합 제거 (선택) | `{{exclude a=x AND b=y}}` |

순서는 자유지만, 위에서 아래로 적으면 읽기 좋습니다.

---

## 1. 주석 — 메모를 남기고 싶을 때

```jinja
{{# 이건 한 줄 메모 #}}

{{#
  여러 줄도
  가능합니다
#}}
```

`{{#`과 `#}}` 사이는 결과에 들어가지 않습니다. 자유롭게 메모하세요.
*(주의: 주석 텍스트 본문 내부에 `#}}` 문자열이 들어가면 주석이 조기에 닫혀 문법 에러가 발생할 수 있습니다.)*

---

## 2. 변수 — 같은 문구를 여러 번 쓸 때

자주 반복되는 문구(품질 태그, 캐릭터 설명)는 변수로 빼두면 편리하며, 컴파일러 제어 옵션도 여기서 설정합니다.

```jinja
{{set quality   = "masterpiece, best quality, highly detailed"}}
{{set character = "1girl, silver hair, blue eyes"}}

{{# 파일명 자동 다듬기 옵션 (기본값 true) #}}
{{set clean_filename = "true"}}
```

`{{template}}` 안에서 `{{quality}}`, `{{character}}`로 꺼내 씁니다.

**주의할 점**
- 값은 반드시 큰따옴표 `"..."`로 감싸야 합니다.
- 변수명, 축명, 속성명에는 영문/숫자/언더스코어(`_`)를 사용할 수 있습니다. (`character_sdxl` ✅, `base_quality` ✅)
- 변수 이름과 축 이름은 겹치면 안 됩니다 (동일한 네임스페이스를 공유하여 충돌 발생).

**파일명 자동 정제 (`clean_filename = "true"`)**
- 선택적 축(후술)이나 특정 조건으로 인해 파일명 템플릿의 특정 축 키가 빈 값(`""`)이 되는 경우, `teto__happy`나 `teto_casual_`처럼 언더바가 중첩되거나 끝에 매달려 남는 지저분한 파일명을 `teto_happy`, `teto_casual` 형태로 자동으로 다듬어 줍니다.

---

## 3. 축 — 변동의 묶음을 정의할 때

축(axis)은 **이 차원에서 이런 값들이 가능하다**를 선언하는 부분입니다.

```jinja
{{axis outfit}}
  uniform  : "school uniform, pleated skirt"
  casual   : "hoodie, jeans, sneakers"
  dress    : "elegant black dress"
{{/axis}}
```

- 왼쪽 `uniform`은 **내부 키(key)** — 제외 규칙이나 UI 필터에 쓰입니다. (짧고 명확하게 지정하는 것이 좋습니다.)
- 오른쪽 `"..."`은 **프롬프트에 들어갈 실제 텍스트**입니다.

파일명에 노출되는 키를 내부 키와 다르게 쓰고 싶으면 `as "..."`를 붙입니다.

```jinja
{{axis pose}}
  hello_world as "hello-world" : "hello world pose"
  full_body   as "full-body"   : "full body shot"
{{/axis}}
```

- `{{pose.key}}` → `hello-world`
- `{{pose}}` → `hello world pose`
- `{{exclude pose = hello_world}}`처럼 제외 규칙은 내부 키(`hello_world`)를 기준으로 비교합니다.

### 3-1. 같은 문구가 모든 항목에 들어가야 할 때 — `include`

축 안의 모든 항목 끝에 같은 문구를 붙이고 싶다면 `include` 속성을 씁니다.

```jinja
{{axis positions include="full body shot"}}
  standing : "standing pose"
  sitting  : "sitting on chair"
{{/axis}}
```

→ `"standing pose, full body shot"`, `"sitting on chair, full body shot"` 로 펼쳐집니다.

### 3-2. 항목을 여러 속성(Property)으로 쪼개기

옷의 '상의'와 '하의' 혹은 의상에 맞는 구도나 분위기를 다르게 매칭하고 싶다면 딕셔너리(`{...}`) 구조를 씁니다.

```jinja
{{axis outfit}}
  uniform : { top: "white shirt", bottom: "pleated skirt", mood: "smiling" }
  casual  : { top: "hoodie", bottom: "jeans", mood: "neutral" }
{{/axis}}
```

이렇게 정의하면 템플릿에서 각각의 하위 속성을 꺼내 쓸 수 있습니다.
- `{{outfit}}` → 모든 값을 콤마로 연결 (`"white shirt, pleated skirt, smiling"`)
- `{{outfit.top}}` → `"white shirt"`
- `{{outfit.bottom}}` → `"pleated skirt"`
- `{{outfit.mood}}` → `"smiling"`

### 3-3. 특정 요소가 생략된 기본형 분기를 만들고 싶을 때 — `?` (선택적 축)

기존에는 표정이 없는 기본형이나 도구가 없는 기본형을 만들기 위해 `none: ""`과 같은 빈 항목을 축에 수동으로 선언해야 했습니다. 이 방식은 파일명에 `_none` 등이 남아 지저분해지는 원인이 되었습니다.

축 이름 뒤에 물음표(`?`)를 붙이면, 컴파일러가 자동으로 **해당 축의 값이 주입되지 않은 '생략된 기본 상태'**를 분기에 추가해 줍니다.

```jinja
{{axis emotion?}}
  happy : "smiling face"
  angry : "angry expression"
{{/axis}}
```

→ 조합(combine) 실행 시 `happy`, `angry` 뿐만 아니라 **'아무 표정도 적히지 않은 기본형'**까지 총 3가지 시나리오가 펼쳐집니다. 
- 표정 생략 상태에서는 템플릿의 `{{emotion}}`과 파일명의 `{{emotion.key}}`가 빈 문자열(`""`)로 대치되며, `clean_filename` 설정에 의해 파일명이 매우 깔끔하게 정리됩니다.

---

## 4. 조합 — 축들을 어떻게 곱할지 결정할 때

이 부분이 CEG의 핵심입니다. `{{combine}}` 하나가 **몇 장의 이미지가 생성될지**를 최종 결정합니다.

### 4-1. 가장 기본: 모든 조합 — `*`

```jinja
{{combine outfit * emotion * pose}}
```

→ outfit 3종 × emotion 4종 × pose 2종 = **24장**의 Cartesian Product(데카르트 곱) 조합을 생성합니다.

### 4-2. 서로 다른 시나리오 묶음의 병렬 연결 — `+`

모든 축을 전부 무지성으로 곱하면 경우의 수가 기하급수적으로 폭발합니다. 특정 의도된 조합군들만 병렬로 나열하여 합치고 싶을 때 `+` 연산자를 사용합니다.

```jinja
{{combine (outfit * emotion) + (outfit * pose)}}
```

→ "의상 × 표정" 조합(A 묶음)과 "의상 × 포즈" 조합(B 묶음)이 단일 목록에 나란히 병렬 합산되어 출력됩니다.

### 4-3. 조합 결과를 이름 하나로 묶기 — 별칭 (Alias)

```jinja
{{combine c = outfit * emotion * pose}}

{{template}}
{{c}}
{{/template}}

{{filename}}char_{{c.key}}{{/filename}}
```

- `{{c}}` → 조합에 참여한 모든 축의 실제 프롬프트 값을 쉼표(`, `)로 연결하여 출력합니다.
- `{{c.key}}` → 조합에 참여한 모든 축의 파일명 키를 언더바(`_`)로 연결하여 출력합니다. (예: `uniform_happy_standing`)
축의 수가 3~4개 이상으로 많아질 때 템플릿 본문을 획기적으로 축소할 수 있습니다.

### 4-4. 축의 값은 프롬프트에 넣되, 파일명 키에는 숨기기 — `~` (Hide Key)

조합 분기에는 명확히 포함되어 이미지에는 묘사되어야 하지만, 출력 파일명에는 해당 키가 포함되지 않기를 바라는 축(예: 시간대, 특정 배경 장소 등)이 있다면 축 이름 앞에 물결(`~`)을 붙입니다.

```jinja
{{combine outfit * ~timeofday}}
```

→ `timeofday`의 텍스트 값은 템플릿 프롬프트에 들어가지만, 파일명 생성 시 `{{timeofday.key}}` 호출부나 별칭 키 연산에서 빈 문자열(`""`)로 자동 차단 및 은닉되어 파일 이름이 복잡해지는 것을 막아줍니다.

### 4-5. 고정 문구 끼워 넣기

```jinja
{{combine outfit * emotion * "detailed background, soft lighting"}}
```

조합식 내부에서 큰따옴표로 묶인 원시 문자열 리터럴을 직접 곱하면 모든 조합의 값 목록 뒤에 해당 텍스트가 강제 병합됩니다.

### 4-6. `*`와 `+` 섞을 때의 연산자 우선순위

곱셈(`*`)이 덧셈(`+`)보다 항상 먼저 결합됩니다. 결합 순서를 다르게 제어해야 하는 경우에는 반드시 수학식처럼 소괄호 `(...)`를 씌워주어야 합니다.

```jinja
{{combine a * (b + c)}}     {{# a × b 조합군 및 a × c 조합군 병렬 생성 #}}
{{combine (a * b) + c}}     {{# a × b 조합군에 단독 c 조건군 추가 생성 #}}
```

---

## 5. 제외 — 원치 않는 조합 빼기

"잠옷 + 해변 야외 촬영" 혹은 "비키니 + 눈밭 촬영"처럼 물리적으로 모순되거나 불필요한 조합을 차단하여 이미지 생성 서버의 자원 낭비를 원천 차단합니다. 

`AND`, `OR`, `in`, `not in` 연산자를 활용하여 자유도 높은 복합 조건을 정의할 수 있습니다.

```jinja
{{# 1. 일치하는 단일 조건 제외 #}}
{{exclude outfit = swimsuit AND emotion = angry}}

{{# 2. 여러 조건 중 하나라도 만족(OR)하거나 리스트 범위 검사(in, not in)를 사용할 때 #}}
{{exclude outfit in [swimsuit, pajamas] AND location not in [bedroom, bathroom]}}
```

**제외 규칙 세부 사항**
- 조건 비교 대상(`swimsuit`, `pajamas`)은 항상 축에 정의된 **키(key)** 문자열을 기준으로 합니다 (프롬프트 값 기준이 아님).
- 한 `.ceg` 파일 내부에 여러 줄의 `{{exclude}}` 문을 적으면, 각 조건문 중 **단 하나라도 만족(OR)**하는 조합이 발생하는 즉시 배제됩니다.

---

## 6. 템플릿 — 최종 프롬프트의 모양

각 조합 루프가 돌 때마다 이 본문에 치환된 최종 텍스트가 대입되어 한 장의 이미지 생성 프롬프트가 완성됩니다.

```jinja
{{template}}
{{quality}}, {{character}},
{{outfit}}, {{emotion}}, {{pose}},
detailed background
{{/template}}
```

### 치환 태그 스펙
| 태그 형태 | 대치되는 실제 값 | 예시 |
|---|---|---|
| `{{variable}}` | `{{set}}`으로 설정한 일반 변수의 값 | `masterpiece, best quality` |
| `{{axis_name}}` | 현재 루프에서 선택된 축의 프롬프트 텍스트 전체 | `school uniform, pleated skirt` |
| `{{axis_name.key}}` | 현재 루프에서 선택된 축의 파일명 키 (`as`가 없으면 내부 키와 동일) | `uniform` |
| `{{axis_name.prop}}` | 축을 딕셔너리로 쪼개 정의했을 때 지정한 특정 속성명 | `school uniform` |

### 공백 및 문장 부호 자동 보정
템플릿 본문을 작성할 때 가독성을 위해 여러 줄로 쓰거나 들여쓰기를 적용해도 컴파일 렌더러가 내부적으로 **모든 줄바꿈, 연속된 띄어쓰기, 어색하게 중첩된 콤마(`,,` 또는 `, , `)**를 인공지능 프롬프트 형식에 맞춰 한 줄의 정갈한 텍스트로 보정하고 양 끝 단을 깔끔히 트림(Trim)해 줍니다.

---

## 7. 파일명 — 저장될 이름의 모양

출력될 이미지 파일의 물리적 저장 파일명 규칙을 정의합니다. `{{template}}`과 완전히 동일한 치환 메커니즘을 사용합니다.

```jinja
{{filename}}char_{{outfit.key}}_{{emotion.key}}_{{pose.key}}{{/filename}}
```
→ `char_uniform_happy_standing`

**주의할 점**
- 파일 이름에는 공백, 쉼표(`,`) 등이 포함되면 시스템 오류가 발생하거나 저장 시 문제가 생깁니다. 따라서 파일명 본문에는 텍스트 값 자체를 나타내는 `{{outfit}}` 대신 파일명 키를 가리키는 **`{{outfit.key}}`**를 사용하는 것이 가장 안전한 표준 패턴입니다.

---

## 8. 실전 예제 패키지 (Kasane Teto 테마)

이해를 돕기 위해, 보컬로이드 캐릭터 **Kasane Teto(카사네 테토)**의 SDXL 프롬프트 및 의상 3종(기본 군복풍 의상, 비키니, 잠옷)을 소재로 작성된 점진적 난이도의 6가지 실전 예제 파일 패키지입니다. 

실제 로컬 프로젝트의 `examples/ceg/` 폴더에 배포되어 있으며 즉시 빌드가 가능합니다.

### 8-1. 기초 변수와 단일 템플릿
*파일 위치: `examples/ceg/01_basic_template.ceg`*

어떠한 축 조합도 돌리지 않고, 고정 변수 선언과 간단한 치환만 수행하는 가장 기초적인 구조입니다.

```jinja
{{#
  CEG 기초 템플릿 예제
  가장 기본적인 변수 설정({{set}}), 주석 작성법, 템플릿 치환({{template}}), 파일명 지정({{filename}})을 배웁니다.
#}}

{{# 캐릭터 고유 외모 태그를 전역 변수로 정의합니다. #}}
{{set character = "1girl, kasane teto, red hair, twin drills, red eyes"}}
{{set base_quality = "masterpiece, best quality, highly detailed"}}

{{# 프롬프트 템플릿 변환 정의 #}}
{{template}}
{{character}}, {{base_quality}}, smiling, looking at viewer
{{/template}}

{{# 파일명 지정 #}}
{{filename}}
kasane_teto_basic
{{/filename}}
```
- **조합 총합**: 1개
- **출력 프롬프트**: `1girl, kasane teto, red hair, twin drills, red eyes, masterpiece, best quality, highly detailed, smiling, looking at viewer`
- **출력 파일명**: `kasane_teto_basic`

---

### 8-2. 기본 축 선언과 조합
*파일 위치: `examples/ceg/02_simple_axis.ceg`*

의상 3종을 독립된 축(`{{axis outfit}}`)으로 정의하여 총 3개의 프롬프트를 루프를 돌며 자동으로 전개합니다.

```jinja
{{#
  CEG 기초 조합 예제
  의상 종류를 적용하여 총 3개의 프롬프트를 자동 생성합니다.
#}}

{{set character = "1girl, kasane teto, red hair, twin drills, red eyes"}}
{{set base_quality = "masterpiece, best quality, highly detailed"}}

{{# 의상 종류 축 정의 #}}
{{axis outfit}}
  default : "military-style mechanical outfit, thigh-high boots, arm warmers"
  bikini : "red halterneck bikini, swim ring, beach side"
  pajamas : "cute pink oversized pajamas, fluffy slippers, bedroom"
{{/axis}}

{{# 활성화할 축 선언 #}}
{{combine outfit}}

{{template}}
{{character}}, {{base_quality}}, {{outfit}}, standing, full body
{{/template}}

{{filename}}
teto_{{outfit.key}}
{{/filename}}
```
- **조합 총합**: 3개
- **생성 목록**:
  1. 파일명 `teto_default` / 프롬프트 `... red eyes, masterpiece, ..., military-style mechanical outfit, thigh-high boots, arm warmers, standing, full body`
  2. 파일명 `teto_bikini` / 프롬프트 `... red halterneck bikini, swim ring, beach side, standing, full body`
  3. 파일명 `teto_pajamas` / 프롬프트 `... cute pink oversized pajamas, fluffy slippers, bedroom, standing, full body`

---

### 8-3. 구조화된 속성(Property) 및 Include 활용
*파일 위치: `examples/ceg/03_structured_axis.ceg`*

단순 문자열 나열을 넘어 중괄호 `{}` 구조를 이용해 옷 스타일(`clothes`), 앵글 구도(`shot`), 분위기 표정(`mood`)을 상세 분배하고 캐릭터 외형 속성을 한 번에 공통화(`include`)하여 반복 노가다를 제거하는 고급 패턴입니다.

```jinja
{{#
  CEG 구조화된 축 및 include 예제
#}}

{{set character = "1girl, kasane teto"}}
{{set base_quality = "masterpiece, best quality"}}

{{# 옷 속성 분리 정의 및 카사네 테토의 고유 머리모양을 include로 강제 배포 #}}
{{axis outfit include="red hair, twin drills, red eyes"}}
  default : { clothes: "military mechanical outfit", shot: "full body", mood: "proud" }
  bikini : { clothes: "red halterneck bikini", shot: "cowboy shot", mood: "playful" }
  pajamas : { clothes: "pink oversized pajamas", shot: "upper body", mood: "sleepy" }
{{/axis}}

{{combine outfit}}

{{# 각각의 쪼개진 속성들은 점(.) 연산자로 원하는 프롬프트 구간에 직접 배치합니다 #}}
{{template}}
{{character}}, {{base_quality}}, wearing {{outfit.clothes}}, {{outfit.shot}}, looking at viewer, expression is {{outfit.mood}}
{{/template}}

{{filename}}
teto_structured_{{outfit.key}}
{{/filename}}
```
- **조합 총합**: 3개
- **생성 예시 (default)**:
  - 파일명: `teto_structured_default`
  - 프롬프트: `1girl, kasane teto, masterpiece, best quality, wearing military mechanical outfit, full body, looking at viewer, expression is proud`
- **include 동작의 강점**: 만약 개별 속성 대신 전체 대입문 `{{outfit}}`을 템플릿에 사용할 시 모든 속성 값에 머리 스타일 태그인 `red hair, twin drills, red eyes`가 자동 병합되어 전개됩니다.

---

### 8-4. 선택적 축(`?`)과 자동 파일명 정제
*파일 위치: `examples/ceg/04_optional_axis.ceg`*

축 이름 뒤에 물음표(`?`)를 달아 "특정 연출이 가미되지 않은 순수 기본 상태"를 경우의 수에 포함하는 방법과, 생략 시 발생하는 파일명의 여백을 매끄럽게 보정하는 실무 형태입니다.

```jinja
{{#
  선택적 축 및 파일명 자동 정밀 다듬기 예제
#}}

{{set character = "1girl, kasane teto, red hair, twin drills, red eyes"}}
{{set base_quality = "masterpiece, best quality, highly detailed"}}

{{# 파일 정밀 정제 켬 #}}
{{set clean_filename = "true"}}

{{axis outfit}}
  default : "military mechanical outfit"
  bikini : "red halterneck bikini"
  pajamas : "pink oversized pajamas"
{{/axis}}

{{# 표정(emotion) 뒤에 ?를 붙여 표정 미지정(생략) 시나리오 포함 #}}
{{axis emotion?}}
  happy : "cheerful smile, laughing"
  angry : "angry expression, annoyed pout"
{{/axis}}

{{# 의상 3종 * 표정 3종 (happy, angry, 생략) = 총 9장 #}}
{{combine outfit * emotion}}

{{template}}
{{character}}, {{base_quality}}, {{outfit}}, {{emotion}}
{{/template}}

{{filename}}
teto_{{outfit.key}}_{{emotion.key}}_shot
{{/filename}}
```
- **조합 총합**: 3 × 3 = 9개
- **생성 예시 (bikini + 표정 생략)**:
  - 파일명: `teto_bikini_shot` *(원래 `teto_bikini__shot`으로 콤마가 깨져야 하는 것이 clean_filename에 의해 언더바가 하나로 축소 보정됨)*
  - 프롬프트: `1girl, kasane teto, red hair, twin drills, red eyes, masterpiece, best quality, highly detailed, red halterneck bikini` *(표정이 적혀야 하는 맨 끝자리가 빈칸으로 매끄럽게 정리됨)*

---

### 8-5. 시나리오 합산(`+`) 및 파일 키 감추기(`~`)
*파일 위치: `examples/ceg/05_expression_operators.ceg`*

조합 공간의 불필요한 곱셈 팽창을 막고 원하는 핵심 흐름만 한 파일에 덧대고 병렬로 뽑아내며, 무의미한 요소를 파일 이름 목록에서 완벽히 소거하여 관리 효율을 올리는 최고 난이도의 최적화 방법입니다.

```jinja
{{#
  CEG 조합 표현식 수식 기법 예제
#}}

{{set character = "1girl, kasane teto, red hair, twin drills, red eyes"}}
{{set base_quality = "masterpiece, best quality, highly detailed"}}

{{axis outfit}}
  default : "military mechanical outfit"
  bikini : "red halterneck bikini"
  pajamas : "pink oversized pajamas"
{{/axis}}

{{axis emotion}}
  happy : "smiling face"
  angry : "angry expression"
{{/axis}}

{{axis timeofday}}
  day : "bright sunny day, outdoor"
  night : "moonlit night, dark indoor"
{{/axis}}

{{#
  1. (outfit * emotion) -> 의상과 표정 매칭 6개 시나리오 생성
  2. (outfit * ~timeofday) -> 의상과 시간대 매칭 6개 시나리오 생성 (단, 시간대 키는 파일 이름에서 숨김)
  3. 이 둘을 + 로 합산하여 총 12개의 조합을 동시에 병렬 출력합니다.
#}}
{{combine (outfit * emotion) + (outfit * ~timeofday)}}

{{template}}
{{character}}, {{base_quality}}, {{outfit}}, {{emotion}}, {{timeofday}}
{{/template}}

{{filename}}
teto_expr_{{outfit.key}}_{{emotion.key}}_{{timeofday.key}}
{{/filename}}
```
- **조합 총합**: 6 + 6 = 12개
- **생성 동작 분석 (의상 * ~시간대)**:
  - 파일명: `teto_expr_default` 또는 `teto_expr_bikini` 등 *(시간대 day, night가 앞에 붙은 ~ 연산자에 의해 파일 이름에서 강제 삭제되어 teto_expr_default_day 가 되지 않고 아주 가볍게 떨어집니다)*
  - 프롬프트: 프롬프트 본문 뒤에는 `bright sunny day, outdoor` 등 지정한 시간대 태그가 확실히 주입되어 올바르게 생성됩니다.

---

### 8-6. 지능형 모순 조건 필터링 (`{{exclude}}`)
*파일 위치: `examples/ceg/06_complex_exclude.ceg`*

비키니를 입고 겨울 눈밭 야외에 어정쩡하게 서 있거나 잠옷을 입고 해변가에 서 있는 등의 기괴하거나 불필요한 시각적 에러 조합을 컴파일러가 사전에 차단하여 생성 한도를 아끼는 최후의 여과 장치입니다.

```jinja
{{#
  CEG 복합 제외 필터링 예제
#}}

{{set character = "1girl, kasane teto, red hair, twin drills, red eyes"}}
{{set base_quality = "masterpiece, best quality, highly detailed"}}

{{axis outfit}}
  default : "military mechanical outfit"
  bikini : "red halterneck bikini"
  pajamas : "pink oversized pajamas"
{{/axis}}

{{axis location}}
  beach : "tropical beach, sunny sea side"
  bedroom : "cosy indoor bedroom, pillows"
  snow : "snowing winter outdoor, white ground"
{{/axis}}

{{# 의상 3종 * 장소 3종 = 총 9장 생성 시도 #}}
{{combine outfit * location}}

{{#
  제외 규칙 1: 잠옷(pajamas)을 입은 상태에서 해변(beach)이나 눈밭(snow)에 있는 모든 경우 배제
  제외 규칙 2: 비키니(bikini)를 입고 추운 눈밭(snow)에 있는 모든 경우 배제
#}}
{{exclude outfit = pajamas AND location in [beach, snow]}}
{{exclude outfit = bikini AND location = snow}}

{{template}}
{{character}}, {{base_quality}}, {{outfit}}, standing, {{location}}
{{/template}}

{{filename}}
teto_exclude_{{outfit.key}}_{{location.key}}
{{/filename}}
```
- **조합 총합**: 9개에서 3개가 제외되어 **최종 6개**만 유효하게 생성됩니다.
- **배제되는 항목**:
  - `teto_exclude_pajamas_beach` ❌ (제외)
  - `teto_exclude_pajamas_snow` ❌ (제외)
  - `teto_exclude_bikini_snow` ❌ (제외)

---

## 자주 하는 시나리오 모음

### "캐릭터 한 명, 표정과 포즈 모든 조합"
```jinja
{{set char = "1girl, silver hair"}}
{{axis emotion}} happy:"smiling" sad:"crying" {{/axis}}
{{axis pose}} stand:"standing" sit:"sitting" {{/axis}}
{{combine emotion * pose}}
{{template}}{{char}}, {{emotion}}, {{pose}}{{/template}}
{{filename}}char_{{emotion.key}}_{{pose.key}}{{/filename}}
```

### "상/하의 쪼개서 템플릿의 다른 곳에 넣기"
```jinja
{{axis outfit}}
  school : { top: "shirt, tie", bottom: "pleated skirt" }
{{/axis}}
{{combine outfit * pose}}
{{template}}
  (1girl, {{outfit.top}}:1.2), 
  standing, {{outfit.bottom}}
{{/template}}
```

### "두 가지 시나리오를 한 배치로"
```jinja
{{combine (outfit * emotion) + (outfit * action)}}
```

### "옷 종류가 파일명에 노출되면 안 됨"
```jinja
{{combine c = char * ~outfit * emotion}}
{{filename}}{{c.key}}{{/filename}}
```

---

## 빠른 참조 (Quick Reference)

| 하고 싶은 것 | 문법 |
|---|---|
| 메모 남기기 | `{{# 텍스트 #}}` |
| 변수 정의 | `{{set name = "value"}}` |
| 파일 정제 옵션 활성화 | `{{set clean_filename = "true"}}` |
| 축 정의 | `{{axis name}} key:"value" {{/axis}}` |
| 파일명 키 따로 지정 | `{{axis name}} key as "file-key":"value" {{/axis}}` |
| 선택적 축 정의 (생략 분기 포함) | `{{axis name?}} key:"value" {{/axis}}` |
| 속성(Dict) 정의 | `{{axis name}} key:{ prop:"val" } {{/axis}}` |
| 공통 문구 붙이기 | `{{axis name include="공통"}}` |
| 전체 조합 | `{{combine a * b}}` |
| 두 시나리오 합치기 | `{{combine (a * b) + (a * c)}}` |
| 별칭으로 묶기 | `{{combine c = a * b}}` |
| 키 숨기기 | `~axis_name` |
| 고정 문구 끼우기 | `* "extra text"` |
| 조합 제외 | `{{exclude a=key1 AND b in [k2, k3]}}` |
| 프롬프트 본문 | `{{template}} ... {{/template}}` |
| 파일명 | `{{filename}} ... {{/filename}}` |
| 값 꺼내기 | `{{name}}` |
| 키 꺼내기 | `{{name.key}}` |
| 속성 꺼내기 | `{{name.prop}}` |

