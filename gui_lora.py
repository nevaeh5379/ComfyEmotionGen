from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                             QPushButton, QListWidget, QListWidgetItem, 
                             QLineEdit, QMessageBox, QFrame, QSplitter, QSizePolicy)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer
from PyQt6.QtGui import QIcon, QAction

class LoRAManagerTab(QWidget):
    def __init__(self, client, parent=None):
        super().__init__(parent)
        self.client = client
        self.lora_list = []
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # Header / Toolbar
        toolbar = QHBoxLayout()
        
        self.refresh_btn = QPushButton("Refresh LoRAs")
        self.refresh_btn.setProperty("class", "Primary")
        self.refresh_btn.clicked.connect(self.load_loras)
        toolbar.addWidget(self.refresh_btn)
        
        toolbar.addStretch()
        
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search LoRA...")
        self.search_input.textChanged.connect(self.filter_loras)
        toolbar.addWidget(self.search_input)
        
        layout.addLayout(toolbar)
        
        # Content Area
        # Left: List of LoRAs
        # Right: Details / Actions (maybe preview image later?)
        
        # Content Area - Using Splitter
        self.splitter = QSplitter(Qt.Orientation.Horizontal)
        self.splitter.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        
        self.list_widget = QListWidget()
        self.list_widget.setAlternatingRowColors(True)
        self.list_widget.itemDoubleClicked.connect(self.copy_to_clipboard)
        self.list_widget.setMinimumWidth(200) # Force minimum width
        self.splitter.addWidget(self.list_widget)
        
        # Info Panel
        self.info_panel = QFrame()
        self.info_panel.setProperty("class", "Card")
        info_layout = QVBoxLayout(self.info_panel)
        
        self.lbl_name = QLabel("Select a LoRA")
        self.lbl_name.setProperty("class", "SectionTitle")
        self.lbl_name.setWordWrap(True)
        info_layout.addWidget(self.lbl_name)
        
        self.lbl_usage = QLabel("Usage: <lora:filename:1.0>")
        self.lbl_usage.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.lbl_usage.setStyleSheet("color: #888; font-family: monospace;")
        info_layout.addWidget(self.lbl_usage)
        
        self.copy_btn = QPushButton("Copy Tag to Clipboard")
        self.copy_btn.clicked.connect(self.copy_to_clipboard_btn)
        info_layout.addWidget(self.copy_btn)
        
        info_layout.addStretch()
        
        self.splitter.addWidget(self.info_panel)
        
        # Set initial sizes (List: 2, Info: 1 approx)
        self.splitter.setStretchFactor(0, 2)
        self.splitter.setStretchFactor(1, 1)
        self.splitter.setSizes([400, 200]) # Fallback sizes
        
        layout.addWidget(self.splitter)
        
        # Selection handler
        self.list_widget.currentItemChanged.connect(self.on_selection_change)

        # Initial Load (delayed slightly to let app init)
        QTimer.singleShot(1000, self.load_loras)

    def load_loras(self):
        try:
            self.refresh_btn.setText("Loading...")
            self.refresh_btn.setEnabled(False)
            
            # Fetch from client (blocking/sync for now, or use thread if slow)
            # Since fetching valid object info might take a split second, sync is probably okay for now
            # provided comfy is responsive.
            loras = self.client.get_loras()
            self.lora_list = sorted(loras)
            self.filter_loras("")
            
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to load LoRAs: {e}")
        finally:
            self.refresh_btn.setText("Refresh LoRAs")
            self.refresh_btn.setEnabled(True)

    def filter_loras(self, text):
        search = text.lower()
        self.list_widget.clear()
        
        for name in self.lora_list:
            if search in name.lower():
                item = QListWidgetItem(name)
                self.list_widget.addItem(item)
                
    def on_selection_change(self, current, previous):
        if current:
            name = current.text()
            self.lbl_name.setText(name)
            tag = f"<lora:{name}:1.0>"
            self.lbl_usage.setText(tag)
        else:
            self.lbl_name.setText("Select a LoRA")
            self.lbl_usage.setText("")

    def copy_to_clipboard(self, item=None):
        if not item:
            item = self.list_widget.currentItem()
        if item:
            name = item.text()
            tag = f"<lora:{name}:1.0>"
            app = QWidget.findChild(self, "QApplication") # tricky to find app instance?
            from PyQt6.QtWidgets import QApplication
            clipboard = QApplication.clipboard()
            clipboard.setText(tag)
            
            # Optional: Show toast or feedback?
            btn_text = self.copy_btn.text()
            self.copy_btn.setText("Copied!")
            QTimer.singleShot(1000, lambda: self.copy_btn.setText("Copy Tag to Clipboard"))

    def copy_to_clipboard_btn(self):
        self.copy_to_clipboard()
