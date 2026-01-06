import sys
import os
import json
import shutil
import re
import webbrowser
import tempfile
import subprocess
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QLabel, QLineEdit, QPushButton, QTextEdit, QSpinBox, 
                             QTableWidget, QTableWidgetItem, QHeaderView, QProgressBar, 
                             QFileDialog, QTabWidget, QListWidget, QListWidgetItem, 
                             QAbstractItemView, QMessageBox, QSplitter, QComboBox, QFrame, QGridLayout, QSizePolicy, QDialog, QScrollArea, QCheckBox, QDoubleSpinBox, QStackedWidget, QMenu)
from PyQt6.QtCore import (Qt, QThread, pyqtSignal, QSize, QEvent, QMimeData, QUrl, QPoint)
from PyQt6.QtGui import (QIcon, QPixmap, QFont, QAction, QWheelEvent, QPalette, QPainter, QColor, QBrush, QPen, QDrag)

# ==========================================
# LOCALIZATION & HELP HELPERS
# ==========================================
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
    "Processing Queue...": {"ko": "대기열 처리 중...", "en": "Processing Queue..."},
    "Job added to running queue.": {"ko": "작업이 실행 대기열에 추가되었습니다.", "en": "Job added to running queue."},
    "Generation Complete.": {"ko": "생성 완료.", "en": "Generation Complete."},
    "Validation Error": {"ko": "검증 오류", "en": "Validation Error"},
    "Worklist is empty.": {"ko": "작업 목록이 비어있습니다.", "en": "Worklist is empty."},
    "Combined Prompt must contain '#emotion#'. (Check Subject Prompt)": {"ko": "프롬프트에 '#emotion#' 태그가 포함되어야 합니다. (피사체 프롬프트 확인)", "en": "Combined Prompt must contain '#emotion#'. (Check Subject Prompt)"},
     # Tooltips
    "tip_weight": {"ko": "참조 이미지의 영향력을 조절합니다. 값이 높을수록 원본과 흡사해집니다.", "en": "Controls the influence of the reference image. Higher values make it look more like the reference."},
    "tip_faceid": {"ko": "IPAdapter FaceID 모델의 가중치입니다. 얼굴 유사도에 영향을 줍니다.", "en": "Weight for the IPAdapter FaceID model. Affects face similarity."},
    "tip_type": {"ko": "가중치가 적용되는 방식입니다.\n- Linear: 일정하게 적용\n- Ease In: 점점 강하게\n- Ease Out: 점점 약하게", "en": "How the weight is applied over the steps.\n- Linear: Constant\n- Ease In: Start weak, end strong\n- Ease Out: Start strong, end weak"},
    "tip_combine": {"ko": "임베딩 결합 방식입니다. 보통 'add'가 무난합니다.", "en": "How to combine embeddings. 'add' is usually sufficient."},
    "tip_start": {"ko": "참조 이미지가 적용되기 시작하는 단계(0.0~1.0)입니다.", "en": "When to start applying the reference image (0.0-1.0)."},
    "tip_end": {"ko": "참조 이미지 적용을 멈추는 단계(0.0~1.0)입니다.", "en": "When to stop applying the reference image (0.0-1.0)."},
    "tip_scaling": {"ko": "임베딩 스케일링 방식입니다.", "en": "Embedding scaling method."}
}

class HelpMarker(QLabel):
    def __init__(self, tooltip_key, parent=None):
        super().__init__("❓", parent)
        self.tooltip_key = tooltip_key
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip(self.get_text())
        self.setStyleSheet("color: #0A84FF; font-weight: bold; margin-left: 5px;")
    
    def get_text(self):
        # We need a way to access current language. Ideally passed or global.
        # For simplicity, we'll try to access global app config if possible or just store both.
        # But wait, MainWindow handles language. 
        # Let's just store the key and update tooltip on hover if we can access app instance.
        # OR simpler: checking config file directly might be slow.
        # Let's assume we pass the translated text or the key.
        # Modified: Let's make it look up TRANSLATIONS directly based on a simple global var or config check.
        # Actually, let's just make get_help_text(key) function.
        return localized_text(self.tooltip_key)

    def enterEvent(self, event):
        self.setToolTip(localized_text(self.tooltip_key))
        super().enterEvent(event)

# Simple global context for language (A bit hacky but effective for single window app)
CURRENT_LANG = "en"

def localized_text(key):
    if key not in TRANSLATIONS: return key
    return TRANSLATIONS[key].get(CURRENT_LANG, key)

# Import backend logic
# Ensure current directory is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from comfy_client import ComfyClient
from workflow_manager import prepare_workflow
from gui_gallery import GalleryTab



# ==========================================
# MODERN UI STYLESHEET
# ==========================================
MODERN_STYLESHEET = """
/* --- Global Clean Reset --- */
* {
    outline: none; /* Remove default focus outlines */
}

/* --- Main Window & Background --- */
QMainWindow, QDialog, QWidget#CentralWidget {
    background-color: #1C1C1E;
    color: #F5F5F7;           /* Main Text */
    font-family: 'Segoe UI', 'San Francisco', 'Helvetica Neue', sans-serif;
    font-size: 14px;
}

/* --- ScrollBars (Invisible/Overlay style simulation) --- */
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 12px;
    margin: 0px;
}
QScrollBar::handle:vertical {
    background: #48484A;
    min-height: 20px;
    border-radius: 6px;
    border: 3px solid transparent; /* Padding effect */
    background-clip: content-box;
}
QScrollBar::handle:vertical:hover {
    background: #636366;
    border: 3px solid transparent;
    background-clip: content-box;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}
QScrollBar:horizontal {
    border: none;
    background: transparent;
    height: 12px;
}
QScrollBar::handle:horizontal {
    background: #48484A;
    min-width: 20px;
    border-radius: 6px;
    border: 3px solid transparent;
    background-clip: content-box;
}

/* --- Sidebar (Source List) --- */
QWidget#SidebarContainer {
    background-color: #252525; /* Slightly lighter than main bg */
    border-right: 1px solid #38383A;
}

QListWidget#Sidebar {
    background-color: transparent;
    border: none;
    font-size: 15px;
    font-weight: 500;
    padding-top: 10px;
    outline: none;
}
QListWidget#Sidebar::item {
    color: #AEAEB2; /* Secondary Label Color */
    padding: 10px 15px;
    margin: 2px 10px; /* Spacing for rounded look */
    border-radius: 8px; /* Rounded corners for selection */
    border: none;       /* Remove old left-border style */
}
QListWidget#Sidebar::item:selected {
    background-color: #3A3A3C; /* Selected Background */
    color: #FFFFFF;
}
QListWidget#Sidebar::item:hover:!selected {
    background-color: rgba(255, 255, 255, 0.05);
    color: #E5E5EA;
}

/* --- Card / Panels --- */
QFrame.Card {
    background-color: #2C2C2E; /* Secondary Grouped Background */
    border-radius: 12px;
    border: 1px solid #38383A;
}

/* --- Headers & Typography --- */
QLabel {
    color: #F5F5F7;
}
QLabel.Header {
    font-size: 24px;
    font-weight: 700;
    color: #FFFFFF;
    margin-bottom: 12px;
}
QLabel.SectionTitle {
    font-size: 15px;
    font-weight: 600;
    color: #0A84FF;
    margin-bottom: 6px;
}

/* --- Input Fields (Text Fields) --- */
QLineEdit, QTextEdit, QPlainTextEdit, QSpinBox, QDoubleSpinBox, QComboBox {
    background-color: #1C1C1E; /* Darker than Card */
    border: 1px solid #3A3A3C;
    border-radius: 8px;
    padding: 8px 10px;
    color: #FFFFFF;
    font-size: 13px;
    selection-background-color: #0A84FF;
    selection-color: #FFFFFF;
}
QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, QComboBox:focus {
    border: 1px solid #0A84FF; /* Focus Ring */
    background-color: #000000;
}
QLineEdit:disabled, QComboBox:disabled {
    color: #636366;
    background-color: #2C2C2E;
    border-color: #38383A;
}

/* SpinBox Arrows */
QAbstractSpinBox::up-button, QAbstractSpinBox::down-button {
    background-color: transparent;
    border: none;
    border-radius: 4px;
    margin: 1px;
}
QAbstractSpinBox::up-button:hover, QAbstractSpinBox::down-button:hover {
    background-color: #3A3A3C;
}
QAbstractSpinBox::up-arrow, QAbstractSpinBox::down-arrow {
    width: 8px;
    height: 8px;
    /* Often need an image or unicode hack if standard doesn't render well. 
       PyQt usually handles this, but let's leave default or add images if broken. */
}

/* ComboBox Dropdown */
QComboBox::drop-down {
    border: none;
    width: 20px;
}
QComboBox::down-arrow {
    image: none;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid #8E8E93;
    margin-right: 8px;
}

/* --- Buttons --- */
QPushButton {
    background-color: #3A3A3C; /* Neutral Fill */
    border: 1px solid transparent;
    border-radius: 8px; /* Slightly rounded, try 15px for full pill if height allows */
    color: #FFFFFF;
    padding: 6px 16px;
    font-weight: 500;
    font-size: 13px;
}
QPushButton:hover {
    background-color: #48484A;
}
QPushButton:pressed {
    background-color: #2C2C2E;
}
QPushButton:disabled {
    background-color: #2C2C2E;
    color: #636366;
}

/* Primary Action Button (Blue Pill) */
QPushButton.Primary {
    background-color: #0A84FF;
    color: #FFFFFF;
    border-radius: 18px; /* Full Pill Shape for larger buttons */
    padding: 8px 20px;
    font-weight: 600;
    font-size: 14px;
}
QPushButton.Primary:hover {
    background-color: #007AFF; /* Slightly lighter/brighter */
}
QPushButton.Primary:pressed {
    background-color: #0062CC;
}

/* Destructive Action Button (Red) */
QPushButton.Danger {
    background-color: rgba(255, 69, 58, 0.15); /* Transparent Red */
    color: #FF453A;
    border: 1px solid rgba(255, 69, 58, 0.3);
}
QPushButton.Danger:hover {
    background-color: rgba(255, 69, 58, 0.25);
    border-color: #FF453A;
}
QPushButton.Danger:pressed {
    background-color: rgba(255, 69, 58, 0.4);
}

/* --- Tabs (Segmented Control Style) --- */
QTabWidget::pane {
    border: 1px solid #38383A;
    border-radius: 12px; /* Content area rounded */
    background-color: #2C2C2E;
    /* Move content down slightly if needed */
    margin-top: -1px; 
}
QTabWidget::tab-bar {
    alignment: left;
    left: 10px; 
}
QTabBar::tab {
    background-color: transparent;
    color: #AEAEB2;
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    margin-right: 5px;
    border-radius: 16px; /* Pill shape tabs */
    border: 1px solid transparent;
}
QTabBar::tab:selected {
    background-color: #636366; /* Active Pill Color */
    color: #FFFFFF;
}
QTabBar::tab:hover:!selected {
    background-color: rgba(99, 99, 102, 0.3);
    color: #E5E5EA;
}

/* --- Tables & Lists --- */
QTableWidget, QListWidget {
    background-color: #1C1C1E;
    border: 1px solid #38383A;
    border-radius: 8px;
    gridline-color: #38383A;
    color: #F5F5F7;
    alternate-background-color: #252525;
}
QHeaderView::section {
    background-color: #2C2C2E;
    color: #AEAEB2;
    padding: 6px;
    border: none;
    border-bottom: 1px solid #38383A;
    border-right: 1px solid #38383A;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
}
QTableWidget::item:selected {
    background-color: #143F6B; /* Darker Blue selection */
    color: #FFF;
}

/* --- CheckBox --- */
QCheckBox {
    color: #F5F5F7;
    font-size: 13px;
    spacing: 8px;
}

/* --- Toolbar --- */
QWidget#TopToolbar {
    background-color: #252525;
    border-bottom: 1px solid #38383A;
}
QCheckBox {
    spacing: 8px; /* Spacing between box and text */
}
QCheckBox::indicator {
    width: 20px;
    height: 20px;
    background: #000000;
    border: 2px solid #888888; /* Thicker, lighter border for visibility */
    border-radius: 4px;
}
QCheckBox::indicator:checked {
    background-color: #0A84FF;
    border-color: #0A84FF;
    /* Simplified SVG with explicit white stroke */
    image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlsaW5lIHBvaW50cz0iMjAgNiA5IDE3IDQgMTIiLz48L3N2Zz4=);
}
QCheckBox::indicator:hover {
    border-color: #FFFFFF; /* High contrast on hover */
    background-color: #1a1a1a;
}
QCheckBox::indicator:disabled {
    background-color: #2C2C2E;
    border-color: #38383A;
    image: none;
}
QCheckBox:disabled {
    color: #555555; /* Dim text for disabled */
}

/* --- Progress Bar --- */
QProgressBar {
    border: none;
    background-color: #3A3A3C;
    border-radius: 4px;
    height: 6px;
    text-align: center;
}
QProgressBar::chunk {
    background-color: #0A84FF;
    border-radius: 4px;
}
"""





class Card(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setProperty("class", "Card")
        self.setLayout(QVBoxLayout())
        self.layout().setContentsMargins(15, 15, 15, 15)
        self.layout().setSpacing(10)

class ResizingLabel(QLabel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Ignored) # Crucial for resizing in layouts
        self.setMinimumSize(50, 50)
        self._pixmap = None

    def setPixmap(self, pixmap):
        self._pixmap = pixmap
        self.update_view()

    def resizeEvent(self, event):
        self.update_view()
        super().resizeEvent(event)

    def update_view(self):
        if self._pixmap and not self._pixmap.isNull():
            w = self.width()
            h = self.height()
            if w > 0 and h > 0:
                scaled = self._pixmap.scaled(w, h, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                super().setPixmap(scaled)
        else:
            super().setPixmap(QPixmap())

class JobQueueItem:
    def __init__(self, char_name, base_prompt, neg_prompt, emotions, ref_img, batch, seed, gen_settings, ref_enabled, ref_settings, is_test=False):
        self.char_name = char_name
        self.base_prompt = base_prompt
        self.neg_prompt = neg_prompt
        self.emotions = emotions # List of (name, prompt)
        self.ref_img = ref_img
        self.batch = batch
        self.seed = seed
        self.gen_settings = gen_settings
        self.ref_enabled = ref_enabled
        self.ref_settings = ref_settings
        self.is_test = is_test
        self.status = "Pending" # Pending, Running, Done, Error

class AppConfigManager:
    def __init__(self, config_file="app_config.json"):
        self.config_file = config_file
        self.defaults = {
            "server_address": "127.0.0.1:8188",
            "use_internal_viewer": True,
            "last_active_character": "",
            "folder_preview_mode": "3 Images",
            "language": "en"
        }
        self.config = self.load_config()
        
        # Set Global Lang
        global CURRENT_LANG
        CURRENT_LANG = self.config.get("language")

    def load_config(self):
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Merge with defaults to ensure all keys exist
                    for k, v in self.defaults.items():
                        if k not in data:
                            data[k] = v
                    return data
            except:
                return self.defaults.copy()
        return self.defaults.copy()

    def save_config(self):
        try:
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=4)
        except Exception as e:
            print(f"Error saving app config: {e}")

    def get(self, key):
        return self.config.get(key, self.defaults.get(key))

    def set(self, key, value):
        self.config[key] = value
        self.save_config()

class CharacterConfigManager:
    def __init__(self, config_dir="configs"):
        self.config_dir = os.path.join(os.getcwd(), config_dir)
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir)

    def save_config(self, name, data):
        safe_name = self.clean_name(name)
        if not safe_name: return False
        try:
            with open(os.path.join(self.config_dir, f"{safe_name}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            return True
        except Exception as e:
            print(f"Error saving config: {e}")
            return False
    
    def load_config(self, name):
        safe_name = self.clean_name(name)
        path = os.path.join(self.config_dir, f"{safe_name}.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except:
                return None
        return None

    def list_characters(self):
        if not os.path.exists(self.config_dir): return []
        return sorted([f.replace(".json", "") for f in os.listdir(self.config_dir) if f.endswith(".json")])

    def clean_name(self, name):
        return "".join([c for c in name if c.isalnum() or c in (' ', '_', '-')]).strip()

class GenerationWorker(QThread):
    progress_signal = pyqtSignal(int)      # Overall Task Progress (0-100)
    step_signal = pyqtSignal(int, int)     # Current Step, Max Steps (for current generation)
    log_signal = pyqtSignal(str)
    preview_signal = pyqtSignal(bytes)
    finished_signal = pyqtSignal()
    job_started_signal = pyqtSignal(int)   # Index of job started

    def __init__(self, client, workflow_json, output_dir, job_queue):
        super().__init__()
        self.client = client
        self.workflow_json = workflow_json
        self.output_dir = output_dir
        self.job_queue = job_queue # List of JobQueueItem
        self.is_running = True

    def run(self):
        try:
            self.log_signal.emit("Connecting to ComfyUI...")
            self.client.connect() 
            
            def ws_callback(type, data):
                if type == "preview":
                    self.preview_signal.emit(data)
                elif type == "progress":
                    val = data.get('value', 0)
                    mx = data.get('max', 1)
                    self.step_signal.emit(val, mx)

            # Continuous loop to process Pending jobs
            while self.is_running:
                # Find the next pending job
                job = None
                job_idx = -1
                
                # Check for pending jobs safely
                for i, j in enumerate(self.job_queue):
                    if j.status == "Pending":
                        job = j
                        job_idx = i
                        break
                
                if job is None:
                    # No pending jobs left, exit loop
                    break

                # Start Processing Job
                self.job_started_signal.emit(job_idx)
                self.log_signal.emit(f"Starting Job: {job.char_name}")
                
                # Upload reference image if needed
                ref_filename = None
                if job.ref_img and os.path.exists(job.ref_img):
                    ref_filename = self.client.upload_image(job.ref_img)
                    self.log_signal.emit(f"Reference uploaded: {ref_filename}")
                elif job.ref_enabled:
                    self.log_signal.emit("Warning: Reference enabled but no image provided or file not found.")

                # Prepare Seeds
                import random
                seeds = []
                try:
                    base_seed = int(job.seed)
                except:
                    base_seed = -1
                
                for i in range(job.batch):
                    if base_seed == -1:
                        seeds.append(random.randint(1, 100000000000000))
                    else:
                        seeds.append(base_seed + i)

                # Directories
                # Directories
                if job.is_test:
                    char_dir = os.path.join(self.output_dir, ".temp")
                    char_safe_name = "test"
                else:
                    char_safe_name = self.clean_name(job.char_name)
                    char_dir = os.path.join(self.output_dir, char_safe_name)
                
                if not os.path.exists(char_dir): os.makedirs(char_dir)
                
                if job.ref_img:
                    try:
                        ext = os.path.splitext(job.ref_img)[1]
                        shutil.copy(job.ref_img, os.path.join(char_dir, f"reference{ext}"))
                    except: pass

                # Process Emotions
                total_steps = len(job.emotions) * job.batch
                current_step = 0
                
                for emotion_name, emotion_prompt in job.emotions:
                    if not self.is_running: break
                    
                    emotion_safe_name = self.clean_name(emotion_name)
                    if job.is_test:
                        emotion_dir = char_dir
                    else:
                        emotion_dir = os.path.join(char_dir, emotion_safe_name)
                        if not os.path.exists(emotion_dir): os.makedirs(emotion_dir)

                    for i in range(job.batch):
                        if not self.is_running: break
                        
                        current_seed = seeds[i]
                        self.log_signal.emit(f"Generating: {emotion_name} ({i+1}/{job.batch}) - Seed: {current_seed}")
                        
                        new_workflow, used_seed = prepare_workflow(
                            self.workflow_json, job.char_name, job.base_prompt, emotion_name, emotion_prompt, ref_filename, current_seed,
                            sampler1_name=job.gen_settings.get("sampler1_name", "dpmpp_3m_sde"),
                            scheduler1=job.gen_settings.get("scheduler1", "simple"),
                            sampler2_name=job.gen_settings.get("sampler2_name", "dpmpp_3m_sde"),
                            scheduler2=job.gen_settings.get("scheduler2", "simple"),
                            upscale_factor=job.gen_settings.get("upscale_factor", 1.5),
                            ref_enabled=job.ref_enabled,
                            ref_settings=job.ref_settings,
                            width=job.gen_settings.get("width", 896),
                            height=job.gen_settings.get("height", 1152),
                            bypass_sage_attn=job.gen_settings.get("bypass_sage_attn", False)
                        )
                        
                        prompt_id = self.client.queue_prompt(new_workflow)
                        result = self.client.wait_for_result(prompt_id, callback=ws_callback)
                        
                        if result:
                            fname, sub, typ = result
                            if job.is_test:
                                target_filename = "test_preview.png"
                            else:
                                target_filename = f"{char_safe_name}__{emotion_safe_name}__Seed{used_seed}__{i+1}.png"
                            self.client.download_image(fname, sub, os.path.join(emotion_dir, target_filename))
                            self.log_signal.emit(f"Saved: {target_filename}")
                            
                            try:
                                with open(os.path.join(emotion_dir, target_filename), "rb") as f:
                                    self.preview_signal.emit(f.read())
                            except: pass
                        
                        current_step += 1
                        self.progress_signal.emit(int((current_step / total_steps) * 100))
                
                # Mark job as Done
                if self.is_running:
                    job.status = "Done"
                    self.job_started_signal.emit(-1) # Signal to refresh UI status

            self.log_signal.emit("All Jobs Done.")
        except Exception as e:
            self.log_signal.emit(f"Error: {e}")
        finally:
            self.client.close()
            self.finished_signal.emit()

    def clean_name(self, name):
        return "".join([c for c in name if c.isalnum() or c in (' ', '_', '-')]).strip()

    def stop(self): 
        self.is_running = False
        self.log_signal.emit("Stopping...")
        try:
            self.client.interrupt()
            self.client.close()
        except: pass



class SettingsDialog(QDialog):
    def __init__(self, app_config, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.resize(500, 400)
        self.app_config = app_config
        self.setup_ui()
        
        # Apply Stylesheet from parent if available, or just set background
        self.setStyleSheet(parent.styleSheet()) if parent else None

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(20)
        
        title = QLabel("Application Settings")
        title.setProperty("class", "Header")
        layout.addWidget(title)
        
        # Content Card
        card = Card()
        cl = card.layout()
        
        # Server Address
        cl.addWidget(QLabel("ComfyUI Server Address:"))
        self.server_addr_input = QLineEdit()
        self.server_addr_input.setText(self.app_config.get("server_address"))
        self.server_addr_input.setPlaceholderText("e.g. 127.0.0.1:8188")
        self.server_addr_input.textChanged.connect(lambda t: self.app_config.set("server_address", t))
        cl.addWidget(self.server_addr_input)
        
        cl.addSpacing(10)
        
        # Viewer Preference
        self.viewer_check = QCheckBox("Use Internal Image Viewer")
        self.viewer_check.setChecked(self.app_config.get("use_internal_viewer"))
        self.viewer_check.toggled.connect(lambda c: self.app_config.set("use_internal_viewer", c))
        self.viewer_check.setStyleSheet("QCheckBox { color: #E0E0E0; font-size: 14px; }")
        cl.addWidget(self.viewer_check)
        
        cl.addSpacing(10)
        
        # Folder Preview Mode
        h2 = QHBoxLayout()
        h2.addWidget(QLabel("Gallery Folder Preview:"))
        self.preview_mode_combo = QComboBox()
        self.preview_mode_combo.addItems(["Off", "1 Image", "3 Images"])
        self.preview_mode_combo.setCurrentText(self.app_config.get("folder_preview_mode"))
        self.preview_mode_combo.currentTextChanged.connect(lambda t: self.app_config.set("folder_preview_mode", t))
        self.preview_mode_combo.setFixedWidth(150)
        h2.addWidget(self.preview_mode_combo)
        h2.addStretch()
        cl.addLayout(h2)
        
        layout.addWidget(card)
        layout.addStretch()
        
        # Easter Egg
        danger_btn = QPushButton("매우 위험한 버튼")
        danger_btn.setProperty("class", "Danger")
        danger_btn.clicked.connect(lambda: webbrowser.open("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        layout.addWidget(danger_btn, 0, Qt.AlignmentFlag.AlignCenter)
        
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        layout.addWidget(close_btn, 0, Qt.AlignmentFlag.AlignRight)

class FloatingPreview(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.Tool | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.resize(300, 300)
        
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        
        self.frame = QFrame()
        self.frame.setStyleSheet("""
            QFrame {
                background-color: #1E1E1E;
                border: 2px solid #0A84FF;
                border-radius: 10px;
            }
        """)
        self.layout.addWidget(self.frame)
        
        fl = QVBoxLayout(self.frame)
        fl.setContentsMargins(2, 2, 2, 2)
        
        # Header for dragging
        self.header = QWidget()
        self.header.setStyleSheet("background: transparent;")
        hl = QHBoxLayout(self.header)
        hl.setContentsMargins(5, 5, 5, 5)
        hl.addWidget(QLabel("Live Preview", styleSheet="color: #DDD; font-weight: bold; border: none;"))
        hl.addStretch()
        
        close_btn = QPushButton("✕")
        close_btn.setFixedSize(20, 20)
        close_btn.setStyleSheet("color: #AAA; border: none; font-weight: bold; background: transparent;")
        close_btn.clicked.connect(self.hide)
        hl.addWidget(close_btn)
        
        fl.addWidget(self.header)
        
        self.label = QLabel("Waiting...")
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setStyleSheet("border: none; color: #555;")
        self.label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        fl.addWidget(self.label)
        
        self.old_pos = None

    def setPixmap(self, pixmap):
        self.label.setPixmap(pixmap)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.old_pos = event.globalPosition().toPoint()

    def mouseMoveEvent(self, event):
        if self.old_pos:
            delta = event.globalPosition().toPoint() - self.old_pos
            self.move(self.pos() + delta)
            self.old_pos = event.globalPosition().toPoint()

    def mouseReleaseEvent(self, event):
        self.old_pos = None

class FavoritesManager:
    def __init__(self, file_path="favorites.json"):
        self.file_path = os.path.join(os.getcwd(), file_path)
        self.favorites = self.load() # Set of paths

    def load(self):
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return set(data)
            except:
                return set()
        return set()

    def save(self):
        try:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(list(self.favorites), f, indent=4)
        except Exception as e:
            print(f"Error saving favorites: {e}")

    def add(self, path):
        self.favorites.add(path)
        self.save()

    def remove(self, path):
        if path in self.favorites:
            self.favorites.remove(path)
            self.save()

    def is_favorite(self, path):
        return path in self.favorites

    def toggle(self, path):
        if path in self.favorites:
            self.remove(path)
            return False
        else:
            self.add(path)
            return True



class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ComfyEmotionGen Pro")
        self.resize(1100, 800)
        
        self.app_config = AppConfigManager()
        self.config_manager = CharacterConfigManager()
        
        self.base_output_dir = os.path.join(os.getcwd(), "output")
        if not os.path.exists(self.base_output_dir): os.makedirs(self.base_output_dir)


        self.favorites_manager = FavoritesManager()
        
        # Load Workflow
        try:
            with open("workflow.json", "r", encoding="utf-8") as f: self.base_workflow = json.load(f)
        except: self.base_workflow = {}
        
        self.comfy_client = ComfyClient(server_address=self.app_config.get("server_address"))
        self.job_queue = [] # List of JobQueueItem
        self.setup_ui()
        self.refresh_character_list()
        
        # Initial Connection Check (Async)
        self.check_connection()

    def check_connection(self):
        # We'll use a simple QThread or just a timer to check so we don't freeze startup
        # For simplicity, let's just use requests in a non-blocking way if possible, or a quick thread.
        # Since we are already using threads, let's just fire a quick check.
        import threading
        def check():
            try:
                import requests
                url = f"http://{self.comfy_client.server_address}/system_stats"
                requests.get(url, timeout=2)
                # If success, update UI in main thread? 
                # We can't update UI from this thread directly without signals.
                # But we can just print for now or use QTimer.
                # Let's just set the title or status bar if it exists.
                # We need a signal.
                pass 
            except:
                pass 
        
        # Actually, let's just do it in the UI construction phase with a "Connect" button in settings,
        # OR just show "Ready" and let it fail if it fails.
        # But user requested UX improvement. 
        # Better: Add a "Status" indicator in the sidebar or top bar that updates.
        pass

    def setup_ui(self):
        central_widget = QWidget()
        central_widget.setObjectName("CentralWidget")
        self.setCentralWidget(central_widget)
        
        # Main Horizontal Layout
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # --- Sidebar Container ---
        sidebar_container = QWidget()
        sidebar_container.setObjectName("SidebarContainer")
        # sidebar_container.setStyleSheet(...) # Stylesheet handles global look, but object name is key
        sidebar_container.setFixedWidth(250)
        
        sidebar_layout = QVBoxLayout(sidebar_container)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)
        
        # App Logo/Title Area
        title_lbl = QLabel("Comfy\nEmotionGen")
        title_lbl.setStyleSheet("color: #FFF; font-size: 20px; font-weight: bold; padding: 30px 20px;")
        title_lbl.setAlignment(Qt.AlignmentFlag.AlignLeft)
        sidebar_layout.addWidget(title_lbl)
        
        # Nav List
        self.nav_list = QListWidget()
        self.nav_list.setObjectName("Sidebar") # Reuses updated stylesheet
        self.nav_list.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        
        item_studio = QListWidgetItem(" 🎨 Studio")
        item_studio.setSizeHint(QSize(0, 50))
        self.nav_list.addItem(item_studio)
        
        item_gallery = QListWidgetItem(" 🖼️ Gallery")
        item_gallery.setSizeHint(QSize(0, 50))
        self.nav_list.addItem(item_gallery)
        
        sidebar_layout.addWidget(self.nav_list)
        
        # Settings Button at Bottom
        settings_btn = QPushButton("⚙️ Settings")
        settings_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        settings_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: none;
                color: #888;
                text-align: left;
                padding: 15px 25px;
                font-size: 16px;
            }
            QPushButton:hover {
                color: #FFF;
                background-color: #252525;
            }
        """)
        settings_btn.clicked.connect(self.open_settings)
        sidebar_layout.addWidget(settings_btn)
        
        main_layout.addWidget(sidebar_container)

        # --- Content Area ---
        content_container = QWidget()
        content_layout = QVBoxLayout(content_container)
        content_layout.setContentsMargins(0, 0, 0, 0) # Zero margins
        content_layout.setSpacing(0)
        
        self.stack = QStackedWidget()
        content_layout.addWidget(self.stack)
        
        main_layout.addWidget(content_container)

        # Gen Tab
        self.gen_tab = QWidget()
        self.setup_gen_tab()
        self.stack.addWidget(self.gen_tab)

        # Gallery Tab
        self.gallery_tab = GalleryTab(self, self.app_config, self.favorites_manager, self.base_output_dir)
        self.stack.addWidget(self.gallery_tab)
        
        # Connect
        self.nav_list.currentRowChanged.connect(self.on_sidebar_changed)
        self.nav_list.setCurrentRow(0)

    def on_sidebar_changed(self, index):
        self.stack.setCurrentIndex(index)
        if index == 1: # Gallery
            self.gallery_tab.scan_output_folder()

    def open_settings(self):
        dlg = SettingsDialog(self.app_config, self)
        dlg.exec()



    def setup_gen_tab(self):
        # Initialize PIP if needed
        if not hasattr(self, 'pip_preview'):
            self.pip_preview = FloatingPreview(None)
        
        # Main Layout for Gen Tab (Vertical now, because Toolbar is at top)
        # Actually, let's keep it consistent: Gen Tab is the container.
        # Structure:
        # [ Top Toolbar ]
        # [ Splitter (Controls | Preview) ]
        
        gen_layout = QVBoxLayout(self.gen_tab)
        gen_layout.setContentsMargins(0, 0, 0, 0)
        gen_layout.setSpacing(0)

        # ==========================================
        # 1. TOP TOOLBAR
        # ==========================================
        self.top_toolbar = QWidget()
        self.top_toolbar.setObjectName("TopToolbar")
        self.top_toolbar.setFixedHeight(60) # Fixed height for toolbar feel
        tb_layout = QHBoxLayout(self.top_toolbar)
        tb_layout.setContentsMargins(20, 0, 20, 0)
        tb_layout.setSpacing(15)

        # --- Left: Character & Profile ---
        tb_layout.addWidget(QLabel("Character:"))
        self.char_select_combo = QComboBox()
        self.char_select_combo.setFixedWidth(200)
        self.char_select_combo.currentIndexChanged.connect(self.load_character_profile)
        tb_layout.addWidget(self.char_select_combo)
        
        save_btn = QPushButton("💾")
        save_btn.setToolTip("Save Profile")
        save_btn.setFixedSize(40, 40)
        save_btn.setStyleSheet("font-size: 20px; padding: 0px;") 
        save_btn.clicked.connect(self.save_character_profile)
        tb_layout.addWidget(save_btn)
        
        new_btn = QPushButton("✨")
        new_btn.setToolTip("New Profile")
        new_btn.setFixedSize(40, 40)
        new_btn.setStyleSheet("font-size: 20px; padding: 0px;")
        new_btn.clicked.connect(self.new_character_profile)
        tb_layout.addWidget(new_btn)
        
        # Separator
        line1 = QFrame(); line1.setFrameShape(QFrame.Shape.VLine); line1.setStyleSheet("color: #444;")
        tb_layout.addWidget(line1)

        # --- Center: Execution Controls ---
        # Batch
        tb_layout.addWidget(QLabel("Batch:"))
        self.batch_count_spin = QSpinBox(); self.batch_count_spin.setRange(1, 50); self.batch_count_spin.setValue(1); self.batch_count_spin.setFixedWidth(60)
        tb_layout.addWidget(self.batch_count_spin)

        # Seed
        tb_layout.addWidget(QLabel("Seed:"))
        self.seed_input = QLineEdit(); self.seed_input.setPlaceholderText("-1"); self.seed_input.setText("-1"); self.seed_input.setFixedWidth(100)
        tb_layout.addWidget(self.seed_input)
        dice_btn = QPushButton("🎲")
        dice_btn.setToolTip("Random Seed")
        dice_btn.setFixedSize(40, 40)
        dice_btn.setStyleSheet("font-size: 20px; padding: 0px;")
        dice_btn.clicked.connect(lambda: self.seed_input.setText("-1"))
        tb_layout.addWidget(dice_btn)

        # Big Buttons
        self.generate_btn = QPushButton("▶ Generate")
        self.generate_btn.setProperty("class", "Primary")
        self.generate_btn.setFixedHeight(36)
        self.generate_btn.clicked.connect(self.handle_generate)
        tb_layout.addWidget(self.generate_btn)

        self.stop_btn = QPushButton("⏹ Stop")
        self.stop_btn.setProperty("class", "Danger")
        self.stop_btn.setFixedHeight(36)
        self.stop_btn.clicked.connect(self.handle_stop)
        self.stop_btn.setEnabled(False)
        tb_layout.addWidget(self.stop_btn)

        self.test_btn = QPushButton("🧪 Test")
        self.test_btn.setFixedHeight(36)
        self.test_btn.setToolTip("Generate 1 image (Happy) without saving")
        self.test_btn.clicked.connect(self.handle_test_generate)
        tb_layout.addWidget(self.test_btn)

        tb_layout.addStretch() # Spacer

        # --- Right: View & Lang ---
        pip_btn = QPushButton("Pip")
        pip_btn.setCheckable(True)
        pip_btn.clicked.connect(self.toggle_pip)
        tb_layout.addWidget(pip_btn)
        
        self.lang_btn = QPushButton("KR/EN")
        self.lang_btn.setFixedWidth(60)
        self.lang_btn.clicked.connect(self.toggle_language)
        tb_layout.addWidget(self.lang_btn)
        
        gen_layout.addWidget(self.top_toolbar)
        
        # --- Progress Bar Strip (Just below toolbar) ---
        self.progress_bar = QProgressBar()
        self.progress_bar.setFixedHeight(4)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setStyleSheet("background: transparent; border: none; border-radius: 0px;") 
        # We need to style the chunk specifically for this thin bar or keep global
        gen_layout.addWidget(self.progress_bar)

        # ==========================================
        # 2. MAIN CONTENT SPLITTER
        # ==========================================
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setHandleWidth(1)
        splitter.setStyleSheet("QSplitter::handle { background: #38383A; }")
        gen_layout.addWidget(splitter)

        # --- LEFT PANEL: Configuration (Inspector) ---
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(20, 20, 20, 20)
        left_layout.setSpacing(15)
        splitter.addWidget(left_panel)

        # Config Tabs
        self.config_tabs = QTabWidget()
        self.config_tabs.setStyleSheet("""
            QTabWidget::pane { border: 1px solid #38383A; background: #2C2C2E; border-radius: 8px; }
            QTabBar::tab { background: transparent; color: #888; padding: 6px 16px; border-radius: 14px; margin-right: 4px; border: 1px solid transparent; }
            QTabBar::tab:selected { background: #636366; color: #FFF; font-weight: bold; }
            QTabBar::tab:hover:!selected { background: rgba(255,255,255,0.05); }
        """)
        
        # Tab 1: Identity
        tab_identity = QWidget()
        grid_id = QGridLayout(tab_identity)
        grid_id.setContentsMargins(20, 20, 20, 20)
        grid_id.setSpacing(15)

        # 1. Character Name
        grid_id.addWidget(QLabel("Character Name:"), 0, 0)
        self.char_name_input = QLineEdit()
        self.char_name_input.setPlaceholderText("e.g. My Character")
        grid_id.addWidget(self.char_name_input, 0, 1)

        # 2. Reference Image Input
        grid_id.addWidget(QLabel("Reference Image:"), 1, 0)
        
        ref_input_container = QWidget()
        ref_layout = QHBoxLayout(ref_input_container)
        ref_layout.setContentsMargins(0,0,0,0)
        ref_layout.setSpacing(5)
        
        self.ref_img_path = QLineEdit()
        self.ref_img_path.setReadOnly(True)
        self.ref_img_path.setPlaceholderText("Select an image...")
        
        browse_btn = QPushButton("📂")
        browse_btn.setFixedSize(40, 30)
        browse_btn.setToolTip("Browse Image")
        browse_btn.clicked.connect(self.browse_ref_image)
        
        clear_ref_btn = QPushButton("❌")
        clear_ref_btn.setFixedSize(40, 30)
        clear_ref_btn.setToolTip("Clear Image")
        clear_ref_btn.clicked.connect(lambda: (self.ref_img_path.clear(), self.update_ref_preview(None)))

        ref_layout.addWidget(self.ref_img_path)
        ref_layout.addWidget(browse_btn)
        ref_layout.addWidget(clear_ref_btn)
        
        grid_id.addWidget(ref_input_container, 1, 1)

        # 3. Preview Image (Right side, spanning rows)
        preview_container = QFrame()
        preview_container.setStyleSheet("background: #1C1C1E; border: 1px solid #38383A; border-radius: 8px;")
        p_layout = QVBoxLayout(preview_container)
        p_layout.setContentsMargins(0,0,0,0)
        
        self.ref_preview = QLabel("No Image")
        self.ref_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.ref_preview.setMinimumSize(150, 150) # Minimum size
        self.ref_preview.setScaledContents(False) # Handle scaling manually or let layout do it
        
        p_layout.addWidget(self.ref_preview)
        
        # Add to grid at column 2, spanning 3 rows
        grid_id.addWidget(preview_container, 0, 2, 3, 1)
        
        # Column stretch
        grid_id.setColumnStretch(1, 2) # Inputs get space
        grid_id.setColumnStretch(2, 1) # Preview gets space
        
        # Add a spacer at bottom to push everything up
        grid_id.setRowStretch(2, 1)
        
        self.config_tabs.addTab(tab_identity, localized_text("Identity"))
        
        # Tab 2: Reference Settings
        tab_ref = QWidget()
        tr = QVBoxLayout(tab_ref); tr.setSpacing(15); tr.setContentsMargins(20,20,20,20)
        self.ref_enabled_chk = QCheckBox(localized_text("Enable Reference (IPAdapter)"))
        self.ref_enabled_chk.setMinimumHeight(24)
        self.ref_enabled_chk.setChecked(True)
        self.ref_enabled_chk.toggled.connect(lambda c: self.ref_settings_frame.setVisible(c))
        tr.addWidget(self.ref_enabled_chk)
        self.ref_settings_frame = QFrame()
        self.ref_settings_frame.setStyleSheet("background: #252525; border-radius: 6px; padding: 5px;")
        ref_grid = QGridLayout(self.ref_settings_frame)
        ref_grid.setContentsMargins(10, 10, 10, 10)
        ref_grid.setSpacing(10)
        
        # Helper to add label with help (Same as before)
        def add_param(row, col, name_key, tooltip_key, widget, colspan=1):
            h = QHBoxLayout()
            h.setContentsMargins(0,0,0,0)
            h.setSpacing(2)
            lbl = QLabel(localized_text(name_key))
            h.addWidget(lbl)
            if tooltip_key:
                h.addWidget(HelpMarker(tooltip_key))
            h.addStretch()
            ref_grid.addLayout(h, row, col)
            ref_grid.addWidget(widget, row, col+1, 1, colspan)

        self.ref_weight_spin = QDoubleSpinBox(); self.ref_weight_spin.setRange(0, 5); self.ref_weight_spin.setSingleStep(0.1); self.ref_weight_spin.setValue(1.0)
        add_param(0, 0, "Weight", "tip_weight", self.ref_weight_spin)
        
        self.ref_faceidv2_spin = QDoubleSpinBox(); self.ref_faceidv2_spin.setRange(0, 5); self.ref_faceidv2_spin.setSingleStep(0.1); self.ref_faceidv2_spin.setValue(1.0)
        add_param(0, 2, "FaceID v2", "tip_faceid", self.ref_faceidv2_spin)
        
        self.ref_type_combo = QComboBox(); self.ref_type_combo.addItems(["linear", "ease in", "ease out", "weak input", "strong input"])
        add_param(1, 0, "Type", "tip_type", self.ref_type_combo)

        self.ref_combine_combo = QComboBox(); self.ref_combine_combo.addItems(["add", "concat", "subtract", "average", "norm average"])
        add_param(1, 2, "Combine", "tip_combine", self.ref_combine_combo)
        
        self.ref_start_spin = QDoubleSpinBox(); self.ref_start_spin.setRange(0, 1); self.ref_start_spin.setSingleStep(0.05); self.ref_start_spin.setValue(0.0)
        add_param(2, 0, "Start At", "tip_start", self.ref_start_spin)
        
        self.ref_end_spin = QDoubleSpinBox(); self.ref_end_spin.setRange(0, 1); self.ref_end_spin.setSingleStep(0.05); self.ref_end_spin.setValue(1.0)
        add_param(2, 2, "End At", "tip_end", self.ref_end_spin)
        
        self.ref_scaling_combo = QComboBox(); self.ref_scaling_combo.addItems(["V only", "K+V", "K+V w/ C penalty", "K+mean(V) w/ C penalty"])
        
        h_sc = QHBoxLayout(); h_sc.setContentsMargins(0,0,0,0); h_sc.setSpacing(2)
        h_sc.addWidget(QLabel(localized_text("Scaling")))
        h_sc.addWidget(HelpMarker("tip_scaling"))
        h_sc.addStretch()
        ref_grid.addLayout(h_sc, 3, 0)
        ref_grid.addWidget(self.ref_scaling_combo, 3, 1, 1, 3)

        tr.addWidget(self.ref_settings_frame)
        tr.addStretch()
        self.config_tabs.addTab(tab_ref, localized_text("Reference"))
        
        # Tab 3: Prompting
        tab_prompt = QWidget()
        tl2 = QVBoxLayout(tab_prompt)
        tl2.setSpacing(10)
        tl2.setContentsMargins(20, 20, 20, 20)

        # Quality
        tl2.addWidget(QLabel("✨ Quality Prompt"))
        self.quality_prompt_input = QTextEdit()
        self.quality_prompt_input.setMaximumHeight(45)
        self.quality_prompt_input.setPlaceholderText("best quality, masterpiece, 8k, highres")
        tl2.addWidget(self.quality_prompt_input)

        # Subject
        tl2.addWidget(QLabel("👤 Subject Prompt (#emotion# tag required)"))
        self.subject_prompt_input = QTextEdit()
        self.subject_prompt_input.setPlaceholderText("1girl, solo, #emotion#")
        tl2.addWidget(self.subject_prompt_input)

        # Style
        tl2.addWidget(QLabel("🎨 Style/Artist Prompt"))
        self.style_prompt_input = QTextEdit()
        self.style_prompt_input.setMaximumHeight(45)
        self.style_prompt_input.setPlaceholderText("anime style, by artgerm, vibrant colors")
        tl2.addWidget(self.style_prompt_input)

        # Negative
        tl2.addWidget(QLabel("🚫 Negative Prompt"))
        self.neg_prompt_input = QTextEdit()
        self.neg_prompt_input.setMaximumHeight(60)
        tl2.addWidget(self.neg_prompt_input)

        self.config_tabs.addTab(tab_prompt, "📝 Prompting")

        # Tab 4: Emotion Worklist
        tab_emotions = QWidget()
        wl = QVBoxLayout(tab_emotions); wl.setContentsMargins(15,15,15,15)
        wh = QHBoxLayout()
        wh.addStretch()
        imp_btn = QPushButton("📂 Import"); imp_btn.clicked.connect(self.import_emotions)
        wh.addWidget(imp_btn)
        exp_btn = QPushButton("💾 Export"); exp_btn.clicked.connect(self.export_emotions)
        wh.addWidget(exp_btn)
        add_btn = QPushButton("➕ Add"); add_btn.clicked.connect(lambda: self.add_emotion_row_data("New", "prompt"))
        wh.addWidget(add_btn)
        rem_btn = QPushButton("➖ Remove"); rem_btn.setProperty("class", "Danger"); rem_btn.clicked.connect(self.remove_emotion_row)
        wh.addWidget(rem_btn)
        wl.addLayout(wh)
        
        self.emotion_table = QTableWidget(0, 2)
        self.emotion_table.setHorizontalHeaderLabels(["Emotion Name", "Prompt Modifier"])
        header = self.emotion_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Interactive)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.emotion_table.setColumnWidth(0, 200)
        self.emotion_table.verticalHeader().setVisible(False)
        self.emotion_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        wl.addWidget(self.emotion_table)
        self.config_tabs.addTab(tab_emotions, "🎭 Emotions")
        
        # Tab 5: Advanced
        tab_adv = QWidget()
        tl3 = QGridLayout(tab_adv); tl3.setSpacing(15); tl3.setContentsMargins(20,20,20,20)
        tl3.addWidget(QLabel("Primary Sampler"), 0, 0)
        self.sampler1_combo = QComboBox(); self.sampler1_combo.addItems(["dpmpp_3m_sde", "euler", "euler_ancestral", "heun", "dpm_2", "dpmpp_2m", "ddpm"])
        tl3.addWidget(self.sampler1_combo, 0, 1)
        self.scheduler1_combo = QComboBox(); self.scheduler1_combo.addItems(["simple", "normal", "karras", "exponential", "sgm_uniform"])
        tl3.addWidget(self.scheduler1_combo, 0, 2)
        tl3.addWidget(QLabel("Secondary Sampler"), 1, 0)
        self.sampler2_combo = QComboBox(); self.sampler2_combo.addItems(["dpmpp_3m_sde", "euler", "euler_ancestral", "heun", "dpm_2", "dpmpp_2m", "ddpm"])
        tl3.addWidget(self.sampler2_combo, 1, 1)
        self.scheduler2_combo = QComboBox(); self.scheduler2_combo.addItems(["simple", "normal", "karras", "exponential", "sgm_uniform"])
        tl3.addWidget(self.scheduler2_combo, 1, 2)
        tl3.addWidget(QLabel("Upscale Factor"), 2, 0)
        self.upscale_spin = QDoubleSpinBox(); self.upscale_spin.setRange(1.0, 4.0); self.upscale_spin.setSingleStep(0.1); self.upscale_spin.setValue(1.5)
        tl3.addWidget(self.upscale_spin, 2, 1)
        
        # Resolution Controls
        tl3.addWidget(QLabel("Base Resolution"), 3, 0)
        res_layout = QHBoxLayout()
        self.width_spin = QSpinBox(); self.width_spin.setRange(64, 2048); self.width_spin.setValue(896); self.width_spin.setSingleStep(64)
        self.height_spin = QSpinBox(); self.height_spin.setRange(64, 2048); self.height_spin.setValue(1152); self.height_spin.setSingleStep(64)
        res_layout.addWidget(QLabel("W:"))
        res_layout.addWidget(self.width_spin)
        res_layout.addWidget(QLabel("H:"))
        res_layout.addWidget(self.height_spin)
        tl3.addLayout(res_layout, 3, 1, 1, 2)

        # Sage Attention Bypass
        self.bypass_sage_chk = QCheckBox("Bypass Sage Attention (PathchSageAttentionKJ)")
        self.bypass_sage_chk.setToolTip("Check to bypass/disable the Sage Attention optimization node.\nMay affect speed and VRAM usage.")
        tl3.addWidget(self.bypass_sage_chk, 4, 0, 1, 3)

        tl3.setRowStretch(4, 1)
        self.config_tabs.addTab(tab_adv, "⚙️ Advanced")

        # Tab 6: Job Queue
        tab_queue = QWidget()
        q_layout = QVBoxLayout(tab_queue); q_layout.setContentsMargins(15,15,15,15)
        
        q_btn_h = QHBoxLayout()
        q_btn_h.addWidget(QLabel("Pending Jobs"))
        q_btn_h.addStretch()
        
        clear_q_btn = QPushButton("Trash All")
        clear_q_btn.setProperty("class", "Danger")
        clear_q_btn.clicked.connect(self.clear_queue)
        q_btn_h.addWidget(clear_q_btn)
        q_layout.addLayout(q_btn_h)

        self.queue_table = QTableWidget(0, 4)
        self.queue_table.setHorizontalHeaderLabels(["Character", "Emotions", "Batch", "Status"])
        self.queue_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.queue_table.verticalHeader().setVisible(False)
        self.queue_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        q_layout.addWidget(self.queue_table)
        
        self.config_tabs.addTab(tab_queue, "⏳ Queue")
        
        left_layout.addWidget(self.config_tabs)
        
        # Hidden Log
        self.log_console = QTextEdit()
        self.log_console.setMaximumHeight(0) 
        self.log_console.setVisible(False)
        left_layout.addWidget(self.log_console)

        # --- RIGHT PANEL: Preview ---
        right_panel = QWidget()
        right_panel.setMinimumWidth(400)
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(20, 20, 20, 20)
        
        # Status Bar integrated in Right Panel or independent?
        # Let's put Status Bar at bottom of Right Panel, or maybe Global bottom?
        # For now, put it in Right Panel
        self.status_bar = QLabel("Ready")
        self.status_bar.setStyleSheet("color: #888; font-size: 12px; margin-bottom: 5px;")
        self.status_bar.setAlignment(Qt.AlignmentFlag.AlignRight)
        right_layout.addWidget(self.status_bar)

        # Card container for image
        preview_card = QFrame()
        preview_card.setProperty("class", "Card")
        preview_card.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        pc_layout = QVBoxLayout(preview_card)
        pc_layout.setContentsMargins(0, 0, 0, 0)
        
        self.live_preview_label = ResizingLabel()
        self.live_preview_label.setStyleSheet("background: #000; border-radius: 8px;")
        
        pc_layout.addWidget(self.live_preview_label)
        right_layout.addWidget(preview_card)

        # Add Right Panel to Splitter
        splitter.addWidget(right_panel)

        # Initial splitter sizes
        splitter.setStretchFactor(0, 4) # Left
        splitter.setStretchFactor(1, 6) # Right
        splitter.setCollapsible(0, False)
        splitter.setCollapsible(1, False)

    def handle_generate(self):
        # Combine Prompts
        qual = self.quality_prompt_input.toPlainText().strip()
        subj = self.subject_prompt_input.toPlainText().strip()
        style = self.style_prompt_input.toPlainText().strip()
        
        parts = [p for p in [qual, subj, style] if p]
        base_prompt = ", ".join(parts)

        # Validation
        if "#emotion#" not in base_prompt:
            return QMessageBox.warning(self, "Validation Error", "Combined Prompt must contain '#emotion#'. (Check Subject Prompt)")
            
        if self.emotion_table.rowCount() == 0:
            return QMessageBox.warning(self, "Validation Error", "Worklist is empty.")
            
        # Gather Data
        emotions = []
        for r in range(self.emotion_table.rowCount()):
            emotions.append((self.emotion_table.item(r,0).text(), self.emotion_table.item(r,1).text()))
            
        gen_settings = {
            "sampler1_name": self.sampler1_combo.currentText(),
            "scheduler1": self.scheduler1_combo.currentText(),
            "sampler2_name": self.sampler2_combo.currentText(),
            "scheduler2": self.scheduler2_combo.currentText(),
            "upscale_factor": self.upscale_spin.value(),
            "width": self.width_spin.value(),
            "height": self.height_spin.value(),
            "bypass_sage_attn": self.bypass_sage_chk.isChecked()
        }
        
        ref_settings = {
            "weight": self.ref_weight_spin.value(),
            "weight_faceidv2": self.ref_faceidv2_spin.value(),
            "weight_type": self.ref_type_combo.currentText(),
            "combine_embeds": self.ref_combine_combo.currentText(),
            "start_at": self.ref_start_spin.value(),
            "end_at": self.ref_end_spin.value(),
            "embeds_scaling": self.ref_scaling_combo.currentText()
        }
        
        job = JobQueueItem(
            self.char_name_input.text(),
            base_prompt,
            self.neg_prompt_input.toPlainText(),
            emotions,
            self.ref_img_path.text(),
            self.batch_count_spin.value(),
            self.seed_input.text(),
            gen_settings,
            self.ref_enabled_chk.isChecked(),
            ref_settings,
            is_test=False
        )
        
        self.job_queue.append(job)
        self.refresh_queue_ui()
        
        # Start Worker if not running
        if not hasattr(self, 'worker') or not self.worker.isRunning():
            self.start_worker_thread()
        else:
            self.status_bar.setText("Job added to running queue.")

    def handle_test_generate(self):
        # Quick Generate with Happy emotion, single batch, no save
        qual = self.quality_prompt_input.toPlainText().strip()
        subj = self.subject_prompt_input.toPlainText().strip()
        style = self.style_prompt_input.toPlainText().strip()
        
        parts = [p for p in [qual, subj, style] if p]
        base_prompt = ", ".join(parts)

        if "#emotion#" not in base_prompt:
             return QMessageBox.warning(self, "Validation Error", "Combined Prompt must contain '#emotion#'.")

        gen_settings = {
            "sampler1_name": self.sampler1_combo.currentText(),
            "scheduler1": self.scheduler1_combo.currentText(),
            "sampler2_name": self.sampler2_combo.currentText(),
            "scheduler2": self.scheduler2_combo.currentText(),
            "upscale_factor": self.upscale_spin.value(),
            "width": self.width_spin.value(),
            "height": self.height_spin.value()
        }
        
        ref_settings = {
            "weight": self.ref_weight_spin.value(),
            "weight_faceidv2": self.ref_faceidv2_spin.value(),
            "weight_type": self.ref_type_combo.currentText(),
            "combine_embeds": self.ref_combine_combo.currentText(),
            "start_at": self.ref_start_spin.value(),
            "end_at": self.ref_end_spin.value(),
            "embeds_scaling": self.ref_scaling_combo.currentText()
        }

        job = JobQueueItem(
            self.char_name_input.text(),
            base_prompt,
            self.neg_prompt_input.toPlainText(),
            [("Test", "happy")], # Force happy emotion
            self.ref_img_path.text(),
            1, # Force batch 1
            "-1",
            gen_settings,
            self.ref_enabled_chk.isChecked(),
            ref_settings,
            is_test=True
        )
        
        self.job_queue.append(job)
        self.refresh_queue_ui()
        
        if not hasattr(self, 'worker') or not self.worker.isRunning():
            self.start_worker_thread()

    def handle_stop(self):
        if hasattr(self, 'worker') and self.worker.isRunning():
            self.stop_btn.setEnabled(False) # Prevent multiple clicks
            self.status_bar.setText("Stopping...")
            self.worker.stop()

    def start_worker_thread(self):
        # Update Button States
        self.stop_btn.setEnabled(True)
        
        self.status_bar.setText("Processing Queue...")
        self.log_console.clear()
        self.progress_bar.setValue(0)
        # self.step_progress_bar.setValue(0) # Removed in refactor
        
        self.comfy_client.server_address = self.app_config.get("server_address")
        
        self.worker = GenerationWorker(
            self.comfy_client, self.base_workflow,
            self.base_output_dir, self.job_queue
        )
        self.worker.progress_signal.connect(self.progress_bar.setValue)
        # self.worker.step_signal.connect(self.on_step_progress) # We might keep this logic but for now simplify
        self.worker.log_signal.connect(self.update_log_status)
        self.worker.preview_signal.connect(self.update_live_preview)
        self.worker.job_started_signal.connect(self.on_job_started)
        self.worker.finished_signal.connect(self.on_finished)
        self.worker.start()

    def clear_queue(self):
        self.job_queue.clear()
        self.refresh_queue_ui()

    def refresh_queue_ui(self):
        self.queue_table.setRowCount(len(self.job_queue))
        for i, job in enumerate(self.job_queue):
            self.queue_table.setItem(i, 0, QTableWidgetItem(job.char_name))
            emo_str = ", ".join([e[0] for e in job.emotions])
            self.queue_table.setItem(i, 1, QTableWidgetItem(emo_str))
            self.queue_table.setItem(i, 2, QTableWidgetItem(str(job.batch)))
            self.queue_table.setItem(i, 3, QTableWidgetItem(job.status))

    def on_job_started(self, index):
        if index < self.queue_table.rowCount():
            item = self.queue_table.item(index, 3)
            if item is None:
                item = QTableWidgetItem()
                self.queue_table.setItem(index, 3, item)
            item.setText("Running...")
            
            self.queue_table.selectRow(index)
            # Update status of previous jobs to Done
            for i in range(index):
                prev_item = self.queue_table.item(i, 3)
                if prev_item is None:
                    prev_item = QTableWidgetItem()
                    self.queue_table.setItem(i, 3, prev_item)
                prev_item.setText("Done")

    def import_emotions(self):
        f, _ = QFileDialog.getOpenFileName(self, "Import Emotions", "", "JSON Files (*.json)")
        if not f: return
        
        try:
            with open(f, "r", encoding="utf-8") as file:
                data = json.load(file)
            
            if not isinstance(data, list):
                return QMessageBox.warning(self, "Error", "Invalid JSON format. Expected a list.")
            
            # Ask to append or replace
            reply = QMessageBox.question(self, "Import Mode", 
                                         "Do you want to APPEND to existing list or REPLACE it?",
                                         QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No | QMessageBox.StandardButton.Cancel,
                                         QMessageBox.StandardButton.Yes)
            # Yes = Append, No = Replace
            if reply == QMessageBox.StandardButton.Cancel: return
            
            if reply == QMessageBox.StandardButton.No:
                self.emotion_table.setRowCount(0)
            
            for item in data:
                if isinstance(item, dict) and "name" in item and "prompt" in item:
                    self.add_emotion_row_data(item["name"], item["prompt"])
                elif isinstance(item, list) and len(item) >= 2:
                    self.add_emotion_row_data(item[0], item[1])
                    
            QMessageBox.information(self, "Success", "Emotions imported successfully!")
            
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to import: {e}")

    def export_emotions(self):
        emotions = []
        for r in range(self.emotion_table.rowCount()):
            name = self.emotion_table.item(r, 0).text()
            prompt = self.emotion_table.item(r, 1).text()
            emotions.append({"name": name, "prompt": prompt})
            
        if not emotions:
            return QMessageBox.warning(self, "Warning", "List is empty!")
            
        f, _ = QFileDialog.getSaveFileName(self, "Export Emotions", "emotions.json", "JSON Files (*.json)")
        if not f: return
        
        try:
            with open(f, "w", encoding="utf-8") as file:
                json.dump(emotions, file, indent=4)
            QMessageBox.information(self, "Success", "Emotions exported successfully!")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to export: {e}")



    # --- Logic ---
    def refresh_character_list(self):
        chars = self.config_manager.list_characters()
        self.char_select_combo.blockSignals(True)
        self.char_select_combo.clear()
        self.char_select_combo.addItem("Select Character...")
        self.char_select_combo.addItems(chars)
        self.char_select_combo.blockSignals(False)
        
        last = self.app_config.get("last_active_character")
        if last and last in chars:
            self.char_select_combo.setCurrentText(last)

    def new_character_profile(self):
        self.char_name_input.clear()
        self.ref_img_path.clear()
        self.update_ref_preview(None)
        
        # Reset Prompts
        self.quality_prompt_input.setText("best quality, masterpiece, 8k, highres")
        self.subject_prompt_input.setText("1girl, solo, #emotion#")
        self.style_prompt_input.clear()
        self.neg_prompt_input.clear()
        
        self.sampler1_combo.setCurrentText("dpmpp_3m_sde")
        self.scheduler1_combo.setCurrentText("simple")
        self.sampler2_combo.setCurrentText("dpmpp_3m_sde")
        self.scheduler2_combo.setCurrentText("simple")
        self.upscale_spin.setValue(1.5)
        self.width_spin.setValue(896)
        self.height_spin.setValue(1152)
        
        # Reset Reference Settings
        self.ref_enabled_chk.setChecked(True)
        self.ref_weight_spin.setValue(1.0)
        self.ref_faceidv2_spin.setValue(1.0)
        self.ref_type_combo.setCurrentText("linear")
        self.ref_combine_combo.setCurrentText("add")
        self.ref_start_spin.setValue(0.0)
        self.ref_end_spin.setValue(1.0)
        self.ref_scaling_combo.setCurrentText("V only")
        
        self.emotion_table.setRowCount(0)
        self.char_select_combo.setCurrentIndex(0)
        self.add_emotion_row_data("Happy", "smile")
        self.add_emotion_row_data("Sad", "tears")

    def save_character_profile(self):
        name = self.char_name_input.text().strip()
        if not name: return QMessageBox.warning(self, "Error", "Name required")
        
        emotions = []
        for r in range(self.emotion_table.rowCount()):
            emotions.append((self.emotion_table.item(r,0).text(), self.emotion_table.item(r,1).text()))
        
        data = {
            "name": name,
            "ref_image": self.ref_img_path.text(),
            # Split Prompts
            "quality_prompt": self.quality_prompt_input.toPlainText(),
            "subject_prompt": self.subject_prompt_input.toPlainText(),
            "style_prompt": self.style_prompt_input.toPlainText(),
            "neg_prompt": self.neg_prompt_input.toPlainText(),
            "batch_count": self.batch_count_spin.value(),
            "emotions": emotions,
            "sampler1_name": self.sampler1_combo.currentText(),
            "scheduler1": self.scheduler1_combo.currentText(),
            "sampler2_name": self.sampler2_combo.currentText(),
            "scheduler2": self.scheduler2_combo.currentText(),
            "upscale_factor": self.upscale_spin.value(),
            "width": self.width_spin.value(),
            "height": self.height_spin.value(),
            # Reference Settings
            "ref_enabled": self.ref_enabled_chk.isChecked(),
            "ref_weight": self.ref_weight_spin.value(),
            "ref_faceidv2": self.ref_faceidv2_spin.value(),
            "ref_type": self.ref_type_combo.currentText(),
            "ref_combine": self.ref_combine_combo.currentText(),
            "ref_start": self.ref_start_spin.value(),
            "ref_end": self.ref_end_spin.value(),
            "ref_scaling": self.ref_scaling_combo.currentText()
        }
        if self.config_manager.save_config(name, data):
            self.refresh_character_list()
            self.char_select_combo.setCurrentText(name)
            QMessageBox.information(self, "Saved", "Profile saved!")

    def load_character_profile(self):
        name = self.char_select_combo.currentText()
        if name == "Select Character...": return
        
        self.app_config.set("last_active_character", name)
        
        data = self.config_manager.load_config(name)
        if not data: return
        
        self.char_name_input.setText(data.get("name", ""))
        self.ref_img_path.setText(data.get("ref_image", ""))
        self.update_ref_preview(data.get("ref_image", ""))
        
        # Load Prompts (Backward Compatibility)
        if "base_prompt" in data and "subject_prompt" not in data:
            self.subject_prompt_input.setText(data.get("base_prompt", ""))
            self.quality_prompt_input.setText("best quality, masterpiece, 8k") # Default
            self.style_prompt_input.clear()
        else:
            self.quality_prompt_input.setText(data.get("quality_prompt", ""))
            self.subject_prompt_input.setText(data.get("subject_prompt", ""))
            self.style_prompt_input.setText(data.get("style_prompt", ""))
            
        self.neg_prompt_input.setText(data.get("neg_prompt", ""))
        self.batch_count_spin.setValue(data.get("batch_count", 1))
        
        self.sampler1_combo.setCurrentText(data.get("sampler1_name", "dpmpp_3m_sde"))
        self.scheduler1_combo.setCurrentText(data.get("scheduler1", "simple"))
        self.sampler2_combo.setCurrentText(data.get("sampler2_name", "dpmpp_3m_sde"))
        self.scheduler2_combo.setCurrentText(data.get("scheduler2", "simple"))
        self.upscale_spin.setValue(data.get("upscale_factor", 1.5))
        self.width_spin.setValue(data.get("width", 896))
        self.height_spin.setValue(data.get("height", 1152))
        
        # Load Reference Settings
        self.ref_enabled_chk.setChecked(data.get("ref_enabled", True))
        self.ref_weight_spin.setValue(data.get("ref_weight", 1.0))
        self.ref_faceidv2_spin.setValue(data.get("ref_faceidv2", 1.0))
        self.ref_type_combo.setCurrentText(data.get("ref_type", "linear"))
        self.ref_combine_combo.setCurrentText(data.get("ref_combine", "add"))
        self.ref_start_spin.setValue(data.get("ref_start", 0.0))
        self.ref_end_spin.setValue(data.get("ref_end", 1.0))
        self.ref_scaling_combo.setCurrentText(data.get("ref_scaling", "V only"))
        
        self.emotion_table.setRowCount(0)
        for e in data.get("emotions", []): self.add_emotion_row_data(e[0], e[1])

    def browse_ref_image(self):
        f, _ = QFileDialog.getOpenFileName(self, "Select Image", "", "Images (*.png *.jpg *.jpeg *.webp)")
        if f:
            self.ref_img_path.setText(f)
            self.update_ref_preview(f)

    def update_ref_preview(self, path):
        if path and os.path.exists(path):
            pix = QPixmap(path)
            self.ref_preview.setPixmap(pix.scaled(200, 200, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            self.ref_preview.setText("")
        else:
            self.ref_preview.setPixmap(QPixmap())
            self.ref_preview.setText("No Image")

    def add_emotion_row_data(self, name, prompt):
        r = self.emotion_table.rowCount()
        self.emotion_table.insertRow(r)
        self.emotion_table.setItem(r, 0, QTableWidgetItem(name))
        self.emotion_table.setItem(r, 1, QTableWidgetItem(prompt))

    def remove_emotion_row(self):
        r = self.emotion_table.currentRow()
        if r >= 0: self.emotion_table.removeRow(r)

    def on_step_progress(self, value, max_val):
        pass # Step progress bar removed in refactor
        # self.step_progress_bar.setMaximum(max_val)
        # self.step_progress_bar.setValue(value)

    def update_log_status(self, msg):
        self.log_console.append(msg)
        # Show last log in status bar, truncated
        short_msg = (msg[:80] + '..') if len(msg) > 80 else msg
        self.status_bar.setText(short_msg)

    def update_live_preview(self, data):
        pix = QPixmap()
        pix.loadFromData(data)
        if not pix.isNull():
            # Update PIP
            if hasattr(self, 'pip_preview'):
                self.pip_preview.setPixmap(pix.scaled(300, 300, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
                # Auto-show removed to fix bug where closed PIP reappears

            # Update In-App Preview
            if hasattr(self, 'live_preview_label'):
                # Fit to the label size, keep aspect ratio
                w = self.live_preview_label.width()
                h = self.live_preview_label.height()
                if w > 0 and h > 0:
                    scaled = pix.scaled(w, h, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                    self.live_preview_label.setPixmap(scaled)

    def toggle_pip(self):
        if hasattr(self, 'pip_preview'):
            if self.pip_preview.isVisible():
                self.pip_preview.hide()
            else:
                self.pip_preview.show()

    def on_finished(self):
        self.stop_btn.setEnabled(False)
        
        self.status_bar.setText("Generation Complete (or Stopped).")
        self.status_bar.setText("Generation Complete (or Stopped).")
        # self.step_progress_bar.setValue(0) # Removed
        
        # Only show "Done" if it wasn't a hard crash or something, but usually fine
        # If stopped, user knows.
        if self.worker.is_running: # If it finished naturally
            QMessageBox.information(self, "Done", "Queue Processing Complete!")
        else:
             self.status_bar.setText("Stopped by User.")
             
        self.gallery_tab.scan_output_folder()



    def toggle_language(self):
        global CURRENT_LANG
        new_lang = "ko" if CURRENT_LANG == "en" else "en"
        self.app_config.set("language", new_lang)
        
        msg = "Language changed to Korean. Please restart the application." if new_lang == "ko" else "Language changed to English. Please restart the application."
        QMessageBox.information(self, "Restart Required", msg)
        # In a real app we might call setup_ui() again but clearing layout is messy. Restart is safer.

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyleSheet(MODERN_STYLESHEET)
    w = MainWindow()
    w.show()
    sys.exit(app.exec())
