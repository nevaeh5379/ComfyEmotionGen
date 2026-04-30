# Prompt DSL — LLM Reference

A domain-specific language for batch-generating AI image prompts (Stable Diffusion / ComfyUI).
A single `.template` file declaratively defines axes of variation, combination rules, exclusions, and output formatting — then expands into N rendered prompts.

---

## 1. File Structure

A template file is a sequence of **statements**. Order matters for readability but not for semantics — all definitions are collected before evaluation.

```
template_file = statement*

statement = set_stmt | axis_def | combine_stmt | exclude_stmt
          | template_block | filename_block | comment
```

---

## 2. Comments

```
"{{#" COMMENT_BODY "#}}"
```

Everything between `{{#` and `#}}` is ignored. Can span multiple lines.

```jinja
{{# this is a comment #}}
```

---

## 3. Variables — `{{set}}`

```
"{{set" NAME "=" STRING "}}"
```

Define a reusable string value. Variables are substituted into `{{template}}` and `{{filename}}` blocks via `{{var_name}}` placeholders.

```jinja
{{set quality = "masterpiece, best quality"}}
{{set character = "1girl, silver hair, blue eyes"}}
```

**Constraints:**
- `NAME` matches `[a-zA-Z_][a-zA-Z0-9_]*`
- `STRING` is double-quoted: `"value here"`
- Variables can reference other variables in template blocks (recursive substitution, max 5 passes)

---

## 4. Axes — `{{axis}}...{{/axis}}`

```
axis_def = "{{axis" NAME ["weighted"] ['include=' STRING] "}}"
           axis_entry*
           "{{/axis}}"

axis_entry = NAME ":" STRING ["@" NUMBER]
```

An axis defines a named dimension of variation. Each entry has a **key** (used in filenames/exclusions) and a **value** (the prompt text).

### 4.1 Basic axis

```jinja
{{axis outfit}}
  uniform  : "school uniform, pleated skirt"
  casual   : "hoodie, jeans"
  dress    : "elegant black dress"
{{/axis}}
```

### 4.2 Weighted axis (`weighted`)

Add the `weighted` keyword to enable weighted random sampling. Each entry gets a weight via `@ NUMBER` (default: `1.0`).

```jinja
{{axis emotion weighted}}
  happy   : "smiling, cheerful"  @ 3
  neutral : "calm expression"    @ 3
  sad     : "teary eyes"         @ 1
  angry   : "angry"              @ 1
{{/axis}}
```

Weights only matter when `sample=N` is used in `{{combine}}` (see §5.3). Higher weight = more likely to be picked.

### 4.3 Include attribute (`include="..."`)

Appends a common string to **every** entry's value in this axis. Useful for shared context that shouldn't be repeated per entry.

```jinja
{{axis sexual_positions include="sex"}}
  doggy     : "doggy style"
  missionary: "missionary position"
{{/axis}}
```

Renders as: `"doggy style, sex"`, `"missionary position, sex"`.

`include` composes with `weighted` — order doesn't matter:
```jinja
{{axis emotion weighted include="expressive face"}}
  happy: "smiling" @ 3
  sad  : "frowning" @ 1
{{/axis}}
```

---

## 5. Combine — `{{combine}}`

```
combine_stmt = "{{combine" [NAME "="] expr [":" combine_opt+ ] "}}"

expr   = term ("+" term)*          — union (additive)
term   = factor ("*" factor)*      — cartesian product (multiplicative)
factor = NAME                      — axis or variable reference
       | STRING                    — literal string
       | "~" factor                — hide key in filename
       | "(" expr ")"              — grouping

combine_opt = "sample=" INT        — randomly pick N combinations
            | "seed=" INT          — random seed for reproducibility
```

The combine expression defines **which axes to combine and how**.

### 5.1 Cartesian product (`*`)

Every combination of values from each axis:

```jinja
{{combine outfit * emotion * pose}}
```

If outfit has 4 entries, emotion has 4, pose has 2 → **32 prompts**.

### 5.2 Union (`+`)

Merge two sub-expressions into one flat list:

```jinja
{{combine (outfit * emotion) + (outfit * pose)}}
```

This produces `outfit×emotion` combos **plus** `outfit×pose` combos in the same output list.

### 5.3 Sampling (`sample=N`)

Randomly pick N combinations from the full set (weighted if axes are `weighted`):

```jinja
{{combine outfit * emotion * pose : sample=5 seed=42}}
```

- `sample=5` — only 5 prompts generated
- `seed=42` — deterministic; same seed = same picks
- If `sample >= total_combos`, all are returned (no sampling)
- Weights from `weighted` axes multiply together per combo

### 5.4 Alias assignment (`NAME = expr`)

Assign the combined result to a single variable for use in templates:

```jinja
{{combine c = outfit * emotion * pose}}
```

Then in the template block:
```jinja
{{template}}
{{c}}
{{/template}}
```

This renders as: `"school uniform, pleated skirt, smiling, cheerful, standing pose, full body shot"`

The alias also exposes `{{c.key}}` for filenames: `"uniform_happy_standing"`.

### 5.5 Hide key (`~`)

Prefix a factor with `~` to exclude its key from the alias key and filename:

```jinja
{{combine c = char * (~outfit * emotion) + (~outfit * nsfw_motion * "nude, nsfw")}}
```

The `outfit` values still appear in the prompt text, but `outfit.key` is omitted from `c.key`.

### 5.6 Literal strings in expressions

String literals can be used directly in combine expressions:

```jinja
{{combine c = outfit * "detailed background, soft lighting"}}
```

### 5.7 Operator precedence

`*` binds tighter than `+`. Use `(...)` to override:

```jinja
{{combine a * (b + c)}}     — a × (b ∪ c)
{{combine (a * b) + c}}     — (a × b) ∪ c
```

---

## 6. Exclude — `{{exclude}}`

```
exclude_stmt = "{{exclude" condition ("AND" condition)* "}}"
condition    = NAME "=" NAME
```

Remove specific combinations by matching axis **keys** (not values).

```jinja
{{exclude outfit=swimsuit AND emotion=angry}}
{{exclude outfit=dress AND emotion=angry}}
```

Multiple `AND` conditions in one statement = all must match. Multiple `{{exclude}}` statements = any can match (OR semantics across statements).

---

## 7. Template Block — `{{template}}...{{/template}}`

```
template_block = "{{template}}" TEMPLATE_BODY "{{/template}}"
```

The prompt template. Placeholders are substituted for each combination:

| Placeholder | Meaning |
|---|---|
| `{{var_name}}` | Variable value or axis entry value |
| `{{var_name.key}}` | Axis entry key (e.g. `happy`, `uniform`) |
| `{{w:N:text}}` | Weight annotation → renders as `(text:N)` for Stable Diffusion |

```jinja
{{template}}
{{w:1.1:{{quality}}}}, {{character}},
{{outfit}}, {{emotion}}, {{pose}},
detailed background
{{/template}}
```

**Weight syntax detail:** `{{w:1.2:bright eyes}}` renders as `(bright eyes:1.2)`. This is Stable Diffusion prompt weighting syntax.

---

## 8. Filename Block — `{{filename}}...{{/filename}}`

```
filename_block = "{{filename}}" TEMPLATE_BODY "{{/filename}}"
```

Same substitution rules as template, but produces the output filename.

```jinja
{{filename}}char_{{outfit.key}}_{{emotion.key}}_{{pose.key}}{{/filename}}
```

Renders to e.g.: `char_uniform_happy_standing`

---

## 9. Complete Example

```jinja
{{# Character asset generation template #}}

{{set character = "1girl, silver hair, blue eyes, detailed face"}}
{{set quality = "masterpiece, best quality, highly detailed"}}

{{axis outfit}}
  uniform  : "school uniform, pleated skirt"
  casual   : "hoodie, jeans, sneakers"
  dress    : "elegant black dress"
  swimsuit : "bikini, beach setting"
{{/axis}}

{{axis emotion weighted}}
  happy   : "smiling, {{w:1.2:bright eyes}}, cheerful"  @ 3
  neutral : "calm expression, relaxed"                  @ 3
  sad     : "teary eyes, frowning, melancholic"         @ 1
  angry   : "angry expression, furrowed brows"          @ 1
{{/axis}}

{{axis pose}}
  standing : "standing pose, full body shot"
  portrait : "upper body, portrait shot"
{{/axis}}

{{combine outfit * emotion * pose}}

{{exclude outfit=swimsuit AND emotion=angry}}
{{exclude outfit=dress AND emotion=angry}}

{{template}}
{{w:1.1:{{quality}}}}, {{character}},
{{outfit}}, {{emotion}}, {{pose}},
detailed background
{{/template}}

{{filename}}char_{{outfit.key}}_{{emotion.key}}_{{pose.key}}{{/filename}}
```

**Output count:** 4 outfits × 4 emotions × 2 poses = 32, minus 2 excluded = **30 prompts**.

---

## 10. API Endpoints

The DSL is served via a FastAPI server (`server.py`):

### `POST /render`
```json
// Request
{ "template": "<DSL source string>" }

// Response
{
  "count": 30,
  "items": [
    {
      "filename": "char_uniform_happy_standing",
      "prompt": "(masterpiece, best quality:1.1), 1girl, silver hair..., school uniform..., smiling..., standing...",
      "meta": { "outfit": "uniform", "emotion": "happy", "pose": "standing" }
    }
  ]
}
```

### `POST /workflow/inject`
Injects rendered prompts into a ComfyUI workflow JSON by replacing placeholders.

```json
// Request
{
  "workflow": { ... },
  "prompt": "1girl, school uniform, smiling",
  "placeholder": "{{input}}"
}
```

---

## 11. Quick Reference Card

| Construct | Syntax |
|---|---|
| Comment | `{{# text #}}` |
| Variable | `{{set name = "value"}}` |
| Axis | `{{axis name}}` ... `{{/axis}}` |
| Axis (weighted) | `{{axis name weighted}}` ... `{{/axis}}` |
| Axis (include) | `{{axis name include="text"}}` ... `{{/axis}}` |
| Axis entry | `key: "value"` or `key: "value" @ 3` |
| Combine | `{{combine a * b + c}}` |
| Combine (alias) | `{{combine x = a * b}}` |
| Combine (sample) | `{{combine a * b : sample=5 seed=42}}` |
| Hide key | `~axis_name` in combine expression |
| Exclude | `{{exclude a=key1 AND b=key2}}` |
| Template | `{{template}}` ... `{{/template}}` |
| Filename | `{{filename}}` ... `{{/filename}}` |
| Placeholder | `{{var}}` or `{{var.key}}` |
| Weight tag | `{{w:1.2:text}}` → `(text:1.2)` |

---

## 12. Rules for LLM Code Generation

When generating DSL templates, follow these rules:

1. **Every template MUST have exactly one `{{combine}}` statement.** It defines what to generate.
2. **Every template MUST have exactly one `{{template}}` block and one `{{filename}}` block.**
3. **Axis names and variable names share one namespace** — don't reuse names.
4. **`{{set}}` variables are global constants** — use them for shared quality tags, character descriptions, etc.
5. **Axis entry keys** should be short, snake_case identifiers (used in filenames).
6. **Axis entry values** are the actual prompt text — comma-separated tags.
7. **Use `weighted` + `sample=N`** when you want a diverse subset rather than exhaustive combinations.
8. **Use `include="..."`** when every entry in an axis shares a common tag (e.g., `"nsfw"`, `"expressive face"`).
9. **Use `~` (hide key)** for axes whose keys shouldn't appear in filenames (e.g., literal strings, redundant axes).
10. **Use `{{exclude}}`** to prevent impossible or undesirable combinations (e.g., `swimsuit + angry`).
11. **String values are always double-quoted.** Escape internal quotes with `\"`.
12. **The `+` operator is union (merge lists), `*` is cartesian product (all combos).**
