import sys
import os
import json
import shutil
import re
import webbrowser
import tempfile
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
    "Identity": {"ko": "신원 (Identity)", "en": "Identity"},
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
        self.setStyleSheet("color: #4A90E2; font-weight: bold; margin-left: 5px;")
    
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

class ImageViewer(QDialog):
    def __init__(self, image_path, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Image Viewer")
        self.resize(1000, 800)
        self.image_path = image_path
        self.scale_factor = 1.0

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Scroll Area
        self.scroll_area = QScrollArea()
        self.scroll_area.setBackgroundRole(QPalette.ColorRole.Dark)
        self.scroll_area.setWidgetResizable(True) # Changed to True initially to center, but we might toggle
        
        self.image_label = QLabel()
        self.image_label.setBackgroundRole(QPalette.ColorRole.Base)
        self.image_label.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Ignored)
        self.image_label.setScaledContents(True)
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.pixmap = QPixmap(image_path)
        self.image_label.setPixmap(self.pixmap)
        
        self.scroll_area.setWidget(self.image_label)
        self.scroll_area.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.scroll_area)
        
        # Controls
        ctrl_layout = QHBoxLayout()
        ctrl_layout.setContentsMargins(10, 10, 10, 10)
        
        self.info_lbl = QLabel(f"{os.path.basename(image_path)} | {self.pixmap.width()}x{self.pixmap.height()}")
        ctrl_layout.addWidget(self.info_lbl)
        ctrl_layout.addStretch()
        
        zoom_in = QPushButton("+")
        zoom_in.setFixedSize(40, 40)
        zoom_in.clicked.connect(self.zoom_in)
        
        zoom_out = QPushButton("-")
        zoom_out.setFixedSize(40, 40)
        zoom_out.clicked.connect(self.zoom_out)
        
        fit_btn = QPushButton("Fit")
        fit_btn.setFixedSize(60, 40)
        fit_btn.clicked.connect(self.fit_to_window)
        
        ctrl_layout.addWidget(zoom_out)
        ctrl_layout.addWidget(fit_btn)
        ctrl_layout.addWidget(zoom_in)
        
        layout.addLayout(ctrl_layout)
        
        self.fit_to_window()
        
    def zoom_in(self):
        self.scale_image(1.25)

    def zoom_out(self):
        self.scale_image(0.8)

    def fit_to_window(self):
        if self.pixmap.isNull(): return
        w_ratio = (self.scroll_area.width() - 20) / self.pixmap.width()
        h_ratio = (self.scroll_area.height() - 20) / self.pixmap.height()
        self.scale_factor = min(w_ratio, h_ratio, 1.0)
        self.image_label.resize(self.scale_factor * self.pixmap.size())
        self.update_zoom_info()
        
    def scale_image(self, factor):
        self.scale_factor *= factor
        self.image_label.resize(self.scale_factor * self.pixmap.size())
        self.update_zoom_info()
        
    def update_zoom_info(self):
        # self.info_lbl.setText(f"Zoom: {int(self.scale_factor * 100)}%")
        pass
        
    def wheelEvent(self, event: QWheelEvent):
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta > 0: self.zoom_in()
            else: self.zoom_out()
            event.accept()
        else:
            super().wheelEvent(event)

# ==========================================
# MODERN UI STYLESHEET
# ==========================================
MODERN_STYLESHEET = """
/* Main Window & Background */
QMainWindow, QDialog, QWidget#CentralWidget {
    background-color: #181818;
    color: #E0E0E0;
    font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
}

/* ScrollBars */
QScrollBar:vertical {
    border: none;
    background: #202020;
    width: 10px;
    margin: 0px;
}
QScrollBar::handle:vertical {
    background: #424242;
    min-height: 20px;
    border-radius: 5px;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}

/* Sidebar */
QListWidget#Sidebar {
    background-color: #202020;
    border: none;
    border-right: 1px solid #333;
    outline: none;
    font-size: 16px;
    padding-top: 20px;
}
QListWidget#Sidebar::item {
    color: #888;
    padding: 15px 20px;
    border-left: 4px solid transparent;
}
QListWidget#Sidebar::item:selected {
    background-color: #2A2A2A;
    color: #FFF;
    border-left: 4px solid #4A90E2;
}
QListWidget#Sidebar::item:hover {
    background-color: #252525;
    color: #CCC;
}

/* Card-like Panels */
QFrame.Card {
    background-color: #202020;
    border-radius: 10px;
    border: 1px solid #333333;
}

/* Headers & Labels */
QLabel {
    color: #E0E0E0;
    font-size: 14px;
}
QLabel.Header {
    font-size: 22px;
    font-weight: bold;
    color: #FFFFFF;
    margin-bottom: 10px;
}
QLabel.SectionTitle {
    font-size: 16px;
    font-weight: 600;
    color: #4A90E2; /* Accent Color */
    margin-bottom: 8px;
}

/* Input Fields - FIX: Explicitly target QAbstractSpinBox and QLineEdit */
QLineEdit, QTextEdit, QPlainTextEdit, QSpinBox, QDoubleSpinBox, QComboBox {
    background-color: #2C2C2C;
    border: 1px solid #3E3E3E;
    border-radius: 6px;
    padding: 6px 10px;
    color: #FFFFFF;
    font-size: 13px;
    selection-background-color: #4A90E2;
}
QLineEdit:focus, QTextEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, QComboBox:focus {
    border: 1px solid #4A90E2;
    background-color: #333333;
}
/* SpinBox Arrows */
QAbstractSpinBox::up-button, QAbstractSpinBox::down-button {
    background-color: transparent;
    border: none;
}
QAbstractSpinBox::up-arrow, QAbstractSpinBox::down-arrow {
    width: 8px;
    height: 8px;
}

QComboBox::drop-down {
    border: none;
    padding-right: 10px;
}

/* Buttons */
QPushButton {
    background-color: #3A3A3A;
    border: 1px solid #4A4A4A;
    border-radius: 6px;
    color: #FFFFFF;
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
}
QPushButton:hover {
    background-color: #484848;
    border-color: #666;
}
QPushButton:pressed {
    background-color: #222;
    border-color: #333;
    padding-top: 10px;
    padding-bottom: 6px;
}
QPushButton:disabled {
    background-color: #2A2A2A;
    color: #555;
    border-color: #333;
}

QPushButton.Primary {
    background-color: #4A90E2;
    border: 1px solid #357ABD;
    font-size: 14px;
    padding: 10px 20px;
}
QPushButton.Primary:hover {
    background-color: #5AA0F2;
    border-color: #70B0FF;
}
QPushButton.Primary:pressed {
    background-color: #306090;
    border-color: #204060;
    padding-top: 12px;
    padding-bottom: 8px;
}

QPushButton.Danger {
    background-color: #D32F2F;
    border: 1px solid #B71C1C;
}
QPushButton.Danger:hover {
    background-color: #E53935;
    border-color: #FF6666;
}
QPushButton.Danger:pressed {
    background-color: #9A0007;
    border-color: #700000;
    padding-top: 10px;
    padding-bottom: 6px;
}

/* Tables & Lists */
QTableWidget, QListWidget {
    background-color: #202020;
    border: 1px solid #333333;
    border-radius: 6px;
    gridline-color: #333333;
    font-size: 13px;
    color: #E0E0E0;
}
QHeaderView::section {
    background-color: #2A2A2A;
    color: #BBBBBB;
    padding: 6px;
    border: none;
    border-bottom: 1px solid #333333;
    font-weight: bold;
}
QTableWidget::item {
    color: #E0E0E0;
    padding: 4px;
}
QTableWidget::item:selected, QListWidget::item:selected {
    background-color: transparent;
    border: 2px solid #4A90E2;
    border-radius: 4px;
    color: #FFFFFF;
}
QListWidget::item:hover {
    background-color: rgba(255, 255, 255, 0.05);
}
/* Ensure rubber band is not opaque if system default is weird */
/* Removed problematic block */

/* Tabs */
QTabWidget::pane {
    border: 1px solid #333;
    background-color: #202020;
    border-radius: 6px;
}
QTabBar::tab {
    background-color: #181818;
    color: #888;
    padding: 8px 16px;
    font-size: 13px;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    margin-right: 2px;
}
QTabBar::tab:selected {
    background-color: #202020;
    color: #4A90E2;
    font-weight: bold;
    border-bottom: 2px solid #4A90E2;
}
QTabBar::tab:hover {
    background-color: #252525;
}

/* Progress Bar */
QProgressBar {
    border: none;
    background-color: #2C2C2C;
    border-radius: 4px;
    height: 8px;
    text-align: center;
}
QProgressBar::chunk {
    background-color: #4A90E2;
    border-radius: 4px;
}

/* CheckBox */
QCheckBox {
    color: #E0E0E0;
    font-size: 13px;
    spacing: 5px;
    padding: 2px;
}
QCheckBox::indicator {
    width: 16px;
    height: 16px;
    background: #2C2C2C;
    border: 1px solid #444;
    border-radius: 3px;
}
QCheckBox::indicator:checked {
    background: #4A90E2;
    border-color: #4A90E2;
    image: url(check_icon_placeholder); /* Often default checkmark works if background is set, or rely on color */
}
QCheckBox::indicator:hover {
    border-color: #666;
}
"""

class GalleryCache:
    def __init__(self):
        self._cache = {} # {character_name: [list of image dicts]}
        self._folder_icon_cache = {} # {key: QIcon}

    def get_images(self, character_name):
        return self._cache.get(character_name)

    def set_images(self, character_name, images):
        self._cache[character_name] = images

    def invalidate(self, character_name=None):
        if character_name:
            if character_name in self._cache:
                del self._cache[character_name]
        else:
            self._cache.clear()
            self._folder_icon_cache.clear()

class DraggableListWidget(QListWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setDragEnabled(True)
        # Fix: Use Static movement to prevent items from disappearing/moving within the list
        self.setMovement(QListWidget.Movement.Static)
        self.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.setViewMode(QListWidget.ViewMode.IconMode)
        # Revert UniformItemSizes to avoid cutting off content
        # self.setUniformItemSizes(True) 
        self.setDragDropMode(QAbstractItemView.DragDropMode.DragOnly)
        self.setDefaultDropAction(Qt.DropAction.CopyAction)
        self.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        
        self.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        
        # Fix Ghosting: Force full update on changes
        # ERROR: setViewportUpdateMode is for QGraphicsView, not QListWidget.
        # Instead, we force update on events if needed, but usually Qt handles this.
        # Let's try to rely on standard behavior first after removing the crashing line.
        # If ghosting persists, we can override paintEvent or mouseMoveEvent.
        
        # Connect selection change to update to ensure artifacts are cleared
        self.itemSelectionChanged.connect(self.viewport().update)

        # Fix Selection Rendering: Ensure Palette Highlight is transparent
        p = self.palette()
        p.setColor(QPalette.ColorRole.Highlight, QColor(74, 144, 226, 50)) # Transparent Blue
        p.setColor(QPalette.ColorRole.HighlightedText, QColor(255, 255, 255))
        self.setPalette(p)

    def mouseMoveEvent(self, e):
        super().mouseMoveEvent(e)
        self.viewport().update()

    def startDrag(self, supportedActions):
        items = self.selectedItems()
        if not items: return

        # Temp dir for drag ops
        temp_dir = os.path.join(tempfile.gettempdir(), "ComfyEmotionGen_Drag")
        if not os.path.exists(temp_dir):
            try:
                os.makedirs(temp_dir)
            except: pass
        
        urls = []
        valid_items = []
        
        for item in items:
            try:
                # Safe data access
                path = item.data(Qt.ItemDataRole.UserRole + 1)
                itype = item.data(Qt.ItemDataRole.UserRole)
                
                if itype == "Image" and path and os.path.exists(path):
                    valid_items.append(item)
                    
                    # Name Logic
                    # Attempt to extract parts from path structure
                    # output/Character/Emotion/File.png
                    
                    # Default fallback
                    target_name = os.path.basename(path)
                    
                    try:
                        parent_dir = os.path.dirname(path) 
                        grandparent_dir = os.path.dirname(parent_dir)
                        
                        emotion_name = os.path.basename(parent_dir)
                        char_name = os.path.basename(grandparent_dir)
                        fname = os.path.basename(path)
                        ext = os.path.splitext(fname)[1]
                        
                        # Seed extraction
                        seed = "Unknown"
                        m = re.search(r"(?:Seed|_s)(\d+)", fname)
                        if m: seed = m.group(1)
                        
                        # Preferred Name
                        candidate_name = f"{char_name}_{emotion_name}{ext}"
                        candidate_path = os.path.join(temp_dir, candidate_name)
                        
                        # Collision handling
                        if os.path.exists(candidate_path):
                             candidate_name = f"{char_name}_{emotion_name}_{seed}{ext}"
                             candidate_path = os.path.join(temp_dir, candidate_name)
                        
                        target_path = candidate_path
                        target_name = candidate_name
                        
                    except:
                        # Fallback if structure is weird
                        target_path = os.path.join(temp_dir, os.path.basename(path))

                    shutil.copy2(path, target_path)
                    urls.append(QUrl.fromLocalFile(target_path))
            except Exception as e:
                print(f"Error processing item for drag: {e}")
        
        if urls:
            drag = QDrag(self)
            mime_data = QMimeData()
            mime_data.setUrls(urls)
            drag.setMimeData(mime_data)
            
            # Rendering:
            # If standard drag rendering is desired, we could rely on QListWidget's default but 
            # modifying the data afterwards is tricky.
            # So we create a custom pixmap.
            
            # 1. Calculate bounding rect of all selected items to make a nice drag image?
            # Or just show the first one. Standard windows behavior usually shows a ghost of the items.
            # QListWidget default startDrag does this well.
            # But since we want to CHANGE the file list (to temp files), we must override.
            
            # Let's try to create a simple composite if few items, or generic icon if many.
            if len(valid_items) == 1:
                icon = valid_items[0].icon()
                if not icon.isNull():
                    drag.setPixmap(icon.pixmap(100, 100))
                    drag.setHotSpot(QPoint(50, 50))
            else:
                # Generic "Stack" icon or just first image with badge
                icon = valid_items[0].icon()
                if not icon.isNull():
                    pix = icon.pixmap(100, 100)
                    painter = QPainter(pix)
                    painter.setBrush(QColor(0, 120, 215))
                    painter.setPen(Qt.PenStyle.NoPen)
                    # Draw a badge count
                    painter.drawEllipse(70, 70, 25, 25)
                    painter.setPen(Qt.GlobalColor.white)
                    painter.setFont(QFont("Arial", 10, QFont.Weight.Bold))
                    painter.drawText(QRect(70, 70, 25, 25), Qt.AlignmentFlag.AlignCenter, str(len(valid_items)))
                    painter.end()
                    drag.setPixmap(pix)
                    drag.setHotSpot(QPoint(50, 50))

            drag.exec(Qt.DropAction.CopyAction)
            
            # Fix Rendering Artifacts: Force update after drag
            self.viewport().update()

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
                            height=job.gen_settings.get("height", 1152)
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

class ThumbnailWorker(QThread):
    thumbnail_ready = pyqtSignal(str, QIcon) # path, icon

    def __init__(self, items, icon_size):
        super().__init__()
        self.items = items # List of dicts or tuples
        self.icon_size = icon_size
        self.is_running = True

    def run(self):
        for item in self.items:
            if not self.is_running: break
            
            path = item['path']
            # Only process if it's an image file
            if path and os.path.exists(path) and os.path.isfile(path):
                # Try loading from cache first
                cache_dir = os.path.join(os.path.dirname(path), ".thumbnails")
                if not os.path.exists(cache_dir):
                    try: os.makedirs(cache_dir)
                    except: pass
                
                cache_key = os.path.splitext(os.path.basename(path))[0] + ".jpg"
                cache_path = os.path.join(cache_dir, cache_key)
                
                loaded = False
                if os.path.exists(cache_path):
                    pix = QPixmap(cache_path)
                    if not pix.isNull():
                        self.thumbnail_ready.emit(path, QIcon(pix))
                        loaded = True
                
                if not loaded:
                    pix = QPixmap(path)
                    if not pix.isNull():
                        scaled = pix.scaled(self.icon_size, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                        self.thumbnail_ready.emit(path, QIcon(scaled))
                        # Save to cache
                        try:
                            scaled.save(cache_path, "JPG", 85)
                        except: pass
    
    def stop(self):
        self.is_running = False

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
                border: 2px solid #4A90E2;
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

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ComfyEmotionGen Pro")
        self.resize(1100, 800)
        
        self.app_config = AppConfigManager()
        self.config_manager = CharacterConfigManager()
        
        self.base_output_dir = os.path.join(os.getcwd(), "output")
        if not os.path.exists(self.base_output_dir): os.makedirs(self.base_output_dir)

        self.gallery_cache = GalleryCache()
        
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
        sidebar_container.setStyleSheet("background-color: #202020; border-right: 1px solid #333;")
        sidebar_container.setFixedWidth(200)
        
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
        self.gallery_tab = QWidget()
        self.setup_gallery_tab()
        self.stack.addWidget(self.gallery_tab)
        
        # Connect
        self.nav_list.currentRowChanged.connect(self.on_sidebar_changed)
        self.nav_list.setCurrentRow(0)

    def on_sidebar_changed(self, index):
        self.stack.setCurrentIndex(index)
        if index == 1: # Gallery
            self.scan_output_folder()

    def open_settings(self):
        dlg = SettingsDialog(self.app_config, self)
        dlg.exec()



    def setup_gen_tab(self):
        # Initialize PIP if needed
        if not hasattr(self, 'pip_preview'):
            self.pip_preview = FloatingPreview(None)
        
        # Main Layout for Gen Tab
        main_layout = QHBoxLayout(self.gen_tab)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Splitter to divide Controls (Left) and Preview (Right)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setHandleWidth(1)
        splitter.setStyleSheet("QSplitter::handle { background: #333; }")
        main_layout.addWidget(splitter)

        # --- LEFT PANEL: Controls ---
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(20, 20, 20, 20)
        left_layout.setSpacing(15)
        splitter.addWidget(left_panel)

        # Top Bar (Profile Management)
        top_h = QHBoxLayout()
        top_h.addWidget(QLabel("Active Character:", styleSheet="font-weight:bold; font-size:16px; color:#4A90E2;"))
        
        self.char_select_combo = QComboBox()
        self.char_select_combo.setFixedWidth(250)
        self.char_select_combo.currentIndexChanged.connect(self.load_character_profile)
        top_h.addWidget(self.char_select_combo)
        
        top_h.addStretch()
        
        save_btn = QPushButton("💾 Save")
        save_btn.clicked.connect(self.save_character_profile)
        top_h.addWidget(save_btn)
        
        new_btn = QPushButton("✨ New")
        new_btn.clicked.connect(self.new_character_profile)
        top_h.addWidget(new_btn)
        
        # Language Toggle
        top_h.addSpacing(10)
        self.lang_btn = QPushButton("English" if CURRENT_LANG == "en" else "한국어")
        self.lang_btn.setFixedWidth(80)
        self.lang_btn.clicked.connect(self.toggle_language)
        top_h.addWidget(self.lang_btn)
        
        left_layout.addLayout(top_h)

        # Config Tabs
        self.config_tabs = QTabWidget()
        self.config_tabs.setStyleSheet("""
            QTabWidget::pane { border: 1px solid #333; background: #202020; border-radius: 8px; }
            QTabBar::tab { background: #181818; color: #888; padding: 8px 20px; border-top-left-radius: 4px; border-top-right-radius: 4px; margin-right: 2px; }
            QTabBar::tab:selected { background: #202020; color: #4A90E2; border-bottom: 2px solid #4A90E2; font-weight: bold; }
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
        preview_container.setStyleSheet("background: #111; border: 1px solid #333; border-radius: 8px;")
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
        
        # Helper to add label with help
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
        
        # Scaling needs special handling for colspan
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

        tl3.setRowStretch(4, 1)
        self.config_tabs.addTab(tab_adv, "⚙️ Advanced")

        # Tab 6: Job Queue (NEW)
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
        
        # Execution Bar
        exec_bar = QFrame()
        exec_bar.setStyleSheet("background: #252525; border-radius: 8px; border: 1px solid #333;")
        el = QHBoxLayout(exec_bar); el.setContentsMargins(15, 10, 15, 10)
        el.addWidget(QLabel("Batch:"))
        self.batch_count_spin = QSpinBox(); self.batch_count_spin.setRange(1, 50); self.batch_count_spin.setValue(1)
        el.addWidget(self.batch_count_spin)
        el.addSpacing(15)
        el.addWidget(QLabel("Seed:"))
        self.seed_input = QLineEdit(); self.seed_input.setPlaceholderText("-1"); self.seed_input.setText("-1"); self.seed_input.setFixedWidth(100)
        el.addWidget(self.seed_input)
        dice_btn = QPushButton("🎲")
        dice_btn.setFixedSize(30, 30)
        dice_btn.setToolTip("Random Seed (-1)")
        dice_btn.clicked.connect(lambda: self.seed_input.setText("-1"))
        el.addWidget(dice_btn)
        el.addSpacing(15)
        pip_btn = QPushButton("📺 Toggle PIP")
        pip_btn.clicked.connect(self.toggle_pip)
        el.addWidget(pip_btn)
        el.addSpacing(15)
        prog_layout = QVBoxLayout()
        prog_layout.setSpacing(2)
        self.progress_bar = QProgressBar()
        self.progress_bar.setFixedHeight(10)
        self.progress_bar.setToolTip("Task Progress")
        prog_layout.addWidget(self.progress_bar)
        self.step_progress_bar = QProgressBar()
        self.step_progress_bar.setFixedHeight(6)
        self.step_progress_bar.setStyleSheet("QProgressBar::chunk { background-color: #50C878; }")
        self.step_progress_bar.setTextVisible(False)
        self.step_progress_bar.setToolTip("Step Progress")
        prog_layout.addWidget(self.step_progress_bar)
        el.addLayout(prog_layout)
        
        # Buttons
        self.generate_btn = QPushButton("✨ Generate")
        self.generate_btn.setProperty("class", "Primary")
        self.generate_btn.clicked.connect(self.handle_generate)
        el.addWidget(self.generate_btn)

        self.stop_btn = QPushButton("🛑 Stop")
        self.stop_btn.setProperty("class", "Danger")
        self.stop_btn.clicked.connect(self.handle_stop)
        self.stop_btn.setEnabled(False) 
        el.addWidget(self.stop_btn)
        
        self.test_btn = QPushButton("🧪 Test (Happy)")
        self.test_btn.clicked.connect(self.handle_test_generate)
        el.addWidget(self.test_btn)
        
        left_layout.addWidget(exec_bar)
        
        # Status Bar
        self.status_bar = QLabel("Ready")
        self.status_bar.setStyleSheet("color: #888; font-size: 12px; margin-top: 5px;")
        left_layout.addWidget(self.status_bar)
        
        # Hidden Log
        self.log_console = QTextEdit()
        self.log_console.setMaximumHeight(0) 
        self.log_console.setVisible(False)
        left_layout.addWidget(self.log_console)

        # --- RIGHT PANEL: Preview ---
        right_panel = QWidget()
        right_panel.setMinimumWidth(400)
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0) # Zero margins for panel
        splitter.addWidget(right_panel)

        # right_layout.addWidget(QLabel("Live Preview", styleSheet="font-weight:bold; font-size:16px; color:#4A90E2;")) # Removed label to save height

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

        # Initial splitter sizes - Balanced 1:1
        splitter.setStretchFactor(0, 1) # Left
        splitter.setStretchFactor(1, 1) # Right
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
        self.step_progress_bar.setValue(0)
        
        self.comfy_client.server_address = self.app_config.get("server_address")
        
        self.worker = GenerationWorker(
            self.comfy_client, self.base_workflow,
            self.base_output_dir, self.job_queue
        )
        self.worker.progress_signal.connect(self.progress_bar.setValue)
        self.worker.step_signal.connect(self.on_step_progress)
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

    def setup_gallery_tab(self):
        layout = QVBoxLayout(self.gallery_tab)
        layout.setContentsMargins(0, 20, 0, 0)
        
        # State
        self.gallery_current_level = "root" # root, folder
        self.gallery_current_folder = None
        self.gallery_data_cache = [] # List of {path, emotion, seed}
        self.gallery_page = 0
        self.gallery_page_size = 50

        
        # Filter Bar
        filter_card = Card()
        fh = QHBoxLayout()
        filter_card.layout().addLayout(fh)
        
        fh.addWidget(QLabel("Character:"))
        self.gallery_char_combo = QComboBox()
        self.gallery_char_combo.setFixedWidth(200)
        self.gallery_char_combo.currentTextChanged.connect(self.reset_gallery_to_root)
        fh.addWidget(self.gallery_char_combo)
        
        fh.addSpacing(20)
        fh.addWidget(QLabel("Group By:"))
        self.gallery_group_combo = QComboBox()
        self.gallery_group_combo.addItems(["Emotion", "Seed"])
        self.gallery_group_combo.setFixedWidth(120)
        self.gallery_group_combo.currentTextChanged.connect(self.reset_gallery_to_root)
        fh.addWidget(self.gallery_group_combo)
        
        
        fh.addStretch()
        refresh_btn = QPushButton("Refresh")
        refresh_btn.clicked.connect(self.refresh_gallery_scan)
        fh.addWidget(refresh_btn)
        
        open_btn = QPushButton("Open Disk Folder")
        open_btn.clicked.connect(lambda: os.startfile(self.base_output_dir))
        fh.addWidget(open_btn)
        
        layout.addWidget(filter_card)
        
        # Navigation Bar
        nav_layout = QHBoxLayout()
        self.back_btn = QPushButton(" < Back ")
        self.back_btn.setFixedWidth(80)
        self.back_btn.setEnabled(False)
        self.back_btn.clicked.connect(self.navigate_up)
        nav_layout.addWidget(self.back_btn)
        
        self.path_label = QLabel(" / ")
        self.path_label.setStyleSheet("font-weight: bold; color: #888;")
        nav_layout.addWidget(self.path_label)
        
        nav_layout.addStretch()
        
        self.prev_page_btn = QPushButton("<")
        self.prev_page_btn.setFixedSize(30, 30)
        self.prev_page_btn.clicked.connect(self.prev_page)
        
        self.page_label = QLabel("1 / 1")
        self.page_label.setStyleSheet("color: #888; font-weight: bold; padding: 0 10px;")
        
        self.next_page_btn = QPushButton(">")
        self.next_page_btn.setFixedSize(30, 30)
        self.next_page_btn.clicked.connect(self.next_page)
        
        nav_layout.addWidget(self.prev_page_btn)
        nav_layout.addWidget(self.page_label)
        nav_layout.addWidget(self.next_page_btn)
        
        layout.addLayout(nav_layout)
        
        # Content Area
        # Content Area
        self.image_list = DraggableListWidget()
        self.image_list.setViewMode(QListWidget.ViewMode.IconMode)
        self.image_list.setIconSize(QSize(180, 180))
        self.image_list.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.image_list.setSpacing(15)
        self.image_list.setGridSize(QSize(220, 240))
        # ExtendedSelection is set in DraggableListWidget init
        self.image_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.image_list.customContextMenuRequested.connect(self.show_gallery_context_menu)
        self.image_list.itemDoubleClicked.connect(self.open_gallery_item)
        
        layout.addWidget(self.image_list)

    def show_gallery_context_menu(self, pos):
        item = self.image_list.itemAt(pos)
        if not item: return

        itype = item.data(Qt.ItemDataRole.UserRole)
        data = item.data(Qt.ItemDataRole.UserRole + 1) # Path
        
        if itype == "Image":
            menu = QMenu(self)
            copy_seed_act = QAction("Copy Seed", self)
            copy_seed_act.triggered.connect(lambda: self.copy_seed_from_path(data))
            menu.addAction(copy_seed_act)
            menu.exec(self.image_list.mapToGlobal(pos))

    def copy_seed_from_path(self, path):
        fname = os.path.basename(path)
        # Look for pattern like _s12345 or Seed12345
        m = re.search(r"(?:Seed|_s)(\d+)", fname)
        if m:
            seed = m.group(1)
            QApplication.clipboard().setText(seed)
            self.status_bar.setText(f"Seed {seed} copied to clipboard!")
        else:
            self.status_bar.setText("Could not find seed in filename.")

    def reset_gallery_to_root(self):
        self.gallery_current_level = "root"
        self.gallery_current_folder = None
        self.gallery_page = 0 # Reset page
        self.back_btn.setEnabled(False)
        self.update_gallery_view()
        
    def navigate_up(self):
        if self.gallery_current_level != "root":
            self.reset_gallery_to_root()

    def open_gallery_item(self, item):
        itype = item.data(Qt.ItemDataRole.UserRole)
        data = item.data(Qt.ItemDataRole.UserRole + 1) # Folder Name or Image Path
        
        if itype == "Folder":
            # Enter Folder
            self.gallery_current_level = "folder"
            self.gallery_current_folder = data
            self.gallery_page = 0 # Reset page
            self.back_btn.setEnabled(True)
            self.update_gallery_view()
        elif itype == "Image":
            # Open Viewer based on preference
            if self.app_config.get("use_internal_viewer"):
                viewer = ImageViewer(data, self)
                viewer.exec()
            else:
                try:
                    os.startfile(data)
                except Exception as e:
                    QMessageBox.warning(self, "Error", f"Could not open image: {e}")

            self.back_btn.setEnabled(True)
            self.update_gallery_view()
        elif itype == "Image":
            # Open Viewer based on preference
            if self.app_config.get("use_internal_viewer"):
                viewer = ImageViewer(data, self)
                viewer.exec()
            else:
                try:
                    os.startfile(data)
                except Exception as e:
                    QMessageBox.warning(self, "Error", f"Could not open image: {e}")

    def prev_page(self):
        if self.gallery_page > 0:
            self.gallery_page -= 1
            self.update_gallery_view()

    def next_page(self):
        # We need total count to check if next is possible, which we know in update_view
        # But we can just try incrementing and if view handles valid range, it's fine.
        # Ideally update_gallery_view enables/disables.
        self.gallery_page += 1
        self.update_gallery_view()

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
        self.step_progress_bar.setMaximum(max_val)
        self.step_progress_bar.setValue(value)

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
        self.step_progress_bar.setValue(0)
        
        # Only show "Done" if it wasn't a hard crash or something, but usually fine
        # If stopped, user knows.
        if self.worker.is_running: # If it finished naturally
            QMessageBox.information(self, "Done", "Queue Processing Complete!")
        else:
             self.status_bar.setText("Stopped by User.")
             
        self.scan_output_folder()

    def refresh_gallery_scan(self):
        self.gallery_cache.invalidate()
        self.scan_output_folder()

    def scan_output_folder(self):
        if not os.path.exists(self.base_output_dir): return
        
        # Just update char list here, actual file scan happens in update_gallery_view
        chars = [d for d in os.listdir(self.base_output_dir) if os.path.isdir(os.path.join(self.base_output_dir, d))]
        chars.sort()
        
        curr = self.gallery_char_combo.currentText()
        self.gallery_char_combo.blockSignals(True)
        self.gallery_char_combo.clear()
        self.gallery_char_combo.addItems(chars)
        if curr in chars: self.gallery_char_combo.setCurrentText(curr)
        elif chars: self.gallery_char_combo.setCurrentIndex(0)
        self.gallery_char_combo.blockSignals(False)
        self.reset_gallery_to_root()

    def get_folder_icon(self, preview_images=None):
        pix = QPixmap(180, 180)
        pix.fill(Qt.GlobalColor.transparent)
        
        painter = QPainter(pix)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Folder Back Tab
        painter.setBrush(QColor("#4A90E2"))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(10, 10, 70, 40, 8, 8)
        
        # Folder Body Back
        painter.drawRoundedRect(10, 30, 160, 120, 8, 8)
        
        mode = self.app_config.get("folder_preview_mode")
        if preview_images and mode != "Off":
            # Draw images inside the folder body area
            # Target Rect for images: 15, 35, 150, 110
            
            if mode == "1 Image" and len(preview_images) >= 1:
                img = QPixmap(preview_images[0])
                if not img.isNull():
                    scaled = img.scaled(150, 110, Qt.AspectRatioMode.KeepAspectRatioByExpanding, Qt.TransformationMode.SmoothTransformation)
                    copy_x = (scaled.width() - 150) // 2
                    copy_y = (scaled.height() - 110) // 2
                    
                    # Rounded clipping
                    path = pyqt_QPainterPath = QIcon() # Placeholder
                    # Actually standard clipping is complex in PyQt without Path. 
                    # Just drawing on top is fine for now, or use setClipRect.
                    # Folder is rounded, so it might look square on corners. 
                    # Let's just draw rect, it's fine.
                    painter.drawPixmap(15, 35, scaled, copy_x, copy_y, 150, 110)
                    
            elif mode == "3 Images" and len(preview_images) >= 1:
                # Collage
                coords = [
                    (15, 35, 75, 110),
                    (90, 35, 75, 55),
                    (90, 90, 75, 55)
                ]
                
                for i in range(min(len(preview_images), 3)):
                    img = QPixmap(preview_images[i])
                    if not img.isNull():
                        x, y, w, h = coords[i]
                        scaled = img.scaled(w, h, Qt.AspectRatioMode.KeepAspectRatioByExpanding, Qt.TransformationMode.SmoothTransformation)
                        copy_x = (scaled.width() - w) // 2
                        copy_y = (scaled.height() - h) // 2
                        painter.drawPixmap(x, y, scaled, copy_x, copy_y, w, h)
                        
                        # Add thin border
                        painter.setPen(QPen(QColor("#1E1E1E"), 2))
                        painter.setBrush(Qt.BrushStyle.NoBrush)
                        painter.drawRect(x, y, w, h)
                        painter.setPen(Qt.PenStyle.NoPen)
                        painter.setBrush(QColor("#4A90E2"))

        painter.end()
        return QIcon(pix) 

    def update_gallery_view(self):
        char = self.gallery_char_combo.currentText()
        group_by = self.gallery_group_combo.currentText() # Emotion or Seed
        
        self.image_list.clear()
        
        # Stop existing worker if running
        if hasattr(self, 'thumb_worker') and self.thumb_worker.isRunning():
            self.thumb_worker.stop()
            self.thumb_worker.wait()
        
        # Update Breadcrumb
        if self.gallery_current_level == "root":
            self.path_label.setText(f" {char} / ")
        else:
            self.path_label.setText(f" {char} / {self.gallery_current_folder} ")

        if not char: return
        
        path = os.path.join(self.base_output_dir, char)
        if not os.path.exists(path): return

        # 1. Get images (Cache Check)
        all_images = self.gallery_cache.get_images(char)
        if all_images is None:
            # Not in cache, scan!
            all_images = []
            for r, _, fs in os.walk(path):
                for f in fs:
                    if f.startswith("reference") or not f.endswith((".png",".jpg", ".jpeg", ".webp")):
                        continue
                    
                    # Match Seed
                    m = re.search(r"(?:Seed|_s)(\d+)", f)
                    seed = m.group(1) if m else "Unknown"
                    
                    emotion = os.path.basename(r)
                    all_images.append({"path": os.path.join(r, f), "seed": seed, "emotion": emotion})
            
            self.gallery_cache.set_images(char, all_images)

        items_to_load = []
        
        # Determine items to display based on level
        display_list = []
        is_folder_view = False

        if self.gallery_current_level == "root":
            is_folder_view = True
            # Show Folders
            groups = set()
            group_images = {} # {group_name: [path1, path2, ...]}

            for img in all_images:
                val = img["emotion"] if group_by == "Emotion" else f"Seed {img['seed']}"
                groups.add(val)
                if val not in group_images: group_images[val] = []
                if len(group_images[val]) < 3:
                    group_images[val].append(img["path"])
            
            # Sort naturally
            def natural_sort_key(s):
                return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]
            
            sorted_groups = sorted(list(groups), key=natural_sort_key)
            
            # Prepare list items
            for g in sorted_groups:
                display_list.append({
                    "type": "Folder",
                    "text": g,
                    "preview_images": group_images.get(g, [])
                })
                
        else:
            is_folder_view = False
            # Show Images in Folder
            target_group = self.gallery_current_folder
            
            # Filter
            filtered = []
            for img in all_images:
                val = img["emotion"] if group_by == "Emotion" else f"Seed {img['seed']}"
                if val == target_group:
                    filtered.append(img)
            
            # Sort images
            if group_by == "Emotion":
                filtered.sort(key=lambda x: int(x['seed']) if x['seed'].isdigit() else 0)
            else:
                filtered.sort(key=lambda x: x['emotion'])
                
            for img in filtered:
                display_list.append({
                    "type": "Image",
                    "text": f"Seed: {img['seed']}" if group_by == "Emotion" else f"{img['emotion']}",
                    "data": img
                })

        # --- Pagination Logic ---
        total_items = len(display_list)
        total_pages = (total_items + self.gallery_page_size - 1) // self.gallery_page_size
        if total_pages < 1: total_pages = 1
        
        if self.gallery_page >= total_pages: self.gallery_page = total_pages - 1
        if self.gallery_page < 0: self.gallery_page = 0
        
        start_idx = self.gallery_page * self.gallery_page_size
        end_idx = start_idx + self.gallery_page_size
        
        paged_items = display_list[start_idx:end_idx]
        
        # Update UI Controls
        self.page_label.setText(f"{self.gallery_page + 1} / {total_pages}")
        self.prev_page_btn.setEnabled(self.gallery_page > 0)
        self.next_page_btn.setEnabled(self.gallery_page < total_pages - 1)
        
        # Render Items
        default_icon = QIcon(self.image_list.style().standardIcon(self.image_list.style().StandardPixmap.SP_FileIcon))
        
        for item_data in paged_items:
            item = QListWidgetItem()
            item.setText(item_data["text"])
            
            if item_data["type"] == "Folder":
                # Folders are always generated synchronously for now (usually low count per page after pagination)
                # Correction: If we paginate folders, we only generate icons for the visible ones.
                item.setIcon(self.get_folder_icon(item_data["preview_images"]))
                item.setData(Qt.ItemDataRole.UserRole, "Folder")
                item.setData(Qt.ItemDataRole.UserRole + 1, item_data["text"])
                self.image_list.addItem(item)
            else:
                layout_item = item_data["data"]
                item.setIcon(default_icon) # Placeholder
                item.setData(Qt.ItemDataRole.UserRole, "Image")
                item.setData(Qt.ItemDataRole.UserRole + 1, layout_item['path'])
                item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsDragEnabled)
                item.setSizeHint(QSize(220, 240))
                self.image_list.addItem(item)
                
                items_to_load.append(layout_item)
            
        # Start Async Loading for images on current page
        if items_to_load:
            self.thumb_worker = ThumbnailWorker(items_to_load, QSize(200, 200))
            self.thumb_worker.thumbnail_ready.connect(self.on_thumbnail_ready)
            self.thumb_worker.start()


    def on_thumbnail_ready(self, path, icon):
        # Find item with this path
        for i in range(self.image_list.count()):
            item = self.image_list.item(i)
            if item.data(Qt.ItemDataRole.UserRole + 1) == path:
                item.setIcon(icon)
                break

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
