"""
Tag Parser Module for ComfyEmotionGen
Handles custom tag syntax for prompt templates.

Supported Syntax:
- {{tag}}           : Required tag, replaced with value
- {{?tag}}          : Optional tag, includes empty value in combinations
- {{tag:random}}    : Pick random value instead of all combinations
- {{$if tag}}...{{$endif}}                  : Include if tag has value
- {{$if tag=value}}...{{$endif}}            : Include if tag equals value
- {{$if tag!=value}}...{{$endif}}           : Include if tag not equals value
- {{$if tag}}...{{$else}}...{{$endif}}      : If-else structure
- {{#comment}}      : Removed from output (comments)
"""

import re
import random as random_module
from itertools import product


class TagParser:
    """Parses and processes custom tag syntax in prompts."""
    
    def __init__(self, custom_tags: dict):
        """
        Initialize TagParser with custom tag definitions.
        
        Args:
            custom_tags: Dict of {tag_name: [value1, value2, ...]} or {tag_name: [[name, value], ...]}
        """
        self.custom_tags = custom_tags
    
    def _extract_values(self, tag_name: str) -> list:
        """
        Extract prompt values from tag definition.
        Format: [[name, prompt], [name, prompt], ...]
        
        Returns list of prompt values only.
        """
        items = self.custom_tags.get(tag_name, [])
        if not items:
            return [""]
        
        values = []
        for item in items:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                values.append(item[1])  # Use prompt part
            else:
                values.append(str(item))  # Fallback for old format
        
        return values if values else [""]
    
    def find_all_tags(self, prompt: str) -> dict:
        """
        Find all tags used in the prompt.
        
        Returns:
            Dict with keys: required, optional, random, conditional
        """
        return {
            'required': re.findall(r'\{\{(\w+)\}\}', prompt),
            'optional': re.findall(r'\{\{\?(\w+)\}\}', prompt),
            'random': re.findall(r'\{\{(\w+):random\}\}', prompt),
            'conditional': re.findall(r'\{\{\$if (\w+)(?:[=!][^}]*)?\}\}', prompt),
        }
    
    def get_all_unique_tags(self, prompt: str) -> list:
        """Get all unique tag names used in the prompt."""
        tags = self.find_all_tags(prompt)
        all_tags = tags['required'] + tags['optional'] + tags['random'] + tags['conditional']
        return list(dict.fromkeys(all_tags))  # Preserve order, remove duplicates
    
    def generate_combinations(self, prompt: str) -> list:
        """
        Generate all tag value combinations for the prompt.
        
        Returns:
            List of dicts: [{tag_name: value, ...}, ...]
        """
        tags = self.find_all_tags(prompt)
        all_used_tags = self.get_all_unique_tags(prompt)
        
        # Build value lists for each tag
        tag_items = []
        random_tags = set(tags['random'])
        optional_tags = set(tags['optional'])
        
        for tag in all_used_tags:
            values = self._extract_values(tag)
            
            if tag in random_tags:
                # Random tag: pick one random value (not included in combinations)
                values = [random_module.choice(values)] if values else [""]
            elif tag in optional_tags:
                # Optional tag: include empty value
                if "" not in values:
                    values = [""] + list(values)
            
            tag_items.append((tag, values))
        
        if not tag_items:
            return [{}]
        
        # Generate Cartesian product
        tag_names = [t[0] for t in tag_items]
        tag_values_lists = [t[1] for t in tag_items]
        
        combinations = []
        for combo in product(*tag_values_lists):
            combinations.append(dict(zip(tag_names, combo)))
        
        return combinations
    
    def process_prompt(self, prompt: str, tag_values: dict) -> str:
        """
        Process a prompt with given tag values.
        
        Args:
            prompt: The template prompt with tags
            tag_values: Dict of {tag_name: value}
        
        Returns:
            Processed prompt string
        """
        result = prompt
        
        # 1. Remove comments: {{#...}}
        result = re.sub(r'\{\{#[^}]*\}\}', '', result)
        
        # 2. Process if-else-endif blocks
        result = self._process_conditionals(result, tag_values)
        
        # 3. Substitute required tags: {{tag}}
        for tag_name, tag_value in tag_values.items():
            result = result.replace(f"{{{{{tag_name}}}}}", tag_value)
        
        # 4. Substitute optional tags: {{?tag}}
        for tag_name, tag_value in tag_values.items():
            result = result.replace(f"{{{{?{tag_name}}}}}", tag_value)
        
        # 5. Substitute random tags: {{tag:random}}
        for tag_name, tag_value in tag_values.items():
            result = result.replace(f"{{{{{tag_name}:random}}}}", tag_value)
        
        # 6. Clean up
        result = self._cleanup_prompt(result)
        
        return result
    
    def _process_conditionals(self, prompt: str, tag_values: dict) -> str:
        """Process {{$if}}...{{$else}}...{{$endif}} blocks."""
        
        # Pattern for if-else-endif (with optional else)
        pattern = r'\{\{\$if ([^}]+)\}\}(.*?)(?:\{\{\$else\}\}(.*?))?\{\{\$endif\}\}'
        
        def replacer(match):
            condition = match.group(1)
            if_content = match.group(2)
            else_content = match.group(3) if match.group(3) else ""
            
            condition_met = self._evaluate_condition(condition, tag_values)
            
            if condition_met:
                return if_content
            else:
                return else_content
        
        return re.sub(pattern, replacer, prompt, flags=re.DOTALL)
    
    def _evaluate_condition(self, condition: str, tag_values: dict) -> bool:
        """Evaluate a condition expression."""
        condition = condition.strip()
        
        # Negation: !tag (tag is empty/not set)
        if condition.startswith('!'):
            tag_name = condition[1:].strip()
            return not bool(tag_values.get(tag_name, ""))
        
        if '!=' in condition:
            tag_name, expected = condition.split('!=', 1)
            actual = tag_values.get(tag_name.strip(), "")
            return actual != expected.strip()
        elif '=' in condition:
            tag_name, expected = condition.split('=', 1)
            actual = tag_values.get(tag_name.strip(), "")
            return actual == expected.strip()
        else:
            # Simple existence check
            return bool(tag_values.get(condition, ""))
    
    def _cleanup_prompt(self, prompt: str) -> str:
        """Clean up the prompt: remove extra whitespace, fix commas, etc."""
        result = prompt
        
        # Remove indentation (leading spaces on each line)
        lines = result.split('\n')
        lines = [line.strip() for line in lines]
        result = ' '.join(lines)
        
        # Fix comma issues
        result = re.sub(r',\s*,+', ',', result)      # Multiple commas -> single
        result = re.sub(r',\s*$', '', result)        # Trailing comma
        result = re.sub(r'^\s*,', '', result)        # Leading comma
        result = re.sub(r'\s+', ' ', result)         # Multiple spaces
        result = result.strip()
        
        return result
    
    def get_combination_count(self, prompt: str) -> int:
        """Return the total number of combinations for a prompt."""
        return len(self.generate_combinations(prompt))


def parse_and_process(prompt: str, custom_tags: dict, tag_values: dict = None) -> str:
    """
    Convenience function to parse and process a prompt.
    
    Args:
        prompt: Template prompt
        custom_tags: Tag definitions
        tag_values: Optional specific values (if None, uses first value of each tag)
    
    Returns:
        Processed prompt
    """
    parser = TagParser(custom_tags)
    
    if tag_values is None:
        # Use first value of each tag
        tag_values = {}
        for tag in parser.get_all_unique_tags(prompt):
            values = custom_tags.get(tag, [""])
            tag_values[tag] = values[0] if values else ""
    
    return parser.process_prompt(prompt, tag_values)
