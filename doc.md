# Prompt DSL 문법 가이드

AI 이미지 프롬프트를 **축(axis) × 조합(combine)** 으로 배치 생성하기 위한 템플릿 언어.
문법은 [prompt_dsl.lark](prompt_dsl.lark) 의 Lark EBNF 로 정의되어 있고, [prompt_dsl.py](prompt_dsl.py) 가 이를 파싱/렌더링합니다.

---

## 1. 한눈에 보기

```
{{set character = "1girl, silver hair"}}

{{axis outfit}}
  uniform : "school uniform"
  dress   : "elegant dress"
{{/axis}}

{{combine outfit}}

{{template}}{{character}}, {{outfit}}{{/template}}
{{filename}}char_{{outfit.key}}{{/filename}}
```

→ 2 개의 결과가 생성됨:

| filename        | prompt                                 |
|-----------------|----------------------------------------|
| `char_uniform`  | `1girl, silver hair, school uniform`   |
| `char_dress`    | `1girl, silver hair, elegant dress`    |

---

## 2. 구문 요소

### 2.1 `{{set}}` — 변수 선언

```
{{set name = "value"}}
```

- `value` 는 큰따옴표 문자열.
- 템플릿 본문에서 `{{name}}` 으로 참조.

### 2.2 `{{axis}}` — 축 정의

하나의 축은 여러 개의 key/value 쌍을 가집니다.

```
{{axis outfit}}
  uniform : "school uniform"
  casual  : "hoodie, jeans"
{{/axis}}
```

- `key`: 식별자 (영숫자/`_`, 숫자로 시작 불가). 파일명·exclude 에서 사용.
- `value`: 실제 프롬프트에 삽입될 문자열.

**가중치 축 (`weighted`)**

```
{{axis emotion weighted}}
  happy   : "smiling"          @ 3
  neutral : "calm"             @ 3
  sad     : "teary eyes"       @ 1
{{/axis}}
```

- `@ <숫자>` 로 가중치를 지정.
- `{{combine ... : sample=N}}` 으로 샘플링할 때만 효과가 있음. 전체 조합을 쓸 때는 무시됨.

### 2.3 `{{combine}}` — 조합 선언

어떤 축들을 카르테시안 곱으로 조합할지 지정.

```
{{combine outfit * emotion * pose}}
```

**옵션 (샘플링)**

```
{{combine outfit * emotion * pose : sample=20 seed=42}}
```

| 옵션      | 설명                                              |
|-----------|---------------------------------------------------|
| `sample`  | 전체 조합 중 N 개만 무작위 샘플 (가중치 반영).   |
| `seed`    | 재현 가능한 샘플링을 위한 RNG 시드.              |

- `sample` 이 전체 조합 수 이상이면 샘플링하지 않고 전체를 반환.
- `seed` 생략 시 매번 다른 결과.

### 2.4 `{{exclude}}` — 조합 제외

특정 key 조합을 결과에서 제외.

```
{{exclude outfit=swimsuit AND emotion=angry}}
{{exclude outfit=dress AND emotion=angry}}
```

- 한 exclude 구문은 AND 조건.
- 여러 개 쓰면 OR 관계 (하나라도 맞으면 제외).

### 2.5 `{{template}}` / `{{filename}}` — 출력 정의

```
{{template}}
{{character}}, {{outfit}}, {{emotion}}
{{/template}}

{{filename}}char_{{outfit.key}}_{{emotion.key}}{{/filename}}
```

- `{{template}}`: 각 조합에 대해 생성될 프롬프트.
- `{{filename}}`: 결과 파일명 (확장자 제외).
- 둘 다 `template_body` 문법을 쓰며, 아래의 **치환 규칙**이 적용됨.

### 2.6 주석

```
{{# 여기는 주석. 파서가 무시함 #}}
```

---

## 3. 치환 규칙 (template / filename 본문)

렌더링 시 본문 안의 다음 패턴들이 치환됩니다.

| 패턴                        | 의미                                     |
|-----------------------------|------------------------------------------|
| `{{name}}`                  | `{{set}}` 변수 또는 축의 현재 value.      |
| `{{axis_name.key}}`         | 현재 조합에서 해당 축의 key (식별자).     |
| `{{w:1.2:content}}`         | ComfyUI 가중치 문법 `(content:1.2)` 로 치환. |

**후처리**: 중복 공백·중복 콤마 정리 후 앞뒤 `,` 와 공백 제거.

---

## 4. ComfyUI 연동

렌더링한 프롬프트는 ComfyUI 워크플로우 JSON 의 placeholder 에 주입합니다.

### 4.1 단일 placeholder

워크플로우 어딘가에 `{{input}}` 을 박아두면 전체 문자열이 대체됨.

```python
from prompt_dsl import inject_into_workflow

wf = {"6": {"class_type": "CLIPTextEncode",
            "inputs": {"text": "{{input}}, masterpiece"}}}
inject_into_workflow(wf, "1girl, smiling")
# → "1girl, smiling, masterpiece"
```

### 4.2 다중 placeholder (positive / negative 분리)

```python
inject_into_workflow(wf, {
    "{{positive}}": "1girl, elegant dress",
    "{{negative}}": "low quality, watermark",
})
```

### 4.3 배치 실행

```python
from prompt_dsl import run_batch

run_batch(template_src, workflow, dry_run=True)   # 렌더링만
run_batch(template_src, workflow, dry_run=False)  # ComfyUI 로 실제 제출
```

---

## 5. 전체 예시

실행 가능한 샘플: [example.template](example.template)

```bash
python prompt_dsl.py example.template
```

---

## 6. 에러 처리

문법 오류 시 `DSLSyntaxError` 가 발생하며, 라인/컬럼 + 기대한 토큰을 한글로 안내합니다.

```
문법 에러 (line 6, column 3):

  uniform  "school uniform"
           ^
기대한 토큰: :
```
