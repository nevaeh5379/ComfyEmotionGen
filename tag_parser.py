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
            Dict with keys: required, optional, random, conditional, toggle
        """
        return {
            'required': re.findall(r'\{\{(\w+)\}\}', prompt),
            'optional': re.findall(r'\{\{\?(\w+)\}\}', prompt),
            'random': re.findall(r'\{\{(\w+):random\}\}', prompt),
            'conditional': re.findall(r'\{\{\$if\s+([^}]+)\}\}', prompt), # Changed to capture full condition string
            'toggle': re.findall(r'\{\{\$toggle\s+(\w+)\}\}', prompt),
        }
    
    def get_all_unique_tags(self, prompt: str) -> list:
        """Get all unique tag names used in the prompt."""
        tags = self.find_all_tags(prompt)
        
        # Extract variables from complex conditions
        cond_vars = []
        for cond_str in tags['conditional']:
            cond_vars.extend(self._extract_vars_from_condition(cond_str))
            
        # Toggles are variables too, but usually we just want them for UI. 
        # But if they are used in Logic, they are effectively inputs.
        all_tags = tags['required'] + tags['optional'] + tags['random'] + cond_vars + tags['toggle']
        return list(dict.fromkeys(all_tags))  # Preserve order, remove duplicates
        
    def _extract_vars_from_condition(self, condition: str) -> list:
        """Extract variable names from a condition string."""
        # Split by operators and spaces
        # Operators: &&, ||, !, =, !=
        # Simplest: replace all operators with spaces, then split
        clean = condition.replace('&&', ' ').replace('||', ' ').replace('!', ' ').replace('=', ' ')
        parts = clean.split()
        return [p.strip() for p in parts if p.strip()]
    
    def get_toggles(self, prompt: str) -> list:
        """Get list of toggle variables defined in the prompt."""
        return list(dict.fromkeys(re.findall(r'\{\{\$toggle\s+(\w+)\}\}', prompt)))

    def generate_combinations(self, prompt: str, toggles: dict = None) -> list:
        """
        Generate all tag value combinations for the prompt, respecting conditional logic dependencies.
        """
        # Start recursion with initial toggles
        initial_tags = toggles.copy() if toggles else {}
        return self._recursive_generate(prompt, initial_tags)

    def _recursive_generate(self, prompt: str, current_assigned: dict) -> list:
        """
        Recursively generate combinations by resolving dependencies.
        """
        # 1. Partial process to remove dead branches based on current assignments
        effective_prompt = self.process_prompt(prompt, current_assigned, partial=True)
        
        # 2. Find all tags remaining in the effective prompt
        # Note: We need to find tags that are NOT yet assigned.
        # find_all_tags returns raw tag names.
        tags_info = self.find_all_tags(effective_prompt)
        found_tags = tags_info['required'] + tags_info['optional'] + tags_info['random']
        unique_tags = list(dict.fromkeys(found_tags))
        
        # Filter out already assigned tags (unless they appear again? No, assignment is global for the prompt)
        unassigned_tags = [t for t in unique_tags if t not in current_assigned]
        
        if not unassigned_tags:
            # Base case: No more tags to expand. Return the current assignment.
            # We strip the 'toggles' from the result if we want only custom tags?
            # But the caller expects full tag values probably.
            # Actually, standard behavior returns all used tags.
            return [current_assigned]
        
        # 3. Pick the next tag to expand.
        # Priority: Tags used in conditions (Guard Variables).
        # We need to detect which tags are in conditions.
        # Regex to find '$if tag' or '$if tag=' etc.
        condition_pattern = r'\{\{\$if\s+(!?[\w]+)(?:=|!=)?'
        condition_vars = re.findall(condition_pattern, effective_prompt)
        # Clean up vars (remove !)
        condition_vars = [v.lstrip('!') for v in condition_vars]
        
        # Intersect with unassigned
        priority_vars = [t for t in unassigned_tags if t in condition_vars]
        
        # Pick best candidate
        target_tag = priority_vars[0] if priority_vars else unassigned_tags[0]
        
        # 4. Expand values for target_tag
        values = self._extract_values(target_tag)
        
        # Handle Random/Optional logic
        is_random = target_tag in tags_info['random']
        is_optional = target_tag in tags_info['optional']
        
        if is_random:
            eff_values = [random_module.choice(values)] if values else [""]
        elif is_optional:
            eff_values = [""] + list(values) if "" not in values else list(values)
        else:
            eff_values = values
            
        if not eff_values:
            eff_values = [""] # Fallback for empty tag
            
        # 5. Recurse
        results = []
        for val in eff_values:
            # Create new assignment
            next_assigned = current_assigned.copy()
            next_assigned[target_tag] = val
            
            # Recurse
            sub_results = self._recursive_generate(prompt, next_assigned)
            results.extend(sub_results)
            
        return results
    
    def process_prompt(self, prompt: str, tag_values: dict, partial: bool = False) -> str:
        """
        Process a prompt with given tag values.
        
        Args:
            prompt: The template prompt with tags
            tag_values: Dict of {tag_name: value}
            partial: If True, only resolve determinable conditionals. Do NOT replace variable tags.
        
        Returns:
            Processed prompt string
        """
        result = prompt
        
        # 0. Remove toggle definitions: {{$toggle var}}
        # (Always safe to remove toggles as they are UI directives)
        result = re.sub(r'\{\{\$toggle\s+\w+\}\}', '', result)
        
        # 1. Remove comments: {{#...}}
        result = re.sub(r'\{\{#[^}]*\}\}', '', result)
        
        # 2. Process if-else-endif blocks
        result = self._process_conditionals(result, tag_values, partial=partial)
        
        if partial:
            return result
        
        # 3. Substitute required tags: {{tag}}
        for tag_name, tag_value in tag_values.items():
            # Use regex to handle potential whitespace, e.g. {{ tag }}
            pattern = r'\{\{\s*' + re.escape(tag_name) + r'\s*\}\}'
            result = re.sub(pattern, str(tag_value), result)
        
        # 4. Substitute optional tags: {{?tag}}
        for tag_name, tag_value in tag_values.items():
            pattern = r'\{\{\?\s*' + re.escape(tag_name) + r'\s*\}\}'
            result = re.sub(pattern, str(tag_value), result)
        
        # 5. Substitute random tags: {{tag:random}}
        for tag_name, tag_value in tag_values.items():
            pattern = r'\{\{\s*' + re.escape(tag_name) + r'\s*:\s*random\s*\}\}'
            result = re.sub(pattern, str(tag_value), result)
        
        # 6. Clean up
        result = self._cleanup_prompt(result)
        
        return result
    
    def _process_conditionals(self, prompt: str, tag_values: dict, partial: bool = False) -> str:
        """Process {{$if}}...{{$else}}...{{$endif}} blocks with nesting support."""
        
        # We process from left to right. When we find an outermost {{$if}},
        # we find its matching {{$endif}}, evaluate it, and replace it.
        # Recursion is naturally handled because we will call process_prompt on the result content.
        # But wait, to avoid infinite recursion if we just return the string, we should
        # use a loop to process all top-level blocks in the current string.
        # Then, inside the True/False block content, we recurse.
        
        result = []
        pos = 0
        
        # Regex to find any control tag start
        # Captures: 1=full_tag_content
        tag_pattern = re.compile(r'\{\{(\$(?:if\s+[^}]+|else|endif))\}\}')
        
        while pos < len(prompt):
            match = tag_pattern.search(prompt, pos)
            if not match:
                result.append(prompt[pos:])
                break
            
            tag_content = match.group(1).strip()
            
            if tag_content.startswith('$if'):
                # Found start of a block. Now search for matching endif.
                start_match = match
                depth = 1
                search_pos = match.end()
                
                block_end_match = None
                else_match = None
                
                while True:
                    next_tag = tag_pattern.search(prompt, search_pos)
                    if not next_tag:
                        # Unclosed block - append rest and exit
                        # Or maybe just treat as text? Let's just append everything to avoid crash.
                        result.append(prompt[pos:])
                        return "".join(result)
                    
                    tc = next_tag.group(1).strip()
                    search_pos = next_tag.end()
                    
                    if tc.startswith('$if'):
                        depth += 1
                    elif tc == '$endif':
                        depth -= 1
                        if depth == 0:
                            block_end_match = next_tag
                            break
                    elif tc == '$else':
                        if depth == 1:
                            else_match = next_tag
                
                # We have the block: start_match ... [else_match] ... block_end_match
                # Add text before the block
                result.append(prompt[pos:start_match.start()])
                
                # Extract Condition
                # tag_content is "$if cond"
                condition = tag_content[3:].strip()
                
                # Extract inner content
                if else_match:
                    if_content = prompt[start_match.end():else_match.start()]
                    else_content = prompt[else_match.end():block_end_match.start()]
                else:
                    if_content = prompt[start_match.end():block_end_match.start()]
                    else_content = ""
                
                # Evaluate Condition
                condition_met = self._evaluate_condition(condition, tag_values, partial=partial)
                
                if condition_met is None:
                    # Indeterminate: Keep stricture, recurse for partial simplification
                    processed_if = self.process_prompt(if_content, tag_values, partial=True)
                    processed_else = self.process_prompt(else_content, tag_values, partial=True) if else_content else ""
                    
                    block_str = f"{{{{$if {condition}}}}}" + processed_if
                    if else_match:
                        block_str += f"{{{{$else}}}}" + processed_else
                    block_str += "{{{{$endif}}}}"
                    result.append(block_str)
                else:
                    selected_content = if_content if condition_met else else_content
                    # Recurse (Normal or Partial based on arg)
                    # Note: We must call process_prompt again, OR just _process_conditionals recursively.
                    # Since process_prompt handles other tags too, and other tags might be inside,
                    # calling process_prompt is safer but beware infinite loop if logic is flawed.
                    # However, since we are consuming the $if block, we are strictly reducing problem size.
                    processed_inner = self.process_prompt(selected_content, tag_values, partial=partial)
                    result.append(processed_inner)
                
                pos = block_end_match.end()
                
            else:
                # Found $else or $endif but we are at depth 0.
                # This means it's an orphaned tag or malformed. Just treat as text.
                # Or skip past it? Let's treat as text to be safe/visible error.
                result.append(prompt[pos:match.end()])
                pos = match.end()
                
        return "".join(result)
    
    def _evaluate_condition(self, condition: str, tag_values: dict, partial: bool = False):
        """
        Evaluate a condition expression with support for && (AND) and || (OR).
        Precedence: AND binds tighter than OR (standard).
        """
        condition = condition.strip()
        
        # Helper for 3-valued logic
        def tri_or(vals):
            if any(v is True for v in vals): return True
            if all(v is False for v in vals): return False
            return None
            
        def tri_and(vals):
            if any(v is False for v in vals): return False
            if all(v is True for v in vals): return True
            return None

        if '||' in condition:
            parts = [p.strip() for p in condition.split('||')]
            results = [self._evaluate_condition(p, tag_values, partial) for p in parts]
            if partial: return tri_or(results)
            return any(results) # standard logic fallback (None treated as False if mixed? No, strictly boolean in standard mode)

        if '&&' in condition:
            parts = [p.strip() for p in condition.split('&&')]
            results = [self._evaluate_condition(p, tag_values, partial) for p in parts]
            if partial: return tri_and(results)
            return all(results)
            
        # Leaf condition
        target_tag = ""
        expected_val = None
        op = ""
        
        if '!=' in condition:
            target_tag, expected_val = [p.strip() for p in condition.split('!=', 1)]
            op = '!='
        elif '=' in condition:
            target_tag, expected_val = [p.strip() for p in condition.split('=', 1)]
            op = '='
        elif condition.startswith('!'):
            target_tag = condition[1:].strip()
            op = '!'
        else:
            target_tag = condition
            op = 'exists'
            
        # Check existence
        if target_tag not in tag_values:
            if partial: return None
            # Standard mode: missing = False/Empty
            actual_val = ""
        else:
            actual_val = tag_values[target_tag]
            
        # Evaluate
        if op == '!':
            return not bool(actual_val)
        elif op == '!=':
            return str(actual_val) != expected_val
        elif op == '=':
            return str(actual_val) == expected_val
        else: # exists
            return bool(actual_val)
    
    def _cleanup_prompt(self, prompt: str) -> str:
        """Clean up the prompt: remove extra whitespace, fix commas, etc."""
        result = prompt
        
        # Remove indentation (leading spaces on each line)
        lines = result.split('\n')
        lines = [line.strip() for line in lines]
        result = ' '.join(lines)
        
        # Fix comma issues
        result = re.sub(r',\s*,+', ',', result)      # Multiple commas -> single
        # result = re.sub(r',\s*$', '', result)        # Trailing comma (Disabled per user feedback)
        # result = re.sub(r'^\s*,', '', result)        # Leading comma (Disabled per user feedback)
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
