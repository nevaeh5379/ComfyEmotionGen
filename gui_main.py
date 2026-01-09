import sys
import os

# Ensure current directory is in path for standalone python_embed
if os.path.dirname(os.path.abspath(__file__)) not in sys.path:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
import shutil
import re
import webbrowser
import tempfile
import subprocess
from tag_parser import TagParser
from danbooru_tags import get_danbooru_tags
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QLabel, QLineEdit, QPushButton, QTextEdit, QSpinBox, 
                             QTableWidget, QTableWidgetItem, QHeaderView, QProgressBar, 
                             QFileDialog, QTabWidget, QListWidget, QListWidgetItem, 
                             QAbstractItemView, QMessageBox, QSplitter, QComboBox, QFrame, QGridLayout, QSizePolicy, QDialog, QScrollArea, QCheckBox, QDoubleSpinBox, QStackedWidget, QMenu, QCompleter, QStyledItemDelegate)
from PyQt6.QtCore import (Qt, QThread, pyqtSignal, QSize, QEvent, QMimeData, QUrl, QPoint, QStringListModel, QTimer)
from PyQt6.QtGui import (QIcon, QPixmap, QFont, QAction, QWheelEvent, QPalette, QPainter, QColor, QBrush, QPen, QDrag, QSyntaxHighlighter, QTextCharFormat)

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
    def __init__(self, char_name, base_prompt, neg_prompt, custom_tags, ref_img, batch, seed, gen_settings, ref_enabled, ref_settings, is_test=False, toggles=None):
        self.char_name = char_name
        self.base_prompt = base_prompt
        self.neg_prompt = neg_prompt
        self.custom_tags = custom_tags  # Dict: {"tag_name": ["value1", "value2"], ...}
        self.ref_img = ref_img
        self.batch = batch
        self.seed = seed
        self.gen_settings = gen_settings
        self.ref_enabled = ref_enabled
        self.ref_settings = ref_settings
        self.is_test = is_test
        self.toggles = toggles or {} # Dict: {"var_name": True/False}
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

                # Generate all tag combinations using TagParser
                parser = TagParser(job.custom_tags)
                all_combinations = parser.generate_combinations(job.base_prompt, toggles=job.toggles)
                
                print(f"DEBUG: Worker - Combinations: {len(all_combinations)}, Batch: {job.batch}")
                
                total_steps = len(all_combinations) * job.batch
                current_step = 0
                
                for tag_values in all_combinations:
                    if not self.is_running: break
                    
                    # Merge toggles into tag_values for logic processing
                    current_values = tag_values.copy()
                    
                    if hasattr(job, 'toggles') and job.toggles:
                         print(f"DEBUG: Applying toggles to generation: {job.toggles}")
                         current_values.update(job.toggles)
                    else:
                         print("DEBUG: No toggles found in job object.")
                    
                    print(f"DEBUG: Final tag values for processing: {current_values}")
                    
                    # Process prompt with this combination
                    final_prompt = parser.process_prompt(job.base_prompt, current_values)
                    print(f"DEBUG: FINAL PROMPT >> '{final_prompt}'")
                    
                    # Create a safe name for this combination (for folder/filename)
                    combo_values = [v for v in tag_values.values() if v and isinstance(v, str)]
                    combo_name = "_".join([self.clean_name(v) for v in combo_values]) if combo_values else "default"
                    
                    if job.is_test:
                        combo_dir = char_dir
                    else:
                        combo_dir = char_dir  # Flat structure - all in char folder
                    
                    if not os.path.exists(combo_dir): os.makedirs(combo_dir)

                    for i in range(job.batch):
                        if not self.is_running: break
                        
                        current_seed = seeds[i]
                        self.log_signal.emit(f"Generating: {combo_name} ({i+1}/{job.batch}) - Seed: {current_seed}")
                        
                        # Pass the substituted prompt to workflow
                        new_workflow, used_seed = prepare_workflow(
                            self.workflow_json, job.char_name, final_prompt, combo_name, "", ref_filename, current_seed,
                            sampler1_name=job.gen_settings.get("sampler1_name", "dpmpp_3m_sde"),
                            scheduler1=job.gen_settings.get("scheduler1", "simple"),
                            sampler2_name=job.gen_settings.get("sampler2_name", "dpmpp_3m_sde"),
                            scheduler2=job.gen_settings.get("scheduler2", "simple"),
                            upscale_factor=job.gen_settings.get("upscale_factor", 1.5),
                            ref_enabled=job.ref_enabled,
                            ref_settings=job.ref_settings,
                            width=job.gen_settings.get("width", 896),
                            height=job.gen_settings.get("height", 1152),
                            bypass_sage_attn=job.gen_settings.get("bypass_sage_attn", False),
                            ckpt_name=job.gen_settings.get("ckpt_name"),
                            ipadapter_model=job.gen_settings.get("ipadapter_model"),
                            clip_vision_model=job.gen_settings.get("clip_vision_model")
                        )
                        
                        prompt_id = self.client.queue_prompt(new_workflow)
                        result = self.client.wait_for_result(prompt_id, callback=ws_callback)
                        
                        if result:
                            fname, sub, typ = result
                            if job.is_test:
                                target_filename = "test_preview.png"
                            else:
                                target_filename = f"{char_safe_name}__{combo_name}__Seed{used_seed}__{i+1}.png"
                            self.client.download_image(fname, sub, os.path.join(combo_dir, target_filename))
                            self.log_signal.emit(f"Saved: {target_filename}")
                            
                            try:
                                with open(os.path.join(combo_dir, target_filename), "rb") as f:
                                    self.preview_signal.emit(f.read())
                            except: pass
                        
                        current_step += 1
                        self.progress_signal.emit(int((current_step / total_steps) * 100))
                
                # Mark job as Done
                if self.is_running:
                    job.status = "Done"
                    self.job_started_signal.emit(-1) # Signal to refresh UI status
                    
                    # Remove from queue
                    if self.job_queue:
                        self.job_queue.pop(0)

            self.log_signal.emit("All Jobs Done.")
        except Exception as e:
            self.log_signal.emit(f"Error: {e}")
            import traceback
            traceback.print_exc()
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


class DanbooruAutocompleteDelegate(QStyledItemDelegate):
    """Custom delegate that provides Danbooru tag autocomplete for table cells."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._danbooru = get_danbooru_tags()
    
    def createEditor(self, parent, option, index):
        editor = QLineEdit(parent)
        
        # Only apply autocomplete to second column (Prompt)
        if index.column() == 1 and self._danbooru.is_loaded:
            completer = QCompleter(parent)
            completer.setModel(QStringListModel(self._danbooru.get_all_tags()))
            completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
            completer.setFilterMode(Qt.MatchFlag.MatchContains)
            completer.setMaxVisibleItems(15)
            editor.setCompleter(completer)
        
        return editor
    
    def setEditorData(self, editor, index):
        value = index.model().data(index, Qt.ItemDataRole.EditRole)
        editor.setText(str(value) if value else "")
    
    def setModelData(self, editor, model, index):
        model.setData(index, editor.text(), Qt.ItemDataRole.EditRole)


class TagSyntaxHighlighter(QSyntaxHighlighter):
    """Syntax highlighter for tag syntax in prompts."""
    
    def __init__(self, parent, custom_tags_getter=None):
        super().__init__(parent)
        self.custom_tags_getter = custom_tags_getter
        
        # Define formats
        self.tag_format = QTextCharFormat()
        self.tag_format.setForeground(QColor("#4FC3F7"))  # Light blue for {{tag}}
        self.tag_format.setFontWeight(QFont.Weight.Bold)
        
        self.optional_tag_format = QTextCharFormat()
        self.optional_tag_format.setForeground(QColor("#81C784"))  # Green for {{?tag}}
        self.optional_tag_format.setFontWeight(QFont.Weight.Bold)
        
        self.conditional_format = QTextCharFormat()
        self.conditional_format.setForeground(QColor("#FFB74D"))  # Orange for {{$if}}
        self.conditional_format.setFontWeight(QFont.Weight.Bold)
        
        self.comment_format = QTextCharFormat()
        self.comment_format.setForeground(QColor("#888888"))  # Gray for {{#...}}
        self.comment_format.setFontItalic(True)
        
        self.error_format = QTextCharFormat()
        self.error_format.setForeground(QColor("#FF5252"))  # Red text
        self.error_format.setUnderlineColor(QColor("#FF5252"))  # Red underline
        self.error_format.setUnderlineStyle(QTextCharFormat.UnderlineStyle.WaveUnderline)
        self.error_format.setUnderlineStyle(QTextCharFormat.UnderlineStyle.WaveUnderline)
        self.error_format.setFontWeight(QFont.Weight.Bold)
        
        self.toggle_format = QTextCharFormat()
        self.toggle_format.setForeground(QColor("#D500F9"))  # Magenta for {{$toggle}}
        self.toggle_format.setFontWeight(QFont.Weight.Bold)
    
    def _get_defined_tags(self):
        """Get set of defined tag names."""
        if not self.custom_tags_getter:
            return set()
        try:
            tags = self.custom_tags_getter()
            return set(tags.keys()) if tags else set()
        except:
            return set()
    
    def _is_tag_defined(self, tag_name, defined_tags):
        """Check if tag is defined."""
        if not defined_tags:
            return True  # No tags defined = don't show errors
        return tag_name in defined_tags
    
    def highlightBlock(self, text):
        import re
        
        defined_tags = self._get_defined_tags()
        
        # Default all {{...}} patterns to error first (catch-all for invalid syntax)
        # This ensures that any pattern not matched by specific rules below (e.g. typos like {{$ifa...}})
        for match in re.finditer(r'\{\{[^}]*\}\}', text):
             self.setFormat(match.start(), match.end() - match.start(), self.error_format)
             
        # Toggle definitions: {{$toggle name}}
        for match in re.finditer(r'\{\{\$toggle\s+(\w+)\}\}', text):
            self.setFormat(match.start(), match.end() - match.start(), self.toggle_format)
        
        # Required tags: {{tag}}
        for match in re.finditer(r'\{\{(\w+)\}\}', text):
            tag_name = match.group(1)
            if self._is_tag_defined(tag_name, defined_tags):
                self.setFormat(match.start(), match.end() - match.start(), self.tag_format)
            else:
                self.setFormat(match.start(), match.end() - match.start(), self.error_format)
        
        # Optional tags: {{?tag}} - also check if defined
        for match in re.finditer(r'\{\{\?(\w+)\}\}', text):
            tag_name = match.group(1)
            if self._is_tag_defined(tag_name, defined_tags):
                self.setFormat(match.start(), match.end() - match.start(), self.optional_tag_format)
            else:
                self.setFormat(match.start(), match.end() - match.start(), self.error_format)
        
        # Random tags: {{tag:random}}
        for match in re.finditer(r'\{\{(\w+):random\}\}', text):
            tag_name = match.group(1)
            if self._is_tag_defined(tag_name, defined_tags):
                self.setFormat(match.start(), match.end() - match.start(), self.optional_tag_format)
            else:
                self.setFormat(match.start(), match.end() - match.start(), self.error_format)
        
        # Conditionals: {{$if ...}} - Support complex logic (&&, ||)
        # We relax the strict variable check here to allow for complex expressions.
        for match in re.finditer(r'\{\{\$if\s+([^}]+)\}\}', text):
             self.setFormat(match.start(), match.end() - match.start(), self.conditional_format)
        
        # {{$else}} and {{$endif}}
        for match in re.finditer(r'\{\{\$(?:else|endif)\}\}', text):
            self.setFormat(match.start(), match.end() - match.start(), self.conditional_format)
        
        # Comments: {{#...}}
        for match in re.finditer(r'\{\{#[^}]*\}\}', text):
            self.setFormat(match.start(), match.end() - match.start(), self.comment_format)
        
        # Check for malformed syntax (unclosed braces)
        for match in re.finditer(r'\{\{[^}]*$', text):
            self.setFormat(match.start(), match.end() - match.start(), self.error_format)


class AutocompleteTextEdit(QTextEdit):
    """QTextEdit with Danbooru tag autocomplete and syntax highlighting."""
    
    def __init__(self, parent=None, custom_tags_getter=None):
        super().__init__(parent)
        self._danbooru = get_danbooru_tags()
        self._completer = None
        self._custom_tags_getter = custom_tags_getter
        self._setup_completer()
        self._setup_highlighter()
    
    def set_custom_tags_getter(self, getter):
        """Set function to get custom tags for error checking."""
        self._custom_tags_getter = getter
        if hasattr(self, '_highlighter'):
            self._highlighter.custom_tags_getter = getter
            self._highlighter.rehighlight()  # Re-apply highlighting
    
    def refresh_highlighting(self):
        """Force refresh of syntax highlighting."""
        if hasattr(self, '_highlighter'):
            self._highlighter.rehighlight()
    
    def _setup_highlighter(self):
        """Setup syntax highlighter."""
        self._highlighter = TagSyntaxHighlighter(self.document(), self._custom_tags_getter)
    
    def _setup_completer(self):
        if not self._danbooru.is_loaded:
            return
        
        self._completer = QCompleter(self)
        self._completer.setModel(QStringListModel(self._danbooru.get_all_tags()))
        self._completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
        self._completer.setFilterMode(Qt.MatchFlag.MatchContains)
        self._completer.setMaxVisibleItems(12)
        self._completer.setWidget(self)
        self._completer.activated.connect(self._insert_completion)
        
        # Dark theme for popup
        popup = self._completer.popup()
        popup.setStyleSheet("""
            QListView {
                background-color: #2D2D2D;
                color: #FFFFFF;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 2px;
                font-size: 12px;
            }
            QListView::item {
                padding: 4px 8px;
                border-radius: 2px;
            }
            QListView::item:selected {
                background-color: #4FC3F7;
                color: #000000;
            }
            QListView::item:hover {
                background-color: #3A3A3A;
            }
        """)
    
    def _get_current_word(self):
        """Get the word currently being typed (after last comma or start)."""
        cursor = self.textCursor()
        text = self.toPlainText()
        pos = cursor.position()
        
        # Find start of current word (after comma, newline, or start)
        start = pos
        while start > 0 and text[start - 1] not in ',\n':
            start -= 1
        
        word = text[start:pos].strip()
        return word, start, pos
    
    def _insert_completion(self, completion):
        """Insert the selected completion."""
        word, start, pos = self._get_current_word()
        
        cursor = self.textCursor()
        cursor.setPosition(start)
        cursor.setPosition(pos, cursor.MoveMode.KeepAnchor)
        cursor.insertText(completion)
        self.setTextCursor(cursor)
    
    def keyPressEvent(self, event):
        # Handle completer navigation
        if self._completer and self._completer.popup().isVisible():
            if event.key() in (Qt.Key.Key_Enter, Qt.Key.Key_Return, Qt.Key.Key_Tab):
                index = self._completer.popup().currentIndex()
                if index.isValid():
                    self._completer.activated.emit(self._completer.completionModel().data(index))
                    self._completer.popup().hide()
                    return
            elif event.key() == Qt.Key.Key_Escape:
                self._completer.popup().hide()
                return
            elif event.key() in (Qt.Key.Key_Up, Qt.Key.Key_Down):
                self._completer.popup().keyPressEvent(event)
                return
        
        super().keyPressEvent(event)
        
        # Show completions
        if self._completer:
            word, _, _ = self._get_current_word()
            if len(word) >= 2:
                self._completer.setCompletionPrefix(word)
                if self._completer.completionCount() > 0:
                    popup = self._completer.popup()
                    cursor_rect = self.cursorRect()
                    # Position popup below the cursor
                    cursor_rect.moveTop(cursor_rect.bottom() + 5)
                    popup.setCurrentIndex(self._completer.completionModel().index(0, 0))
                    cursor_rect.setWidth(min(300, popup.sizeHintForColumn(0) + popup.verticalScrollBar().sizeHint().width() + 20))
                    self._completer.complete(cursor_rect)
                else:
                    self._completer.popup().hide()
            else:
                self._completer.popup().hide()


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
        
        # Prompt Presets Storage (in-memory, saved with character profile)
        self.prompt_presets = []  # List of dicts: [{name, quality_prompt, subject_prompt, style_prompt, neg_prompt}, ...]
        self.current_prompt_index = 0
        
        # Custom Tags Storage (in-memory, saved with character profile)
        # Format: {"tag_name": ["value1", "value2", ...], ...}
        self.custom_tags = {}
        
        # Dynamic Toggles Storage: {name: QCheckBox}
        self.toggles_map = {}
        
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
        self.test_btn.setToolTip("Generate 1 image (first value) without saving")
        self.test_btn.clicked.connect(self.handle_test_generate)
        tb_layout.addWidget(self.test_btn)

        self.quick_random_btn = QPushButton("🎲 Quick")
        self.quick_random_btn.setFixedHeight(36)
        self.quick_random_btn.setToolTip("Generate 1 image with random tag values (for casual use)")
        self.quick_random_btn.clicked.connect(self.handle_quick_random_generate)
        tb_layout.addWidget(self.quick_random_btn)

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

        # 3. Model Selector
        grid_id.addWidget(QLabel("Model:"), 2, 0)
        model_container = QWidget()
        mc_layout = QHBoxLayout(model_container)
        mc_layout.setContentsMargins(0,0,0,0)
        mc_layout.setSpacing(5)
        
        self.model_combo = QComboBox()
        self.model_combo.setMinimumWidth(200)
        
        refresh_models_btn = QPushButton("🔄")
        refresh_models_btn.setFixedSize(40, 30)
        refresh_models_btn.setToolTip("Refresh Models from ComfyUI")
        refresh_models_btn.clicked.connect(self.populate_models_ui)
        
        mc_layout.addWidget(self.model_combo)
        mc_layout.addWidget(refresh_models_btn)
        
        grid_id.addWidget(model_container, 2, 1)
        
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

        # IPAdapter Model Selector
        h_ipa = QHBoxLayout(); h_ipa.setContentsMargins(0,0,0,0); h_ipa.setSpacing(2)
        h_ipa.addWidget(QLabel("IPAdapter Model:"))
        h_ipa.addStretch()
        ref_grid.addLayout(h_ipa, 4, 0)
        
        ipa_container = QWidget()
        ipa_layout = QHBoxLayout(ipa_container)
        ipa_layout.setContentsMargins(0,0,0,0)
        ipa_layout.setSpacing(5)
        self.ipadapter_model_combo = QComboBox()
        self.ipadapter_model_combo.setMinimumWidth(200)
        ipa_layout.addWidget(self.ipadapter_model_combo)
        ipa_layout.addStretch()
        ref_grid.addWidget(ipa_container, 4, 1, 1, 3)
        
        # CLIP Vision Model Selector
        h_clip = QHBoxLayout(); h_clip.setContentsMargins(0,0,0,0); h_clip.setSpacing(2)
        h_clip.addWidget(QLabel("CLIP Vision Model:"))
        h_clip.addStretch()
        ref_grid.addLayout(h_clip, 5, 0)
        
        clip_container = QWidget()
        clip_layout = QHBoxLayout(clip_container)
        clip_layout.setContentsMargins(0,0,0,0)
        clip_layout.setSpacing(5)
        self.clip_vision_model_combo = QComboBox()
        self.clip_vision_model_combo.setMinimumWidth(200)
        clip_layout.addWidget(self.clip_vision_model_combo)
        clip_layout.addStretch()
        ref_grid.addWidget(clip_container, 5, 1, 1, 3)

        tr.addWidget(self.ref_settings_frame)
        tr.addStretch()
        self.config_tabs.addTab(tab_ref, localized_text("Reference"))
        
        # Tab 3: Prompting
        tab_prompt = QWidget()
        tl2 = QVBoxLayout(tab_prompt)
        tl2.setSpacing(10)
        tl2.setContentsMargins(20, 20, 20, 20)

        # Prompt Preset Selector
        prompt_header = QHBoxLayout()
        prompt_header.addWidget(QLabel("📋 Prompt Preset:"))
        self.prompt_preset_combo = QComboBox()
        self.prompt_preset_combo.setMinimumWidth(150)
        self.prompt_preset_combo.currentIndexChanged.connect(self.on_prompt_preset_changed)
        prompt_header.addWidget(self.prompt_preset_combo)
        
        prompt_header.addSpacing(10)
        
        add_prompt_btn = QPushButton("➕ New")
        add_prompt_btn.setToolTip("Create a new prompt preset from current content")
        add_prompt_btn.clicked.connect(self.add_new_prompt_preset)
        prompt_header.addWidget(add_prompt_btn)
        
        save_prompt_btn = QPushButton("💾 Save")
        save_prompt_btn.setToolTip("Save changes to current prompt preset")
        save_prompt_btn.clicked.connect(self.save_current_prompt_preset)
        prompt_header.addWidget(save_prompt_btn)
        
        rename_prompt_btn = QPushButton("✏️")
        rename_prompt_btn.setToolTip("Rename current prompt preset")
        rename_prompt_btn.setFixedWidth(35)
        rename_prompt_btn.clicked.connect(self.rename_current_prompt_preset)
        prompt_header.addWidget(rename_prompt_btn)
        
        del_prompt_btn = QPushButton("🗑️")
        del_prompt_btn.setToolTip("Delete current prompt preset")
        del_prompt_btn.setFixedWidth(35)
        del_prompt_btn.setProperty("class", "Danger")
        del_prompt_btn.clicked.connect(self.delete_current_prompt_preset)
        prompt_header.addWidget(del_prompt_btn)
        
        prompt_header.addStretch()
        tl2.addLayout(prompt_header)
        
        # Separator line
        sep_line = QFrame()
        sep_line.setFrameShape(QFrame.Shape.HLine)
        sep_line.setStyleSheet("color: #3A3A3C;")
        tl2.addWidget(sep_line)

        # Quality
        tl2.addWidget(QLabel("✨ Quality Prompt"))
        self.quality_prompt_input = QTextEdit()
        self.quality_prompt_input.setMaximumHeight(45)
        self.quality_prompt_input.setPlaceholderText("best quality, masterpiece, 8k, highres")
        tl2.addWidget(self.quality_prompt_input)

        # Subject
        tl2.addWidget(QLabel("👤 Subject Prompt (use {{tag}} syntax)"))
        self.subject_prompt_input = AutocompleteTextEdit()
        self.subject_prompt_input.setPlaceholderText("1girl, solo, {{emotion}}{{$if outfit}}, wearing {{outfit}}{{$endif}}")
        self.subject_prompt_input.set_custom_tags_getter(lambda: self.custom_tags)
        self.subject_prompt_input.textChanged.connect(self.refresh_dynamic_toggles)
        tl2.addWidget(self.subject_prompt_input)
        
        # Toggles Container
        self.toggles_container = QWidget()
        self.toggles_layout = QHBoxLayout(self.toggles_container)
        self.toggles_layout.setContentsMargins(0, 5, 0, 5)
        self.toggles_layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
        tl2.addWidget(self.toggles_container)

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
        
        # Preview Button
        preview_btn = QPushButton("👁️ Preview Combinations")
        preview_btn.setToolTip("Preview all prompt combinations that will be generated")
        preview_btn.clicked.connect(self.preview_tag_combinations)
        tl2.addWidget(preview_btn)

        self.config_tabs.addTab(tab_prompt, "📝 Prompting")

        # Tab 4: Custom Tags (formerly Emotions)
        tab_tags = QWidget()
        tags_layout = QHBoxLayout(tab_tags)
        tags_layout.setContentsMargins(15, 15, 15, 15)
        tags_layout.setSpacing(10)
        
        # Left Panel: Tag List
        left_tag_panel = QWidget()
        left_tag_layout = QVBoxLayout(left_tag_panel)
        left_tag_layout.setContentsMargins(0, 0, 0, 0)
        
        left_tag_layout.addWidget(QLabel("🏷️ Tags"))
        
        self.tag_list = QListWidget()
        self.tag_list.setMaximumWidth(200)
        self.tag_list.currentRowChanged.connect(self.on_tag_selected)
        left_tag_layout.addWidget(self.tag_list)
        
        tag_btn_layout = QHBoxLayout()
        add_tag_btn = QPushButton("➕")
        add_tag_btn.setToolTip("Add new tag")
        add_tag_btn.setFixedWidth(40)
        add_tag_btn.clicked.connect(self.add_new_tag)
        
        rename_tag_btn = QPushButton("✏️")
        rename_tag_btn.setToolTip("Rename tag")
        rename_tag_btn.setFixedWidth(40)
        rename_tag_btn.clicked.connect(self.rename_current_tag)
        
        del_tag_btn = QPushButton("🗑️")
        del_tag_btn.setToolTip("Delete tag")
        del_tag_btn.setFixedWidth(40)
        del_tag_btn.setProperty("class", "Danger")
        del_tag_btn.clicked.connect(self.delete_current_tag)
        
        tag_btn_layout.addWidget(add_tag_btn)
        tag_btn_layout.addWidget(rename_tag_btn)
        tag_btn_layout.addWidget(del_tag_btn)
        tag_btn_layout.addStretch()
        left_tag_layout.addLayout(tag_btn_layout)
        
        tags_layout.addWidget(left_tag_panel)
        
        # Separator
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.VLine)
        sep.setStyleSheet("color: #3A3A3C;")
        tags_layout.addWidget(sep)
        
        # Right Panel: Tag Values
        right_tag_panel = QWidget()
        right_tag_layout = QVBoxLayout(right_tag_panel)
        right_tag_layout.setContentsMargins(0, 0, 0, 0)
        
        self.tag_values_label = QLabel("📋 Values for: (select a tag)")
        right_tag_layout.addWidget(self.tag_values_label)
        
        # Table for tag values (Name | Prompt)
        self.tag_values_table = QTableWidget()
        self.tag_values_table.setColumnCount(2)
        self.tag_values_table.setHorizontalHeaderLabels(["Name", "Prompt"])
        self.tag_values_table.horizontalHeader().setStretchLastSection(True)
        self.tag_values_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Interactive)
        self.tag_values_table.setColumnWidth(0, 100)
        self.tag_values_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.tag_values_table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.tag_values_table.cellChanged.connect(self.on_tag_value_cell_changed)
        
        # Apply Danbooru autocomplete to Prompt column
        self.tag_values_table.setItemDelegate(DanbooruAutocompleteDelegate(self.tag_values_table))
        
        right_tag_layout.addWidget(self.tag_values_table)
        
        value_btn_layout = QHBoxLayout()
        add_value_btn = QPushButton("➕ Add Value")
        add_value_btn.clicked.connect(self.add_tag_value)
        
        del_value_btn = QPushButton("➖ Remove")
        del_value_btn.setProperty("class", "Danger")
        del_value_btn.clicked.connect(self.remove_tag_value)
        
        value_btn_layout.addWidget(add_value_btn)
        value_btn_layout.addWidget(del_value_btn)
        value_btn_layout.addStretch()
        
        # Import/Export
        imp_tags_btn = QPushButton("📂 Import")
        imp_tags_btn.clicked.connect(self.import_tags)
        exp_tags_btn = QPushButton("💾 Export")
        exp_tags_btn.clicked.connect(self.export_tags)
        value_btn_layout.addWidget(imp_tags_btn)
        value_btn_layout.addWidget(exp_tags_btn)
        
        right_tag_layout.addLayout(value_btn_layout)
        
        # Info label showing usage hint
        usage_hint = QLabel("💡 Use {{tag_name}} in your prompt. Double-click cells to edit.")
        usage_hint.setStyleSheet("color: #888; font-size: 11px; margin-top: 5px;")
        right_tag_layout.addWidget(usage_hint)
        
        tags_layout.addWidget(right_tag_panel, stretch=1)
        
        self.config_tabs.addTab(tab_tags, "🏷️ Tags")
        
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

        # Try to populate models on startup (delayed to allow show first)
        QTimer.singleShot(1000, self.populate_models_ui)

    def handle_generate(self):
        # Combine Prompts
        qual = self.quality_prompt_input.toPlainText().strip()
        subj = self.subject_prompt_input.toPlainText().strip()
        style = self.style_prompt_input.toPlainText().strip()
        
        parts = [p for p in [qual, subj, style] if p]
        base_prompt = ", ".join(parts)

        # Validation: Check if any tag syntax exists in prompt
        import re
        required_tags = re.findall(r'\{\{(\w+)\}\}', base_prompt)
        optional_tags = re.findall(r'\{\{\?(\w+)\}\}', base_prompt)
        conditional_tags = re.findall(r'\{\{\$if (\w+)\}\}', base_prompt)
        
        all_used_tags = list(dict.fromkeys(required_tags + optional_tags + conditional_tags))
        
        if not all_used_tags:
            return QMessageBox.warning(self, "Validation Error", "Prompt must contain at least one tag.\nExamples: {{emotion}}, {{?outfit}}, {{$if pose}}...{{$endif}}")
        
        # Check if all required tags are defined (optional and conditional tags can be undefined)
        missing_required = [t for t in required_tags if t not in self.custom_tags]
        if missing_required:
            return QMessageBox.warning(self, "Validation Error", f"Required tag(s) not defined: {', '.join(missing_required)}\nPlease define them in the Tags tab.")
        
        # Check for empty required tag values
        empty_required = [t for t in required_tags if not self.custom_tags.get(t, [])]
        if empty_required:
            return QMessageBox.warning(self, "Validation Error", f"Required tag(s) have no values: {', '.join(empty_required)}")
        
        # Calculate total combinations using Parser (Single Source of Truth)
        # We must re-instantiate parser or use existing one if available?
        # We need to construct toggles first. 
        # But wait, lines 2004 gets toggles. Move that up?
        # Or just get them now.
        temp_toggles = self.get_active_toggles()
        parser = TagParser(self.custom_tags)
        # Note: generate_combinations does the optimization!
        combos_list = parser.generate_combinations(base_prompt, toggles=temp_toggles)
        total_combos = len(combos_list)
        
        # Warn if too many combinations
        if total_combos > 50:
            reply = QMessageBox.warning(
                self, "Many Combinations",
                f"This will generate {total_combos * self.batch_count_spin.value()} images!\nContinue?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
            
        gen_settings = {
            "sampler1_name": self.sampler1_combo.currentText(),
            "scheduler1": self.scheduler1_combo.currentText(),
            "sampler2_name": self.sampler2_combo.currentText(),
            "scheduler2": self.scheduler2_combo.currentText(),
            "upscale_factor": self.upscale_spin.value(),
            "width": self.width_spin.value(),
            "height": self.height_spin.value(),
            "bypass_sage_attn": self.bypass_sage_chk.isChecked(),
            "ckpt_name": self.model_combo.currentText(),
            "ipadapter_model": self.ipadapter_model_combo.currentText() or None,
            "clip_vision_model": self.clip_vision_model_combo.currentText() or None
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
        
        active_toggles = self.get_active_toggles()
        print(f"DEBUG: Handle Generate - Active Toggles: {active_toggles}")
        
        job = JobQueueItem(
            self.char_name_input.text() or "QuickGen",
            base_prompt,
            self.neg_prompt_input.toPlainText(),
            self.custom_tags.copy(),  # Pass a copy of custom_tags
            self.ref_img_path.text(),
            self.batch_count_spin.value(),
            self.seed_input.text(),
            gen_settings,
            self.ref_enabled_chk.isChecked(),
            ref_settings,
            toggles=active_toggles
        )
        
        print(f"DEBUG: Created Job. Job Toggles: {job.toggles}")
        print(f"DEBUG: Queue Length Before Append: {len(self.job_queue)}")
        
        self.job_queue.append(job)
        self.refresh_queue_ui()
        
        # Start Worker if not running
        if not hasattr(self, 'worker') or not self.worker.isRunning():
            self.start_worker_thread()
        else:
            self.status_bar.setText("Job added to running queue.")

    def handle_test_generate(self):
        # Quick Generate with first tag combination, single batch, no save
        qual = self.quality_prompt_input.toPlainText().strip()
        subj = self.subject_prompt_input.toPlainText().strip()
        style = self.style_prompt_input.toPlainText().strip()
        
        parts = [p for p in [qual, subj, style] if p]
        base_prompt = ", ".join(parts)

        # Use first value of each tag for test
        import re
        used_tags = re.findall(r'\{\{(\w+)\}\}', base_prompt)
        test_tags = {}
        for tag in used_tags:
            if tag in self.custom_tags and self.custom_tags[tag]:
                test_tags[tag] = [self.custom_tags[tag][0]]  # Only first value
            else:
                test_tags[tag] = ["test"]

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
            "Test",
            base_prompt,
            self.neg_prompt_input.toPlainText(),
            test_tags,
            self.ref_img_path.text(),
            1, # Force batch 1
            "-1",
            gen_settings,
            self.ref_enabled_chk.isChecked(),
            ref_settings,
            is_test=True,
            toggles=self.get_active_toggles()
        )
        
        self.job_queue.append(job)
        self.refresh_queue_ui()
        
        if not hasattr(self, 'worker') or not self.worker.isRunning():
            self.start_worker_thread()

    def handle_quick_random_generate(self):
        """Quick Generate with random tag values - for casual AI image generation"""
        import random
        
        qual = self.quality_prompt_input.toPlainText().strip()
        subj = self.subject_prompt_input.toPlainText().strip()
        style = self.style_prompt_input.toPlainText().strip()
        
        parts = [p for p in [qual, subj, style] if p]
        base_prompt = ", ".join(parts)

        if not base_prompt:
            QMessageBox.warning(self, "Empty", "Please enter a prompt first.")
            return

        # Find all tags and pick random value for each
        import re
        required_tags = re.findall(r'\{\{(\w+)\}\}', base_prompt)
        optional_tags = re.findall(r'\{\{\?(\w+)\}\}', base_prompt)
        conditional_tags = re.findall(r'\{\{\$if (\w+)(?:=|!=)?[^}]*\}\}', base_prompt)
        
        all_used_tags = list(dict.fromkeys(required_tags + optional_tags + conditional_tags))
        
        random_tags = {}
        for tag in all_used_tags:
            if tag in self.custom_tags and self.custom_tags[tag]:
                # For optional tags, 50% chance of being empty
                if tag in optional_tags and random.random() < 0.3:
                    random_tags[tag] = [""]
                else:
                    random_tags[tag] = [random.choice(self.custom_tags[tag])]
            else:
                random_tags[tag] = [""]  # Empty for undefined tags

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
            self.char_name_input.text() or "QuickGen",
            base_prompt,
            self.neg_prompt_input.toPlainText(),
            random_tags,
            self.ref_img_path.text(),
            1,
            "-1",  # Random seed
            gen_settings,
            self.ref_enabled_chk.isChecked(),
            ref_settings,
            is_test=True,  # Don't save to gallery
            toggles=self.get_active_toggles()
        )
        
        self.job_queue.append(job)
        self.refresh_queue_ui()
        self.status_bar.setText("🎲 Quick Random job queued!")
        
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
            # emo_str logic is legacy or needs update. 
            # Try to get 'emotion' tag values if available.
            emotions = job.custom_tags.get("emotion", [])
            # emotions list format might be [("Display", "Prompt"), ...] or just strings?
            # User earlier saw `[3] emotion=sad`.
            # Let's assume list of strings or tuples.
            display_strs = []
            for e in emotions:
                 if isinstance(e, (list, tuple)) and len(e) > 0:
                      display_strs.append(str(e[0]))
                 else:
                      display_strs.append(str(e))
            
            emo_str = ", ".join(display_strs) if display_strs else "Custom"
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

    def populate_models_ui(self):
        """Fetch available models from ComfyUI and populate combo boxes"""
        # Ensure client is connected so we have server address correct
        if not hasattr(self, 'comfy_client'):
             self.comfy_client = ComfyClient(self.app_config.get("server_address"))
        
        info = self.comfy_client.get_object_info()
        if not info:
             self.status_bar.setText("Failed to fetch models: ComfyUI offline?")
             return
        
        models_loaded = 0
             
        # 1. CheckpointLoaderSimple - SDXL checkpoints
        if "CheckpointLoaderSimple" in info:
             input_info = info["CheckpointLoaderSimple"].get("input", {}).get("required", {})
             if "ckpt_name" in input_info:
                  models = input_info["ckpt_name"][0]
                  current = self.model_combo.currentText()
                  self.model_combo.clear()
                  self.model_combo.addItems(models)
                  if current and current in models:
                       self.model_combo.setCurrentText(current)
                  models_loaded += len(models)
        
        # 2. IPAdapterModelLoader - IPAdapter models
        if "IPAdapterModelLoader" in info:
             input_info = info["IPAdapterModelLoader"].get("input", {}).get("required", {})
             if "ipadapter_file" in input_info:
                  models = input_info["ipadapter_file"][0]
                  current = self.ipadapter_model_combo.currentText()
                  self.ipadapter_model_combo.clear()
                  self.ipadapter_model_combo.addItems(models)
                  if current and current in models:
                       self.ipadapter_model_combo.setCurrentText(current)
                  models_loaded += len(models)
        
        # 3. CLIPVisionLoader - CLIP Vision models
        if "CLIPVisionLoader" in info:
             input_info = info["CLIPVisionLoader"].get("input", {}).get("required", {})
             if "clip_name" in input_info:
                  models = input_info["clip_name"][0]
                  current = self.clip_vision_model_combo.currentText()
                  self.clip_vision_model_combo.clear()
                  self.clip_vision_model_combo.addItems(models)
                  if current and current in models:
                       self.clip_vision_model_combo.setCurrentText(current)
                  models_loaded += len(models)
        
        if models_loaded > 0:
             self.status_bar.setText(f"Loaded {models_loaded} models from ComfyUI.")
        else:
             self.status_bar.setText("Could not find model loaders in ComfyUI.")

    def new_character_profile(self):
        self.char_name_input.clear()
        self.ref_img_path.clear()
        self.update_ref_preview(None)
        
        # Reset Prompts with default preset
        self.prompt_presets = [{
            "name": "Default",
            "quality_prompt": "best quality, masterpiece, 8k, highres",
            "subject_prompt": "1girl, solo, {{emotion}}",
            "style_prompt": "",
            "neg_prompt": ""
        }]
        self.current_prompt_index = 0
        self._refresh_prompt_preset_combo()
        self._load_prompt_preset_to_ui(0)
        
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
        
        # Reset custom tags with default emotion tag
        self.custom_tags = {
            "emotion": [["Happy", "smile"], ["Sad", "tears"]]
        }
        self._refresh_tag_list()
        
        self.char_select_combo.setCurrentIndex(0)

    def save_character_profile(self):
        name = self.char_name_input.text().strip()
        if not name: return QMessageBox.warning(self, "Error", "Name required")
        
        # Save current prompt preset before saving profile
        self._save_current_prompt_to_memory()
        
        data = {
            "name": name,
            "ref_image": self.ref_img_path.text(),
            # Multi-prompt support
            "prompts": self.prompt_presets,
            "active_prompt_index": self.current_prompt_index,
            # Custom tags support
            "custom_tags": self.custom_tags,
            "batch_count": self.batch_count_spin.value(),
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
        
        # Load Prompts with backward compatibility
        if "prompts" in data:
            # New format: multiple presets
            self.prompt_presets = data.get("prompts", [])
            self.current_prompt_index = data.get("active_prompt_index", 0)
            if self.current_prompt_index >= len(self.prompt_presets):
                self.current_prompt_index = 0
        else:
            # Old format: migrate to new format
            if "base_prompt" in data and "subject_prompt" not in data:
                # Very old format
                quality = "best quality, masterpiece, 8k"
                subject = data.get("base_prompt", "")
                style = ""
            else:
                quality = data.get("quality_prompt", "")
                subject = data.get("subject_prompt", "")
                style = data.get("style_prompt", "")
            
            self.prompt_presets = [{
                "name": "Default",
                "quality_prompt": quality,
                "subject_prompt": subject,
                "style_prompt": style,
                "neg_prompt": data.get("neg_prompt", "")
            }]
            self.current_prompt_index = 0
        
        self._refresh_prompt_preset_combo()
        self._load_prompt_preset_to_ui(self.current_prompt_index)
        
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
        
        # Load Custom Tags with backward compatibility
        if "custom_tags" in data:
            self.custom_tags = data.get("custom_tags", {})
        elif "emotions" in data:
            # Migrate from old emotions format
            emotions = data.get("emotions", [])
            if emotions:
                self.custom_tags = {
                    "emotion": [e[1] for e in emotions]  # Use the prompt modifier as value
                }
            else:
                self.custom_tags = {"emotion": ["smile"]}
        else:
            self.custom_tags = {"emotion": ["smile"]}
        
        self._refresh_tag_list()

    # --- Prompt Preset Management ---
    def _refresh_prompt_preset_combo(self):
        """Refresh the prompt preset combobox with current presets"""
        self.prompt_preset_combo.blockSignals(True)
        self.prompt_preset_combo.clear()
        for preset in self.prompt_presets:
            self.prompt_preset_combo.addItem(preset.get("name", "Unnamed"))
        if 0 <= self.current_prompt_index < self.prompt_preset_combo.count():
            self.prompt_preset_combo.setCurrentIndex(self.current_prompt_index)
        self.prompt_preset_combo.blockSignals(False)

    def _load_prompt_preset_to_ui(self, index):
        """Load a prompt preset from memory to UI inputs"""
        if not self.prompt_presets or index < 0 or index >= len(self.prompt_presets):
            return
        preset = self.prompt_presets[index]
        self.quality_prompt_input.setText(preset.get("quality_prompt", ""))
        self.subject_prompt_input.setText(preset.get("subject_prompt", ""))
        self.style_prompt_input.setText(preset.get("style_prompt", ""))
        self.neg_prompt_input.setText(preset.get("neg_prompt", ""))

    def _save_current_prompt_to_memory(self):
        """Save current UI prompt values to the current preset in memory"""
        if not self.prompt_presets or self.current_prompt_index < 0 or self.current_prompt_index >= len(self.prompt_presets):
            return
        self.prompt_presets[self.current_prompt_index]["quality_prompt"] = self.quality_prompt_input.toPlainText()
        self.prompt_presets[self.current_prompt_index]["subject_prompt"] = self.subject_prompt_input.toPlainText()
        self.prompt_presets[self.current_prompt_index]["style_prompt"] = self.style_prompt_input.toPlainText()
        self.prompt_presets[self.current_prompt_index]["neg_prompt"] = self.neg_prompt_input.toPlainText()

    def on_prompt_preset_changed(self, index):
        """Handle prompt preset combobox selection change"""
        if index < 0 or index >= len(self.prompt_presets):
            return
        # Save current before switching
        self._save_current_prompt_to_memory()
        # Load new preset
        self.current_prompt_index = index
        self._load_prompt_preset_to_ui(index)

    def add_new_prompt_preset(self):
        """Create a new prompt preset from current content"""
        from PyQt6.QtWidgets import QInputDialog
        name, ok = QInputDialog.getText(self, "New Prompt Preset", "Enter preset name:")
        if not ok or not name.strip():
            return
        
        # Create new preset with current values
        new_preset = {
            "name": name.strip(),
            "quality_prompt": self.quality_prompt_input.toPlainText(),
            "subject_prompt": self.subject_prompt_input.toPlainText(),
            "style_prompt": self.style_prompt_input.toPlainText(),
            "neg_prompt": self.neg_prompt_input.toPlainText()
        }
        
        self.prompt_presets.append(new_preset)
        self.current_prompt_index = len(self.prompt_presets) - 1
        self._refresh_prompt_preset_combo()

    def preview_tag_combinations(self):
        """Preview all prompt combinations that will be generated"""
        # Combine prompts
        qual = self.quality_prompt_input.toPlainText().strip()
        subj = self.subject_prompt_input.toPlainText().strip()
        style = self.style_prompt_input.toPlainText().strip()
        
        parts = [p for p in [qual, subj, style] if p]
        base_prompt = ", ".join(parts)
        
        if not base_prompt:
            QMessageBox.warning(self, "Empty", "Please enter a prompt first.")
            return
        
        active_toggles = self.get_active_toggles()
        
        # Use TagParser
        parser = TagParser(self.custom_tags)
        # Use proper generation logic with toggles optimization
        all_combinations = parser.generate_combinations(base_prompt, toggles=active_toggles)
        
        if not all_combinations or all_combinations == [{}]:
            # No tags found or empty combinations
            # Just show the cleaned prompt (with toggles applied to see final static text)
            clean_values = active_toggles.copy()
            cleaned = parser.process_prompt(base_prompt, clean_values)
            QMessageBox.information(self, "No Variations", f"No variable tags found.\nOutput:\n\n{cleaned}")
            return
        
        # Generate preview for each combination (limit to 20)
        previews = []
        for i, tag_values in enumerate(all_combinations[:20]):
            # Merge toggles for correct conditional processing
            current_values = tag_values.copy()
            current_values.update(active_toggles)
            
            print(f"DEBUG: Preview {i} - Tag Values: {current_values}")
            
            final_prompt = parser.process_prompt(base_prompt, current_values)
            print(f"DEBUG: Preview {i} - Result: {final_prompt}")
            
            # Format tag values for display
            tag_info = " | ".join([f"{k}={v or '(empty)'}" for k, v in tag_values.items()])
            previews.append(f"[{i+1}] {tag_info}\n    → {final_prompt}\n")
        
        # Build result message
        total = len(all_combinations)
        msg = f"📊 Total combinations: {total}\n\n"
        msg += "\n".join(previews)
        
        if total > 20:
            msg += f"\n... and {total - 20} more combinations"
        
        # Show in dialog
        dialog = QDialog(self)
        dialog.setWindowTitle("Preview Combinations")
        dialog.resize(700, 500)
        layout = QVBoxLayout(dialog)
        
        text_edit = QTextEdit()
        text_edit.setReadOnly(True)
        text_edit.setPlainText(msg)
        text_edit.setStyleSheet("font-family: Consolas, monospace; font-size: 12px;")
        layout.addWidget(text_edit)
        
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(dialog.close)
        layout.addWidget(close_btn)
        
        dialog.exec()

    def save_current_prompt_preset(self):
        """Save changes to current prompt preset (to memory only - full save needs Save Profile)"""
        self._save_current_prompt_to_memory()
        QMessageBox.information(self, "Saved", "Prompt preset updated in memory.\nDon't forget to Save Profile to persist changes!")

    def rename_current_prompt_preset(self):
        """Rename the current prompt preset"""
        if not self.prompt_presets or self.current_prompt_index < 0:
            return
        
        from PyQt6.QtWidgets import QInputDialog
        current_name = self.prompt_presets[self.current_prompt_index].get("name", "")
        name, ok = QInputDialog.getText(self, "Rename Preset", "Enter new name:", text=current_name)
        if not ok or not name.strip():
            return
        
        self.prompt_presets[self.current_prompt_index]["name"] = name.strip()
        self._refresh_prompt_preset_combo()

    def delete_current_prompt_preset(self):
        """Delete the current prompt preset"""
        if len(self.prompt_presets) <= 1:
            QMessageBox.warning(self, "Cannot Delete", "You must have at least one prompt preset.")
            return
        
        reply = QMessageBox.question(
            self, "Delete Preset", 
            f"Are you sure you want to delete '{self.prompt_presets[self.current_prompt_index].get('name', 'this preset')}'?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        del self.prompt_presets[self.current_prompt_index]
        self.current_prompt_index = max(0, self.current_prompt_index - 1)
        self._refresh_prompt_preset_combo()
        self._load_prompt_preset_to_ui(self.current_prompt_index)

    # --- Custom Tag Management ---
    def _refresh_tag_list(self):
        """Refresh the tag list widget from custom_tags"""
        self.tag_list.blockSignals(True)
        self.tag_list.clear()
        for tag_name in sorted(self.custom_tags.keys()):
            self.tag_list.addItem(tag_name)
        self.tag_list.blockSignals(False)
        
        # Clear values if no tags
        if not self.custom_tags:
            self.tag_values_list.clear()
            self.tag_values_label.setText("📋 Values for: (select a tag)")

    def _refresh_tag_values_list(self, tag_name):
        """Refresh the tag values table for a specific tag"""
        self.tag_values_table.blockSignals(True)
        self.tag_values_table.setRowCount(0)
        
        if tag_name and tag_name in self.custom_tags:
            values = self.custom_tags[tag_name]
            self.tag_values_table.setRowCount(len(values))
            
            for row, item in enumerate(values):
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    name_item = QTableWidgetItem(str(item[0]))
                    prompt_item = QTableWidgetItem(str(item[1]))
                else:
                    name_item = QTableWidgetItem(str(item))
                    prompt_item = QTableWidgetItem(str(item))
                
                self.tag_values_table.setItem(row, 0, name_item)
                self.tag_values_table.setItem(row, 1, prompt_item)
            
            self.tag_values_label.setText(f"📋 Values for: {{{{{tag_name}}}}}")
        else:
            self.tag_values_label.setText("📋 Values for: (select a tag)")
        
        self.tag_values_table.blockSignals(False)

    def on_tag_selected(self, row):
        """Handle tag selection change"""
        if row < 0:
            self.tag_values_table.setRowCount(0)
            return
        tag_name = self.tag_list.item(row).text()
        self._refresh_tag_values_list(tag_name)

    def add_new_tag(self):
        """Add a new custom tag"""
        from PyQt6.QtWidgets import QInputDialog
        name, ok = QInputDialog.getText(self, "New Tag", "Enter tag name (no spaces, lowercase recommended):")
        if not ok or not name.strip():
            return
        
        # Sanitize tag name (no spaces, lowercase)
        tag_name = name.strip().lower().replace(" ", "_")
        
        if tag_name in self.custom_tags:
            QMessageBox.warning(self, "Duplicate", f"Tag '{tag_name}' already exists.")
            return
        
        self.custom_tags[tag_name] = []
        self._refresh_tag_list()
        
        # Select the new tag
        for i in range(self.tag_list.count()):
            if self.tag_list.item(i).text() == tag_name:
                self.tag_list.setCurrentRow(i)
                break

    def rename_current_tag(self):
        """Rename the currently selected tag"""
        current_item = self.tag_list.currentItem()
        if not current_item:
            return
        
        old_name = current_item.text()
        
        from PyQt6.QtWidgets import QInputDialog
        new_name, ok = QInputDialog.getText(self, "Rename Tag", "Enter new tag name:", text=old_name)
        if not ok or not new_name.strip():
            return
        
        new_name = new_name.strip().lower().replace(" ", "_")
        
        if new_name == old_name:
            return
        
        if new_name in self.custom_tags:
            QMessageBox.warning(self, "Duplicate", f"Tag '{new_name}' already exists.")
            return
        
        # Rename in dict
        self.custom_tags[new_name] = self.custom_tags.pop(old_name)
        self._refresh_tag_list()
        
        # Re-select
        for i in range(self.tag_list.count()):
            if self.tag_list.item(i).text() == new_name:
                self.tag_list.setCurrentRow(i)
                break

    def delete_current_tag(self):
        """Delete the currently selected tag"""
        current_item = self.tag_list.currentItem()
        if not current_item:
            return
        
        tag_name = current_item.text()
        reply = QMessageBox.question(
            self, "Delete Tag",
            f"Are you sure you want to delete tag '{tag_name}' and all its values?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        del self.custom_tags[tag_name]
        self._refresh_tag_list()

    def add_tag_value(self):
        """Add a value to the currently selected tag"""
        current_item = self.tag_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "No Tag Selected", "Please select a tag first.")
            return
        
        tag_name = current_item.text()
        
        # Add empty row for user to fill in
        self.custom_tags[tag_name].append(["New", "new_value"])
        self._refresh_tag_values_list(tag_name)
        
        # Select the new row for editing
        last_row = self.tag_values_table.rowCount() - 1
        self.tag_values_table.setCurrentCell(last_row, 0)
        self.tag_values_table.editItem(self.tag_values_table.item(last_row, 0))

    def remove_tag_value(self):
        """Remove the selected value from the current tag"""
        current_tag_item = self.tag_list.currentItem()
        current_row = self.tag_values_table.currentRow()
        
        if not current_tag_item or current_row < 0:
            return
        
        tag_name = current_tag_item.text()
        
        if current_row < len(self.custom_tags[tag_name]):
            del self.custom_tags[tag_name][current_row]
            self._refresh_tag_values_list(tag_name)

    def on_tag_value_cell_changed(self, row, col):
        """Handle cell edit in tag values table - save changes to data"""
        current_tag_item = self.tag_list.currentItem()
        if not current_tag_item:
            return
        
        tag_name = current_tag_item.text()
        if row >= len(self.custom_tags[tag_name]):
            return
        
        item = self.tag_values_table.item(row, col)
        if item:
            self.custom_tags[tag_name][row][col] = item.text()

    def import_tags(self):
        """Import tags from JSON file"""
        f, _ = QFileDialog.getOpenFileName(self, "Import Tags", "", "JSON Files (*.json)")
        if not f:
            return
        
        try:
            with open(f, "r", encoding="utf-8") as file:
                data = json.load(file)
            
            # Handle both old emotions format and new tags format
            if isinstance(data, list):
                # Old emotions format: [["Happy", "smile"], ...]
                if data and isinstance(data[0], list):
                    self.custom_tags["emotion"] = [item[1] for item in data]
                else:
                    # List of strings
                    self.custom_tags["imported"] = data
            elif isinstance(data, dict):
                # New tags format
                self.custom_tags.update(data)
            
            self._refresh_tag_list()
            QMessageBox.information(self, "Success", "Tags imported successfully!")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to import: {e}")

    def export_tags(self):
        """Export tags to JSON file"""
        if not self.custom_tags:
            QMessageBox.warning(self, "Warning", "No tags to export!")
            return
        
        f, _ = QFileDialog.getSaveFileName(self, "Export Tags", "tags.json", "JSON Files (*.json)")
        if not f:
            return
        
        try:
            with open(f, "w", encoding="utf-8") as file:
                json.dump(self.custom_tags, file, indent=4, ensure_ascii=False)
            QMessageBox.information(self, "Success", "Tags exported successfully!")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to export: {e}")

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

    def refresh_dynamic_toggles(self):
        """Parse prompt for {{$toggle name}} and update checkboxes."""
        text = self.subject_prompt_input.toPlainText()
        
        # Use simple regex directly here or TagParser helper to be safe
        # We can use TagParser.get_toggles if available, but simple regex is fine for UI responsiveness
        toggles = sorted(list(set(re.findall(r'\{\{\$toggle\s+(\w+)\}\}', text))))
        
        # 1. Identify existing, new, and removed
        current_names = set(self.toggles_map.keys())
        wanted_names = set(toggles)
        
        to_add = wanted_names - current_names
        to_remove = current_names - wanted_names
        
        # 2. Remove
        for name in to_remove:
            cb = self.toggles_map.pop(name)
            self.toggles_layout.removeWidget(cb)
            cb.deleteLater()
            
        # 3. Add
        for name in to_add:
            cb = QCheckBox(name)
            cb.setStyleSheet("color: #D500F9; font-weight: bold;") # Match highlighting
            self.toggles_layout.addWidget(cb)
            self.toggles_map[name] = cb
            
    def get_active_toggles(self):
        """Get dict of {name: bool} for current toggles."""
        return {name: cb.isChecked() for name, cb in self.toggles_map.items()}




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
