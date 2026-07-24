# ComfyUI-CEG

ComfyEmotionGen 전용 ComfyUI 커스텀 노드입니다. CEG가 작업별 프롬프트, 파일명, 시드, 축 메타데이터와 슬롯 값을 워크플로에 직접 주입하므로 별도의 노드 매핑 없이 사용할 수 있습니다.

## 설치

`ComfyUI-CEG` 폴더를 ComfyUI의 `custom_nodes` 폴더 안에 복사하거나 심볼릭 링크한 뒤 ComfyUI를 재시작합니다.

```text
ComfyUI/
└── custom_nodes/
    └── ComfyUI-CEG/
        ├── __init__.py
        └── nodes.py
```

추가 의존성은 없습니다.

## 노드

- **CEG Context**: `prompt`, `filename`, `seed`, `metadata_json`, `slots_json`을 출력합니다.
- **CEG Text / Integer / Float / Boolean**: `slot` 또는 `meta`에서 지정한 키를 typed value로 출력합니다.
- **CEG Seed**: 작업마다 CEG가 생성한 랜덤 시드를 출력합니다.

## 사용 예

1. `CEG Context`의 `prompt`를 `CLIP Text Encode`의 `text`에 연결합니다.
2. `filename`을 `Save Image`의 `filename_prefix`에 연결합니다.
3. `seed`를 `KSampler`의 `seed`에 연결합니다.
4. ComfyUI에서 API 형식 워크플로를 내보내 CEG에 등록합니다.
5. CEG에서 실행하면 전용 노드가 자동으로 채워집니다.

ComfyUI에서 워크플로를 직접 실행할 때는 각 노드 위젯에 적힌 값이 fallback으로 사용됩니다. CEG는 저장된 원본 워크플로를 변경하지 않고 제출되는 API 워크플로 복사본만 변경합니다.
