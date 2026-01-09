
import json
import re

# The content of TRANSLATIONS from gui_main.py
TRANSLATIONS = {
    "Run": {"ko": "실행", "en": "Run"},
    "Stop": {"ko": "중지", "en": "Stop"},
    "Status": {"ko": "상태", "en": "Status"},
    "Identity": {"ko": "기본 정보", "en": "Identity"},
    "Character Name": {"ko": "캐릭터 이름", "en": "Character Name"},
    "Reference Image": {"ko": "참조 이미지", "en": "Reference Image"},
    "Reference": {"ko": "레퍼런스 (Reference)", "en": "Reference"},
    "Enable Reference (IPAdapter)": {"ko": "레퍼런스 사용 (IPAdapter)", "en": "Enable Reference (IPAdapter)"},
    "Weight": {"ko": "가중치 (Weight)", "en": "Weight"},
    "FaceID v2": {"ko": "FaceID v2", "en": "FaceID v2"},
    "Type": {"ko": "타입 (Type)", "en": "Type"},
    "Combine": {"ko": "결합 (Combine)", "en": "Combine"},
    "Start At": {"ko": "시작 시점 (Start At)", "en": "Start At"},
    "End At": {"ko": "종료 시점 (End At)", "en": "End At"},
    "Scaling": {"ko": "스케일링 (Scaling)", "en": "Scaling"},
    "Prompting": {"ko": "프롬프트 (Prompting)", "en": "Prompting"},
    "Quality Prompt": {"ko": "화질 프롬프트 (Quality)", "en": "Quality Prompt"},
    "Subject Prompt (#emotion# tag required)": {"ko": "피사체 프롬프트 (#emotion# 태그 필수)", "en": "Subject Prompt (#emotion# tag required)"},
    "Style/Artist Prompt": {"ko": "스타일/화풍 프롬프트", "en": "Style/Artist Prompt"},
    "Negative Prompt": {"ko": "부정 프롬프트 (Negative)", "en": "Negative Prompt"},
    "Emotions": {"ko": "감정 (Emotions)", "en": "Emotions"},
    "Import": {"ko": "가져오기 (Import)", "en": "Import"},
    "Export": {"ko": "내보내기 (Export)", "en": "Export"},
    "Add": {"ko": "추가", "en": "Add"},
    "Remove": {"ko": "삭제", "en": "Remove"},
    "Emotion Name": {"ko": "감정 이름", "en": "Emotion Name"},
    "Prompt Modifier": {"ko": "프롬프트 수식어", "en": "Prompt Modifier"},
    "Advanced": {"ko": "고급 (Advanced)", "en": "Advanced"},
    "Primary Sampler": {"ko": "기본 샘플러", "en": "Primary Sampler"},
    "Secondary Sampler": {"ko": "보조 샘플러", "en": "Secondary Sampler"},
    "Upscale Factor": {"ko": "업스케일 배수", "en": "Upscale Factor"},
    "Base Resolution": {"ko": "기본 해상도", "en": "Base Resolution"},
    "Queue": {"ko": "대기열 (Queue)", "en": "Queue"},
    "Pending Jobs": {"ko": "대기 중인 작업", "en": "Pending Jobs"},
    "Trash All": {"ko": "전체 삭제", "en": "Trash All"},
    "Batch": {"ko": "배치 (Batch)", "en": "Batch"},
    "Seed": {"ko": "시드 (Seed)", "en": "Seed"},
    "Generate": {"ko": "생성 (Generate)", "en": "Generate"},
    "Ready": {"ko": "준비됨", "en": "Ready"},
    "Connected": {"ko": "연결됨", "en": "Connected"},
    "Disconnected": {"ko": "연결 안됨", "en": "Disconnected"},
    "Checking...": {"ko": "확인 중...", "en": "Checking..."},
    "Processing Queue...": {"ko": "대기열 처리 중...", "en": "Processing Queue..."},
    "Job added to running queue.": {"ko": "작업이 실행 대기열에 추가되었습니다.", "en": "Job added to running queue."},
    "Generation Complete.": {"ko": "생성 완료.", "en": "Generation Complete."},
    "Validation Error": {"ko": "검증 오류", "en": "Validation Error"},
    "Worklist is empty.": {"ko": "작업 목록이 비어있습니다.", "en": "Worklist is empty."},
    "Combined Prompt must contain '#emotion#'. (Check Subject Prompt)": {"ko": "프롬프트에 '#emotion#' 태그가 포함되어야 합니다. (피사체 프롬프트 확인)", "en": "Combined Prompt must contain '#emotion#'. (Check Subject Prompt)"},
    "tip_weight": {"ko": "참조 이미지의 영향력을 조절합니다. 값이 높을수록 원본과 흡사해집니다.", "en": "Controls the influence of the reference image. Higher values make it look more like the reference."},
    "tip_faceid": {"ko": "IPAdapter FaceID 모델의 가중치입니다. 얼굴 유사도에 영향을 줍니다.", "en": "Weight for the IPAdapter FaceID model. Affects face similarity."},
    "tip_type": {"ko": "가중치가 적용되는 방식입니다.\n- Linear: 일정하게 적용\n- Ease In: 점점 강하게\n- Ease Out: 점점 약하게", "en": "How the weight is applied over the steps.\n- Linear: Constant\n- Ease In: Start weak, end strong\n- Ease Out: Start strong, end weak"},
    "tip_combine": {"ko": "임베딩 결합 방식입니다. 보통 'add'가 무난합니다.", "en": "How to combine embeddings. 'add' is usually sufficient."},
    "tip_start": {"ko": "참조 이미지가 적용되기 시작하는 단계(0.0~1.0)입니다.", "en": "When to start applying the reference image (0.0-1.0)."},
    "tip_end": {"ko": "참조 이미지 적용을 멈추는 단계(0.0~1.0)입니다.", "en": "When to stop applying the reference image (0.0-1.0)."},
    "tip_scaling": {"ko": "임베딩 스케일링 방식입니다.", "en": "Embedding scaling method."}
}

en_data = {}
ko_data = {}

for key, val in TRANSLATIONS.items():
    en_data[key] = val.get("en", key)
    ko_data[key] = val.get("ko", key)

# Write to files
with open("lang/en.json", "w", encoding="utf-8") as f:
    json.dump(en_data, f, indent=4, ensure_ascii=False)

with open("lang/ko.json", "w", encoding="utf-8") as f:
    json.dump(ko_data, f, indent=4, ensure_ascii=False)

print("JSON files created.")
