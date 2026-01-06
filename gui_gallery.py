import os
import sys
import json
import re
import subprocess
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
                             QComboBox, QCheckBox, QListWidget, QListWidgetItem,
                             QAbstractItemView, QMenu, QFileDialog, QMessageBox,
                             QFrame, QDialog, QScrollArea, QSizePolicy, QApplication, QTextEdit)
from PyQt6.QtCore import Qt, QSize, pyqtSignal, QThread, QEvent, QPoint
from PyQt6.QtGui import QIcon, QPixmap, QImage, QPainter, QColor, QPen, QAction, QWheelEvent, QPalette

class Card(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setProperty("class", "Card")
        self.setLayout(QVBoxLayout())
        self.layout().setContentsMargins(15, 15, 15, 15)
        self.layout().setSpacing(10)

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

class ImageViewer(QDialog):
    def __init__(self, items, current_index, parent=None, favorites_manager=None):
        super().__init__(parent)
        self.setWindowTitle("Image Viewer")
        self.resize(1200, 850)
        self.items = items
        self.current_index = current_index
        self.favorites_manager = favorites_manager
        self.scale_factor = 1.0
        self.is_fit_mode = True
        self.drag_start_pos = None
        
        self.layout = QHBoxLayout(self) # Main layout (HBox for Sidebar)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)

        # --- Image Area (Left) ---
        # --- Image Area (Left) ---
        self.image_container = QWidget()
        img_layout = QVBoxLayout(self.image_container)
        img_layout.setContentsMargins(0, 0, 0, 0)
        img_layout.setSpacing(0)
        
        # Scroll Area
        self.scroll_area = QScrollArea()
        self.scroll_area.setBackgroundRole(QPalette.ColorRole.Dark)
        self.scroll_area.setWidgetResizable(False) 
        self.scroll_area.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.scroll_area.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        # Install event filter to block native scroll on wheel
        self.scroll_area.viewport().installEventFilter(self)
        self.scroll_area.installEventFilter(self)
        
        self.image_label = QLabel()
        self.image_label.setBackgroundRole(QPalette.ColorRole.Base)
        self.image_label.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Ignored)
        self.image_label.setScaledContents(True) # Keep True for smooth scaling, but we control size
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.scroll_area.setWidget(self.image_label)
        img_layout.addWidget(self.scroll_area)
        
        self.layout.addWidget(self.image_container, stretch=1)
        
        # --- Sidebar (Right) ---
        self.sidebar = QWidget()
        self.sidebar.setFixedWidth(300)
        self.sidebar.setStyleSheet("background-color: #1E1E1E; border-left: 1px solid #3E3E3E;")
        sb_layout = QVBoxLayout(self.sidebar)
        sb_layout.setContentsMargins(15, 15, 15, 15)
        
        sb_lbl = QLabel("Generation Info")
        sb_lbl.setStyleSheet("color: #FFF; font-size: 16px; font-weight: bold; margin-bottom: 10px;")
        sb_layout.addWidget(sb_lbl)
        
        self.meta_text = QTextEdit()
        self.meta_text.setReadOnly(True)
        self.meta_text.setStyleSheet("background-color: #252526; color: #D4D4D4; border: 1px solid #3E3E3E; font-family: Consolas, monospace;")
        sb_layout.addWidget(self.meta_text)
        
        copy_meta_btn = QPushButton("Copy Info")
        copy_meta_btn.clicked.connect(self.copy_metadata)
        sb_layout.addWidget(copy_meta_btn)

        self.layout.addWidget(self.sidebar)
        
        # --- Floating Dock Toolbar ---
        # Parent to image_container so it floats over it
        self.toolbar = QFrame(self.image_container)
        self.toolbar.setObjectName("DockToolbar")
        self.toolbar.setStyleSheet("""
            #DockToolbar {
                background-color: rgba(45, 45, 45, 220);
                border: 1px solid rgba(255, 255, 255, 30);
                border-radius: 20px;
            }
            QPushButton {
                background-color: transparent;
                border: none;
                color: #EEE;
                font-weight: bold;
                padding: 5px 10px;
                border-radius: 10px;
            }
            QPushButton:hover {
                background-color: rgba(255, 255, 255, 40);
            }
            QLabel {
                color: #AAA;
                padding: 0 10px;
            }
        """)
        
        tb_layout = QHBoxLayout(self.toolbar)
        tb_layout.setContentsMargins(15, 8, 15, 8)
        tb_layout.setSpacing(10)
        
        self.info_lbl = QLabel()
        tb_layout.addWidget(self.info_lbl)
        
        # Vertical Separator
        sep1 = QFrame()
        sep1.setFrameShape(QFrame.Shape.VLine)
        sep1.setStyleSheet("color: rgba(255,255,255,50);")
        tb_layout.addWidget(sep1)
        
        prev_btn = QPushButton("◀")
        prev_btn.setToolTip("Previous Image (Left Arrow)")
        prev_btn.setFixedSize(30, 30)
        prev_btn.clicked.connect(self.prev_image)
        
        next_btn = QPushButton("▶")
        next_btn.setToolTip("Next Image (Right Arrow)")
        next_btn.setFixedSize(30, 30)
        next_btn.clicked.connect(self.next_image)
        
        tb_layout.addWidget(prev_btn)
        tb_layout.addWidget(next_btn)
        
        sep2 = QFrame()
        sep2.setFrameShape(QFrame.Shape.VLine)
        sep2.setStyleSheet("color: rgba(255,255,255,50);")
        tb_layout.addWidget(sep2)
        
        zoom_out = QPushButton("－")
        zoom_out.setToolTip("Zoom Out (-)")
        zoom_out.setFixedSize(30, 30)
        zoom_out.clicked.connect(self.zoom_out)
        
        zoom_in = QPushButton("＋")
        zoom_in.setToolTip("Zoom In (+)")
        zoom_in.setFixedSize(30, 30)
        zoom_in.clicked.connect(self.zoom_in)
        
        fit_btn = QPushButton("FIT")
        fit_btn.setToolTip("Fit to Window")
        fit_btn.setFixedSize(40, 30)
        fit_btn.clicked.connect(self.fit_to_window)
        
        tb_layout.addWidget(zoom_out)
        tb_layout.addWidget(fit_btn)
        tb_layout.addWidget(zoom_in)
        
        # Show initially
        self.toolbar.show()
        self.toolbar.adjustSize()
        
        self.load_image(self.current_index)
        
        # Ensure focus for keyboard shortcuts
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setFocus()

    def load_image(self, index):
        if not (0 <= index < len(self.items)): return
        
        self.current_index = index
        item = self.items[index]
        path = item['path']
        
        self.pixmap = QPixmap(path)
        if self.pixmap.isNull():
            self.image_label.setText("Failed to load image")
            return

        self.image_label.setPixmap(self.pixmap)
        self.scale_factor = 1.0
        self.fit_to_window()
        
        self.info_lbl.setText(f"{os.path.basename(path)} ({index + 1}/{len(self.items)}) | {self.pixmap.width()}x{self.pixmap.height()}")
        self.setWindowTitle(f"Viewer - {os.path.basename(path)}")
        
        # Metadata
        self.load_metadata(path)

    def load_metadata(self, path):
        info_text = ""
        try:
            img = QImage(path)
            # Try common keys
            keys = img.textKeys()
            for key in keys:
                val = img.text(key)
                if val:
                    # Format JSON if possible
                    try:
                        parsed = json.loads(val)
                        val = json.dumps(parsed, indent=2)
                    except: pass
                    info_text += f"[{key}]\n{val}\n\n"
            
            if not info_text:
                info_text = "No metadata found in image."
        except Exception as e:
            info_text = f"Error reading metadata: {e}"
            
        self.meta_text.setText(info_text)

    def next_image(self):
        if self.current_index < len(self.items) - 1:
            self.load_image(self.current_index + 1)
        # else: Loop? Let's just stop at end for now

    def prev_image(self):
        if self.current_index > 0:
            self.load_image(self.current_index - 1)

    def copy_metadata(self):
        QApplication.clipboard().setText(self.meta_text.toPlainText())

    def zoom_in(self):
        self.scale_image(1.25)

    def zoom_out(self):
        self.scale_image(0.8)

    def fit_to_window(self):
        if self.pixmap.isNull(): return
        # Calculate ratio based on viewport size, not full window
        viewport = self.scroll_area.viewport()
        w_ratio = viewport.width() / self.pixmap.width()
        h_ratio = viewport.height() / self.pixmap.height()
        self.scale_factor = min(w_ratio, h_ratio, 1.0)
        self.is_fit_mode = True # Re-enable auto-fit
        self.resize_image()
        
    def scale_image(self, factor, center_point=None):
        self.is_fit_mode = False # Manual zoom disables auto-fit
        
        # Current viewport dimensions
        viewport = self.scroll_area.viewport()
        
        # If no center point provided (e.g. keyboard/button), use center of viewport
        if center_point is None:
            center_point = QPoint(viewport.width() // 2, viewport.height() // 2)

        # 1. Calculate the 'focus point' on the underlying image relative to current viewport
        # The scrollbar value effectively determines the top-left of the viewport in widget coordinates.
        h_bar = self.scroll_area.horizontalScrollBar()
        v_bar = self.scroll_area.verticalScrollBar()
        
        old_h_val = h_bar.value()
        old_v_val = v_bar.value()

        # Coordinate in the full scaled image that is currently under the center_point
        # axis_pos = scroll_offset + viewport_cursor_pos
        focus_x = old_h_val + center_point.x()
        focus_y = old_v_val + center_point.y()
        
        # 2. Get relative position (0.0 - 1.0) of this focus point within the CURRENT label size
        # This ratio remains constant across the resize
        current_w = self.image_label.width()
        current_h = self.image_label.height()
        
        if current_w == 0 or current_h == 0: return

        ratio_x = focus_x / current_w
        ratio_y = focus_y / current_h
        
        # 3. Apply scale
        self.scale_factor *= factor
        self.resize_image()
        
        # 4. Calculate new scrollbar values to keep the same relative point under the cursor
        # New focus point absolute position
        new_w = self.image_label.width()
        new_h = self.image_label.height()
        
        new_focus_x = new_w * ratio_x
        new_focus_y = new_h * ratio_y
        
        # The new scroll value should be such that:
        # new_scroll_val + center_point == new_focus_x
        # new_scroll_val = new_focus_x - center_point
        
        new_h_val = int(new_focus_x - center_point.x())
        new_v_val = int(new_focus_y - center_point.y())
        
        h_bar.setValue(new_h_val)
        v_bar.setValue(new_v_val)
        
    def resize_image(self):
        if self.pixmap.isNull(): return
        new_size = self.pixmap.size() * self.scale_factor
        self.image_label.resize(new_size)
        
        # Adjust scrollbars to keep center (simple approx)
        # h_bar = self.scroll_area.horizontalScrollBar()
        # v_bar = self.scroll_area.verticalScrollBar()
        
    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Right:
            self.next_image()
        elif event.key() == Qt.Key.Key_Left:
            self.prev_image()
        elif event.key() == Qt.Key.Key_Escape:
            self.close()
        elif event.key() == Qt.Key.Key_Plus or event.key() == Qt.Key.Key_Equal:
            self.zoom_in()
        elif event.key() == Qt.Key.Key_Minus:
            self.zoom_out()
        else:
            super().keyPressEvent(event)
    
    def eventFilter(self, source, event):
        if event.type() == QEvent.Type.Wheel and (source == self.scroll_area or source == self.scroll_area.viewport()):
            self.wheelEvent(event)
            return True # Event handled, do not propagate to scroll area (prevent scrolling)
        return super().eventFilter(source, event)

    def wheelEvent(self, event: QWheelEvent):
        # Always zoom with wheel
        delta = event.angleDelta().y()
        
        # Pass the mouse position in viewport coordinates
        mouse_pos = event.position().toPoint()
        
        if delta > 0: self.scale_image(1.25, mouse_pos)
        else: self.scale_image(0.8, mouse_pos)
        event.accept()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if hasattr(self, 'toolbar'):
            # Center the toolbar at the bottom of the image container
            # image_container is the parent of toolbar
            # Width of container
            cw = self.image_container.width()
            ch = self.image_container.height()
            
            tw = self.toolbar.width()
            th = self.toolbar.height()
            
            # Position: Center horizontally, padded from bottom
            bg_x = (cw - tw) // 2
            bg_y = ch - th - 30 # 30px padding from bottom
            
            self.toolbar.move(bg_x, bg_y)
            self.toolbar.raise_()

        if self.is_fit_mode:
            self.fit_to_window()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start_pos = event.pos()
            self.drag_start_scroll = self.scroll_area.verticalScrollBar().value(), self.scroll_area.horizontalScrollBar().value()
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            
        elif event.button() == Qt.MouseButton.RightButton:
            self.show_context_menu(event.pos())

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.MouseButton.LeftButton and self.drag_start_pos:
            delta = event.pos() - self.drag_start_pos
            
            # Panning
            h_bar = self.scroll_area.horizontalScrollBar()
            v_bar = self.scroll_area.verticalScrollBar()
            
            # Subtract delta because dragging 'content' means moving viewport opposite logic often?
            # Actually standard drag: move mouse left -> view moves right? 
            # Usually: Mouse down at X=100. Move to X=80. Delta = -20.
            # We want content to move with mouse. So we scroll to valid position.
            # Scroll value increases -> moves view down/right.
            # If I drag UP (y decreases), I want creation to move UP. So scrollbar should increase? No.
            # If scrollbar increases, view moves DOWN.
            # So if I drag UP (delta Y < 0), I want to see content below? No, I want to drag the "paper".
            # Drag paper UP -> See bottom. Scrollbar increases.
            # Wait.
            # Let's just try: New Scroll = Start Scroll - Delta
            
            v_bar.setValue(self.drag_start_scroll[0] - delta.y())
            h_bar.setValue(self.drag_start_scroll[1] - delta.x())
            
    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.setCursor(Qt.CursorShape.ArrowCursor)
            self.drag_start_pos = None

    def show_context_menu(self, pos):
        if not self.favorites_manager: return
        
        item = self.items[self.current_index]
        path = item['path']
        is_fav = self.favorites_manager.is_favorite(path)
        
        menu = QMenu(self)
        fav_act = QAction("Remove from Favorites" if is_fav else "Add to Favorites", self)
        
        def toggle_fav():
            self.favorites_manager.toggle(path)
            # Update UI potentially? Warning: Gallery list might not refresh instantly if modal.
            # But we can update title or info string?
            pass
            
        fav_act.triggered.connect(toggle_fav)
        menu.addAction(fav_act)
        
        menu.exec(self.mapToGlobal(pos))

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

class DraggableListWidget(QListWidget):
    delete_pressed = pyqtSignal() # New signal for delete key

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setDragEnabled(True)
        self.setMovement(QListWidget.Movement.Static)
        self.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.setViewMode(QListWidget.ViewMode.IconMode)
        self.setDragDropMode(QAbstractItemView.DragDropMode.DragOnly)
        self.setDefaultDropAction(Qt.DropAction.CopyAction)
        self.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        
        # Color palette
        p = self.palette()
        p.setColor(QPalette.ColorRole.Highlight, QColor(74, 144, 226, 50))
        p.setColor(QPalette.ColorRole.HighlightedText, QColor(255, 255, 255))
        self.setPalette(p)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Delete:
            self.delete_pressed.emit()
        else:
            super().keyPressEvent(event)

    def mouseMoveEvent(self, e):
        super().mouseMoveEvent(e)
        self.viewport().update()

class GalleryTab(QWidget):
    def __init__(self, parent=None, app_config=None, favorites_manager=None, base_output_dir=None):
        super().__init__(parent)
        self.app_config = app_config
        self.favorites_manager = favorites_manager
        self.base_output_dir = base_output_dir
        
        self.gallery_cache = GalleryCache()
        
        # State
        self.gallery_current_level = "root" # root, folder
        self.gallery_current_folder = None
        self.gallery_data_cache = [] 
        self.gallery_page = 0
        self.gallery_page_size = 50
        
        self.setup_ui()
        
    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 20, 0, 0)
        
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
        
        fh.addSpacing(20)
        self.gallery_fav_only_chk = QCheckBox("★ Favorites Only")
        self.gallery_fav_only_chk.toggled.connect(self.reset_gallery_to_root)
        fh.addWidget(self.gallery_fav_only_chk)
        
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
        self.image_list = DraggableListWidget()
        self.image_list.setViewMode(QListWidget.ViewMode.IconMode)
        self.image_list.setIconSize(QSize(180, 180))
        self.image_list.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.image_list.setSpacing(15)
        self.image_list.setGridSize(QSize(220, 240))
        self.image_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.image_list.customContextMenuRequested.connect(self.show_gallery_context_menu)
        self.image_list.itemDoubleClicked.connect(self.open_gallery_item)
        self.image_list.delete_pressed.connect(self.delete_gallery_items)
        
        layout.addWidget(self.image_list)

    def refresh_gallery_scan(self):
        self.gallery_cache.invalidate()
        self.scan_output_folder()

    def scan_output_folder(self):
        if not os.path.exists(self.base_output_dir): return
        
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
        
        painter.setBrush(QColor("#4A90E2"))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(10, 10, 70, 40, 8, 8)
        
        painter.drawRoundedRect(10, 30, 160, 120, 8, 8)
        
        mode = self.app_config.get("folder_preview_mode")
        if preview_images and mode != "Off":
            if mode == "1 Image" and len(preview_images) >= 1:
                img = QPixmap(preview_images[0])
                if not img.isNull():
                    scaled = img.scaled(150, 110, Qt.AspectRatioMode.KeepAspectRatioByExpanding, Qt.TransformationMode.SmoothTransformation)
                    copy_x = (scaled.width() - 150) // 2
                    copy_y = (scaled.height() - 110) // 2
                    painter.drawPixmap(15, 35, scaled, copy_x, copy_y, 150, 110)
                    
            elif mode == "3 Images" and len(preview_images) >= 1:
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
                        
                        painter.setPen(QPen(QColor("#1E1E1E"), 2))
                        painter.setBrush(Qt.BrushStyle.NoBrush)
                        painter.drawRect(x, y, w, h)
                        painter.setPen(Qt.PenStyle.NoPen)
                        painter.setBrush(QColor("#4A90E2"))

        painter.end()
        return QIcon(pix) 

    def update_gallery_view(self):
        char = self.gallery_char_combo.currentText()
        group_by = self.gallery_group_combo.currentText() 
        
        self.image_list.clear()
        
        if hasattr(self, 'thumb_worker') and self.thumb_worker.isRunning():
            self.thumb_worker.stop()
            self.thumb_worker.wait()
        
        if self.gallery_current_level == "root":
            self.path_label.setText(f" {char} / ")
        else:
            self.path_label.setText(f" {char} / {self.gallery_current_folder} ")

        if not char: return
        
        path = os.path.join(self.base_output_dir, char)
        if not os.path.exists(path): return

        all_images = self.gallery_cache.get_images(char)
        if all_images is None:
            all_images = []
            for r, _, fs in os.walk(path):
                for f in fs:
                    if f.startswith("reference") or not f.endswith((".png",".jpg", ".jpeg", ".webp")):
                        continue
                    
                    m = re.search(r"(?:Seed|_s)(\d+)", f)
                    seed = m.group(1) if m else "Unknown"
                    
                    emotion = os.path.basename(r)
                    all_images.append({"path": os.path.join(r, f), "seed": seed, "emotion": emotion})
            
            self.gallery_cache.set_images(char, all_images)

        if hasattr(self, 'gallery_fav_only_chk') and self.gallery_fav_only_chk.isChecked():
            all_images = [img for img in all_images if self.favorites_manager.is_favorite(img['path'])]

        items_to_load = []
        display_list = []

        if self.gallery_current_level == "root":
            groups = set()
            group_images = {} 

            for img in all_images:
                val = img["emotion"] if group_by == "Emotion" else f"Seed {img['seed']}"
                groups.add(val)
                if val not in group_images: group_images[val] = []
                if len(group_images[val]) < 3:
                    group_images[val].append(img["path"])
            
            def natural_sort_key(s):
                return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', s)]
            
            sorted_groups = sorted(list(groups), key=natural_sort_key)
            
            for g in sorted_groups:
                display_list.append({
                    "type": "Folder",
                    "text": g,
                    "preview_images": group_images.get(g, [])
                })
                
        else:
            target_group = self.gallery_current_folder
            filtered = []
            for img in all_images:
                val = img["emotion"] if group_by == "Emotion" else f"Seed {img['seed']}"
                if val == target_group:
                    filtered.append(img)
            
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

        total_items = len(display_list)
        total_pages = (total_items + self.gallery_page_size - 1) // self.gallery_page_size
        if total_pages < 1: total_pages = 1
        
        if self.gallery_page >= total_pages: self.gallery_page = total_pages - 1
        if self.gallery_page < 0: self.gallery_page = 0
        
        start_idx = self.gallery_page * self.gallery_page_size
        end_idx = start_idx + self.gallery_page_size
        
        paged_items = display_list[start_idx:end_idx]
        
        self.page_label.setText(f"{self.gallery_page + 1} / {total_pages}")
        self.prev_page_btn.setEnabled(self.gallery_page > 0)
        self.next_page_btn.setEnabled(self.gallery_page < total_pages - 1)
        
        default_icon = QIcon(self.image_list.style().standardIcon(self.image_list.style().StandardPixmap.SP_FileIcon))
        
        for item_data in paged_items:
            item = QListWidgetItem()
            item.setText(item_data["text"])
            
            if item_data["type"] == "Folder":
                item.setIcon(self.get_folder_icon(item_data["preview_images"]))
                item.setData(Qt.ItemDataRole.UserRole, "Folder")
                item.setData(Qt.ItemDataRole.UserRole + 1, item_data["text"])
                self.image_list.addItem(item)
            else:
                layout_item = item_data["data"]
                item.setIcon(default_icon) 
                item.setData(Qt.ItemDataRole.UserRole, "Image")
                item.setData(Qt.ItemDataRole.UserRole + 1, layout_item['path'])
                
                if self.favorites_manager.is_favorite(layout_item['path']):
                    item.setText("★ " + item.text())
                    item.setToolTip("Favorite")

                item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsDragEnabled)
                item.setSizeHint(QSize(220, 240))
                self.image_list.addItem(item)
                
                items_to_load.append(layout_item)
            
        if items_to_load:
            self.thumb_worker = ThumbnailWorker(items_to_load, QSize(200, 200))
            self.thumb_worker.thumbnail_ready.connect(self.on_thumbnail_ready)
            self.thumb_worker.start()

    def on_thumbnail_ready(self, path, icon):
        for i in range(self.image_list.count()):
            item = self.image_list.item(i)
            if item.data(Qt.ItemDataRole.UserRole + 1) == path:
                item.setIcon(icon)
                break

    def show_gallery_context_menu(self, pos):
        item = self.image_list.itemAt(pos)
        if not item: return

        itype = item.data(Qt.ItemDataRole.UserRole)
        path = item.data(Qt.ItemDataRole.UserRole + 1) 
        
        menu = QMenu(self)
        
        if itype == "Folder":
            open_act = QAction("Open", self)
            open_act.triggered.connect(lambda: self.open_gallery_item(item))
            menu.addAction(open_act)
            
        if itype == "Image":
            is_fav = self.favorites_manager.is_favorite(path)
            fav_text = "Remove from Favorites" if is_fav else "Add to Favorites"
            fav_act = QAction(fav_text, self)
            fav_act.triggered.connect(lambda: self.toggle_gallery_favorites([item]))
            menu.addAction(fav_act)
            
            menu.addSeparator()
            
            copy_seed_act = QAction("Copy Seed", self)
            copy_seed_act.triggered.connect(lambda: self.copy_seed_from_path(path))
            menu.addAction(copy_seed_act)
            
            copy_path_act = QAction("Copy Path", self)
            copy_path_act.triggered.connect(lambda: QApplication.clipboard().setText(path))
            menu.addAction(copy_path_act)
            
            open_exp_act = QAction("Show in Explorer", self)
            open_exp_act.triggered.connect(lambda: self.open_in_explorer(path))
            menu.addAction(open_exp_act)
            
            menu.addSeparator()
            
            del_act = QAction("Delete", self)
            del_act.setProperty("class", "Danger") 
            del_act.triggered.connect(self.delete_gallery_items)
            menu.addAction(del_act)
            
        menu.exec(self.image_list.mapToGlobal(pos))

    def copy_seed_from_path(self, path):
        fname = os.path.basename(path)
        m = re.search(r"(?:Seed|_s)(\d+)", fname)
        if m:
            seed = m.group(1)
            QApplication.clipboard().setText(seed)
            QMessageBox.information(self, "Copied", f"Seed {seed} copied to clipboard!")
        else:
            QMessageBox.warning(self, "Error", "Could not find seed in filename.")

    def open_in_explorer(self, path):
        if not os.path.exists(path): return
        subprocess.Popen(f'explorer /select,"{os.path.normpath(path)}"')

    def delete_gallery_items(self):
        items = self.image_list.selectedItems()
        if not items: return
        
        reply = QMessageBox.question(self, "Delete", f"Delete {len(items)} items permanently?", QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.No: return
        
        for item in items:
            path = item.data(Qt.ItemDataRole.UserRole + 1)
            itype = item.data(Qt.ItemDataRole.UserRole)
            if itype == "Image" and path and os.path.exists(path):
                try:
                    os.remove(path)
                    if self.favorites_manager.is_favorite(path):
                        self.favorites_manager.remove(path)
                except Exception as e:
                    print(f"Error deleting {path}: {e}")
                    
        self.update_gallery_view()

    def toggle_gallery_favorites(self, items):
        for item in items:
            path = item.data(Qt.ItemDataRole.UserRole + 1)
            if path:
                self.favorites_manager.toggle(path)
        self.update_gallery_view()

    def reset_gallery_to_root(self):
        self.gallery_current_level = "root"
        self.gallery_current_folder = None
        self.gallery_page = 0 
        self.back_btn.setEnabled(False)
        self.update_gallery_view()
        
    def navigate_up(self):
        if self.gallery_current_level != "root":
            self.reset_gallery_to_root()

    def open_gallery_item(self, item):
        itype = item.data(Qt.ItemDataRole.UserRole)
        data = item.data(Qt.ItemDataRole.UserRole + 1) 
        
        if itype == "Folder":
            self.gallery_current_level = "folder"
            self.gallery_current_folder = data
            self.gallery_page = 0
            self.back_btn.setEnabled(True)
            self.update_gallery_view()
        elif itype == "Image":
            if self.app_config.get("use_internal_viewer"):
                # Construct list of images for viewer
                # We need all images in the viewing context
                
                # For simplicity, if in root, pass all cached images or just what's loaded?
                # Best approach: Use the filtered list that's currently displayed
                
                # Reconstruct the current list from the widget items for specific order
                # OR just use the 'all_images' but filtering logic is inside update_gallery_view
                # Let's rebuild the list from the UI items which is safest for "what you see is what you play"
                
                viewer_items = []
                viewer_index = 0
                
                # Iterate all items in the list widget
                current_idx = 0
                for i in range(self.image_list.count()):
                    li = self.image_list.item(i)
                    l_type = li.data(Qt.ItemDataRole.UserRole)
                    if l_type == "Image":
                        l_path = li.data(Qt.ItemDataRole.UserRole + 1)
                        if l_path == data:
                            viewer_index = current_idx
                        
                        viewer_items.append({'path': l_path})
                        current_idx += 1

                if viewer_items:
                    viewer = ImageViewer(viewer_items, viewer_index, self, self.favorites_manager)
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
        self.gallery_page += 1
        self.update_gallery_view()
