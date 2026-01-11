import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from tag_parser import TagParser

# Define tags with Names and Prompts
tags = {
    "outfit": [
        ["Business Suit", "suit, tie", True],
        ["Casual", "t-shirt, jeans", True]
    ],
    "run_nsfw": [False, True]
}

parser = TagParser(tags)

print("\n--- Testing Name-Based Logic ---")

# 1. Generate Combination (Should be Name)
combs = parser.generate_combinations("{{outfit}}")
print(f"Combinations: {combs}")

# 2. Process Prompt (Should substitute Prompt Value)
# Simulate selection of "Business Suit"
vals = {"outfit": "Business Suit"}
res = parser.process_prompt("Wearing {{outfit}}", vals)
print(f"Substitution (outfit='Business Suit'): '{res}'")

# 3. Conditional Logic (Should compare Name)
cond_prompt = "{{$if outfit=Business Suit}}Formal{{$else}}Casual{{$endif}}"
res_cond = parser.process_prompt(cond_prompt, vals)
print(f"Conditional (outfit=Business Suit): '{res_cond}'")

# 4. Negative Logic
vals_cas = {"outfit": "Casual"}
res_cond_cas = parser.process_prompt(cond_prompt, vals_cas)
print(f"Conditional (outfit=Casual): '{res_cond_cas}'")

