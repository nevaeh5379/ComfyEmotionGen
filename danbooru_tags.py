"""
Danbooru Tags Autocomplete Module
Loads tag data from CSV and provides search functionality.

CSV Format: tag_name,category,count
- category: 0=general, 1=artist, 3=copyright, 4=character, 5=meta
- count: usage count (for sorting by popularity)

Download CSV from:
- GitHub: https://github.com/DominikDoom/a1111-sd-webui-tagcomplete
"""

import os
import csv
from typing import List, Tuple


class DanbooruTags:
    """Manages Danbooru tag data for autocomplete."""
    
    def __init__(self, csv_path: str = None):
        """
        Initialize with optional CSV path.
        If not provided, looks for 'danbooru_tags.csv' in script directory.
        """
        self.tags: List[Tuple[str, int, int]] = []  # (tag_name, category, count)
        self.tag_names: List[str] = []  # Just names for fast lookup
        self._loaded = False
        
        if csv_path is None:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            csv_path = os.path.join(script_dir, "danbooru_tags.csv")
        
        if os.path.exists(csv_path):
            self.load(csv_path)
    
    def load(self, path: str) -> bool:
        """Load tags from CSV file."""
        try:
            self.tags = []
            self.tag_names = []
            
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                for row in reader:
                    if len(row) >= 1:
                        tag_name = row[0].strip()
                        category = int(row[1]) if len(row) > 1 and row[1].isdigit() else 0
                        count = int(row[2]) if len(row) > 2 and row[2].isdigit() else 0
                        
                        if tag_name and not tag_name.startswith('#'):
                            self.tags.append((tag_name, category, count))
                            self.tag_names.append(tag_name)
            
            # Sort by count (popularity) descending
            self.tags.sort(key=lambda x: x[2], reverse=True)
            self.tag_names = [t[0] for t in self.tags]
            
            self._loaded = True
            print(f"[DanbooruTags] Loaded {len(self.tags)} tags from {path}")
            return True
            
        except Exception as e:
            print(f"[DanbooruTags] Failed to load: {e}")
            return False
    
    @property
    def is_loaded(self) -> bool:
        return self._loaded and len(self.tags) > 0
    
    def search(self, prefix: str, limit: int = 20) -> List[str]:
        """
        Search tags by prefix.
        Returns list of matching tag names, sorted by popularity.
        """
        if not self._loaded or not prefix:
            return []
        
        prefix = prefix.lower().strip()
        results = []
        
        for tag_name in self.tag_names:
            if tag_name.lower().startswith(prefix):
                results.append(tag_name)
                if len(results) >= limit:
                    break
        
        return results
    
    def search_contains(self, query: str, limit: int = 20) -> List[str]:
        """
        Search tags containing query string.
        Returns list of matching tag names.
        """
        if not self._loaded or not query:
            return []
        
        query = query.lower().strip()
        results = []
        
        for tag_name in self.tag_names:
            if query in tag_name.lower():
                results.append(tag_name)
                if len(results) >= limit:
                    break
        
        return results
    
    def get_all_tags(self) -> List[str]:
        """Return all tag names (for QCompleter)."""
        return self.tag_names


# Global instance
_danbooru_tags = None

def get_danbooru_tags() -> DanbooruTags:
    """Get or create global DanbooruTags instance."""
    global _danbooru_tags
    if _danbooru_tags is None:
        _danbooru_tags = DanbooruTags()
    return _danbooru_tags
