"""
prompt_dsl.py
AI 이미지 프롬프트 배치 생성을 위한 DSL.

문법 정의:  prompt_dsl.lark
사용:       python prompt_dsl.py <template_file>
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from functools import reduce
from operator import mul
import itertools
import random
import re
import json

from lark import Lark, Transformer, UnexpectedInput


# ====== 데이터 모델 ======

@dataclass
class AxisValue:
    key: str
    value: str
    weight: float = 1.0
    hide_key: bool = False


@dataclass
class Axis:
    name: str
    values: List[AxisValue] = field(default_factory=list)
    weighted: bool = False


@dataclass
class ExcludeRule:
    conditions: Dict[str, str]


@dataclass
class Program:
    vars: Dict[str, str] = field(default_factory=dict)
    axes: Dict[str, Axis] = field(default_factory=dict)
    combine_alias: Optional[str] = None
    combine_expr: Any = None
    combine_opts: Dict[str, Any] = field(default_factory=dict)
    excludes: List[ExcludeRule] = field(default_factory=list)
    template: str = ""
    filename: str = ""
    sample: int = 0
    seed: Optional[int] = None


# ====== 파서 (Lark 기반) ======

GRAMMAR_PATH = Path(__file__).parent / "prompt_dsl.lark"


class _Builder(Transformer):
    """파스 트리를 Program 객체로 변환."""

    def start(self, items):
        prog = Program()
        for item in items:
            if item is None:
                continue
            kind, payload = item
            match kind:
                case "set":
                    name, value = payload
                    prog.vars[name] = value
                case "axis":
                    prog.axes[payload.name] = payload
                case "combine":
                    prog.combine_alias = payload.get("alias")
                    prog.combine_expr = payload.get("expr")
                    for k, v in payload.items():
                        if k not in ("alias", "expr"):
                            prog.combine_opts[k] = v
                    prog.sample = payload.get("sample", 0)
                    prog.seed = payload.get("seed")
                case "exclude":
                    prog.excludes.append(payload)
                case "template":
                    prog.template = payload.strip()
                case "filename":
                    prog.filename = payload.strip()
        return prog

    def statement(self, items):
        return items[0]

    def set_stmt(self, items):
        return ("set", (str(items[0]), str(items[1])[1:-1]))

    def axis_def(self, items):
        name = str(items[0])
        weighted = len(items) > 1 and str(items[1]) == "weighted"
        entries = items[2:] if weighted else items[1:]
        return ("axis", Axis(name=name, weighted=weighted, values=list(entries)))

    def axis_entry(self, items):
        key = str(items[0])
        value = str(items[1])[1:-1]
        weight = float(items[2]) if len(items) > 2 else 1.0
        return AxisValue(key=key, value=value, weight=weight)

    def combine_stmt(self, items):
        if len(items) >= 1 and isinstance(items[0], tuple) and items[0][0] == "assign":
            alias = items[0][1]
            expr = items[0][2]
            opts_start = 1
        else:
            alias = None
            expr = items[0]
            opts_start = 1

        opts = {}
        for item in items[opts_start:]:
            if isinstance(item, tuple):
                opts[item[0]] = item[1]

        return ("combine", {"alias": alias, "expr": expr, **opts})

    def combine_assignment(self, items):
        return ("assign", str(items[0]), items[1])

    def expr_add(self, items):
        if len(items) == 1:
            return items[0]
        return ("add", items)

    def expr_mul(self, items):
        if len(items) == 1:
            return items[0]
        return ("mul", items)

    def expr_var(self, items):
        return ("var", str(items[0]))

    def expr_str(self, items):
        return ("str", str(items[0])[1:-1])

    def expr_hide_key(self, items):
        return ("hide_key", items[0])

    def sample_opt(self, items):
        return ("sample", int(items[0]))

    def seed_opt(self, items):
        return ("seed", int(items[0]))

    def exclude_stmt(self, items):
        return ("exclude", ExcludeRule(conditions=dict(items)))

    def condition(self, items):
        return (str(items[0]), str(items[1]))

    def template_block(self, items):
        return ("template", str(items[0]))

    def filename_block(self, items):
        return ("filename", str(items[0]))

    def comment(self, items):
        return None


_parser = Lark(
    GRAMMAR_PATH.read_text(encoding="utf-8"),
    parser="lalr",
    transformer=_Builder(),
)


class DSLSyntaxError(Exception):
    """사용자에게 보여줄 친절한 문법 에러."""


def parse(src: str) -> Program:
    try:
        return _parser.parse(src)
    except UnexpectedInput as e:
        context = e.get_context(src, span=40)
        expected = getattr(e, "expected", None) or getattr(e, "allowed", None)
        msg = [f"문법 에러 (line {e.line}, column {e.column}):", "", context]
        if expected:
            readable = sorted({str(t).strip('"') for t in list(expected)})[:6]
            msg.append(f"기대한 토큰: {', '.join(readable)}")
        raise DSLSyntaxError("\n".join(msg)) from None


# ====== 평가기 ======

def eval_expr(expr, axes: Dict[str, Axis], vars: Dict[str, str]) -> List[Dict[str, AxisValue]]:
    kind, payload = expr
    if kind == 'var':
        name = payload
        if name in axes:
            return [{name: val} for val in axes[name].values]
        elif name in vars:
            return [{name: AxisValue(key=name, value=vars[name], weight=1.0)}]
        else:
            raise DSLSyntaxError(f"정의되지 않은 축 또는 변수: {name}")
    
    elif kind == 'str':
        dummy_name = f"__literal_{id(expr)}__"
        return [{dummy_name: AxisValue(key="", value=payload)}]

    elif kind == 'hide_key':
        res = eval_expr(payload, axes, vars)
        new_res = []
        for combo in res:
            new_combo = {}
            for k, v in combo.items():
                new_combo[k] = AxisValue(key=v.key, value=v.value, weight=v.weight, hide_key=True)
            new_res.append(new_combo)
        return new_res

    elif kind == 'add':
        res = []
        for child in payload:
            res.extend(eval_expr(child, axes, vars))
        return res
        
    elif kind == 'mul':
        res = eval_expr(payload[0], axes, vars)
        for child in payload[1:]:
            right = eval_expr(child, axes, vars)
            new_res = []
            for l in res:
                for r in right:
                    merged = dict(l)
                    merged.update(r)
                    new_res.append(merged)
            res = new_res
        return res
        
    return []


# ====== 렌더러 ======

def _substitute(template: str, ctx: Dict[str, Any], keys: Dict[str, str]) -> str:
    out = template
    for _ in range(5):  # 최대 5번 재귀적 치환
        prev = out
        out = re.sub(
            r'\{\{(\w+)\.key\}\}',
            lambda m: keys.get(m.group(1), m.group(0)),
            out,
        )
        out = re.sub(
            r'\{\{(\w+)\}\}',
            lambda m: str(ctx.get(m.group(1), m.group(0))),
            out,
        )
        if prev == out:
            break

    out = re.sub(
        r'\{\{w:([\d.]+):([^{}]+?)\}\}',
        lambda m: f"({m.group(2).strip()}:{m.group(1)})",
        out,
    )
    return out


def _clean_prompt(s: str) -> str:
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'\s*,\s*', ', ', s)
    s = re.sub(r'(,\s*)+', ', ', s)
    return s.strip(" ,\n")


def _weighted_sample(items, weights, k, rng):
    items, weights = list(items), list(weights)
    picked = []
    for _ in range(min(k, len(items))):
        total = sum(weights)
        if total <= 0:
            break
        r = rng.uniform(0, total)
        cum = 0.0
        for i, w in enumerate(weights):
            cum += w
            if cum >= r:
                picked.append(items.pop(i))
                weights.pop(i)
                break
    return picked


def render(prog: Program) -> List[Dict]:
    if not prog.combine_expr:
        return [{
            "filename": _substitute(prog.filename, prog.vars, {}).strip(),
            "prompt": _clean_prompt(_substitute(prog.template, prog.vars, {})),
            "meta": {},
        }]

    combos = eval_expr(prog.combine_expr, prog.axes, prog.vars)

    def excluded(combo_dict):
        cks = {k: v.key for k, v in combo_dict.items()}
        return any(
            all(cks.get(k) == v for k, v in rule.conditions.items())
            for rule in prog.excludes
        )

    combos = [c for c in combos if not excluded(c)]

    if prog.sample > 0 and prog.sample < len(combos):
        rng = random.Random(prog.seed)
        weights = [reduce(mul, (v.weight for v in combo.values()), 1.0) for combo in combos]
        combos = _weighted_sample(combos, weights, prog.sample, rng)

    results = []
    for combo in combos:
        ctx = dict(prog.vars)
        keys = {}
        for k, v in combo.items():
            ctx[k] = v.value
            keys[k] = v.key
            
        if prog.combine_alias:
            alias = prog.combine_alias
            # v.value가 비어있지 않은 것만 모아서 조립
            c_val = ", ".join(v.value for v in combo.values() if v.value.strip())
            c_key = "_".join(v.key for v in combo.values() if v.key.strip() and not getattr(v, "hide_key", False))
            ctx[alias] = c_val
            keys[alias] = c_key

        results.append({
            "filename": _substitute(prog.filename, ctx, keys).strip(),
            "prompt": _clean_prompt(_substitute(prog.template, ctx, keys)),
            "meta": dict(keys),
        })
    return results


# ====== ComfyUI 연동 ======

def inject_into_workflow(workflow: dict, prompt, placeholder: str = "{{input}}") -> dict:
    mapping = prompt if isinstance(prompt, dict) else {placeholder: prompt}

    def walk(obj):
        if isinstance(obj, dict):
            return {k: walk(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [walk(v) for v in obj]
        if isinstance(obj, str):
            out = obj
            for k, v in mapping.items():
                out = out.replace(k, v)
            return out
        return obj

    return walk(workflow)


# ====== CLI ======

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python prompt_dsl.py <template_file>")
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        src = f.read()
    try:
        prog = parse(src)
    except DSLSyntaxError as e:
        print(e)
        sys.exit(1)
    results = render(prog)
    for r in results:
        print(f"=== {r['filename']} ===")
        print(r["prompt"])
        print()
    print(f"Total: {len(results)} combinations")
