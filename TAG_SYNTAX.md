# 태그 문법 가이드 (Tag Syntax Guide)

프롬프트에서 사용할 수 있는 커스텀 태그 문법입니다.

---

## 기본 태그

### `{{tag}}` - 필수 태그
모든 값에 대해 조합 생성

```
1girl, {{emotion}}, standing
```
emotion = `[smile, angry]` → 2개 조합

---

### `{{?tag}}` - 옵션 태그
빈 값도 조합에 포함

```
1girl, {{emotion}}, {{?accessory}}
```
accessory = `[hat, glasses]` → 빈 값 포함 3개 조합

---

### `{{tag:random}}` - 랜덤 태그
조합 대신 랜덤하게 하나 선택

```
1girl, {{emotion:random}}, {{pose}}
```
emotion에서 랜덤 1개 × pose 모든 값

---

## 조건문

### `{{$if tag}}...{{$endif}}` - 존재 확인
태그에 값이 있을 때만 포함

```
1girl{{$if outfit}}, wearing {{outfit}}{{$endif}}
```
outfit이 비어있으면: `1girl`
outfit = dress면: `1girl, wearing dress`

---

### `{{$if tag=value}}` - 값 비교
특정 값일 때만 포함

```
{{emotion}}{{$if emotion=angry}}, red eyes, fangs{{$endif}}
```
emotion = angry일 때만 `red eyes, fangs` 추가

---

### `{{$if tag!=value}}` - 부정 비교
특정 값이 아닐 때 포함

```
{{$if rating!=nsfw}}clothed{{$endif}}
```

---

### `{{$if !tag}}` - 존재하지 않을 때
태그가 비어있을 때 포함

```
{{$if !outfit}}nude{{$endif}}
```
outfit이 비어있으면: `nude`

---

### `{{$else}}` - Else 분기

```
{{$if mood=happy}}
  cheerful, bright
{{$else}}
  melancholy, dark
{{$endif}}
```

---

## 주석

### `{{#...}}` - 주석 (출력 안 됨)

```
1girl, {{emotion}} {{#TODO: add more details}}
```
출력: `1girl, smile`

---

## 들여쓰기

가독성을 위한 들여쓰기는 자동으로 제거됩니다:

```
masterpiece,
  {{emotion}},
  {{$if outfit}}
    wearing {{outfit}}
  {{$endif}}
```
출력: `masterpiece, smile, wearing dress`

---

## 조합 예시

```
1girl, {{emotion}}
{{$if emotion=angry}}, red eyes{{$endif}}
{{$if outfit}}, {{outfit}}{{$else}}, nude{{$endif}}
```

| emotion | outfit | 결과 |
|---------|--------|------|
| smile | dress | `1girl, smile, dress` |
| smile | (빈값) | `1girl, smile, nude` |
| angry | dress | `1girl, angry, red eyes, dress` |
| angry | (빈값) | `1girl, angry, red eyes, nude` |
