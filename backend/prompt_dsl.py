"""
prompt_dsl.py
AI 이미지 프롬프트 배치 생성을 위한 DSL.

문법 정의:  prompt_dsl.lark
사용:       python prompt_dsl.py <template_file>
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
import re
import json

from lark import Lark, Transformer, UnexpectedInput


# ====== 데이터 모델 ======

@dataclass
class AxisValue:
    key: str
    value: str
    hide_key: bool = False
    props: Dict[str, str] = field(default_factory=dict)


@dataclass
class Axis:
    name: str
    values: List[AxisValue] = field(default_factory=list)
    include: Optional[str] = None


@dataclass
class Condition:
    axis: str
    op: str         # "eq", "in", "not_in"
    values: List[str]


@dataclass
class ExcludeRule:
    conditions: List[Condition]
    connective: str = "AND"


@dataclass
class Program:
    vars: Dict[str, str] = field(default_factory=dict)
    axes: Dict[str, Axis] = field(default_factory=dict)
    combine_alias: Optional[str] = None
    combine_expr: Any = None
    excludes: List[ExcludeRule] = field(default_factory=list)
    template: str = ""
    filename: str = ""


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
        include = None
        entries = []
        for item in items[1:]:
            if isinstance(item, AxisValue):
                entries.append(item)
            else:
                # axis_include result: plain string
                include = str(item)
        return ("axis", Axis(name=name, include=include, values=entries))

    def axis_include(self, items):
        return str(items[0])[1:-1]

    def axis_entry(self, items):
        key = str(items[0])
        val = items[1]
        if isinstance(val, dict):
            props = val
            value = ", ".join(props.values())
        else:
            props = {}
            value = val
        return AxisValue(key=key, value=value, props=props)

    def axis_value(self, items):
        if not items:
            return {}
        if isinstance(items[0], tuple):
            return dict(items)
        return str(items[0])[1:-1]

    def axis_property(self, items):
        return (str(items[0]), str(items[1])[1:-1])

    def combine_stmt(self, items):
        if len(items) >= 1 and isinstance(items[0], tuple) and items[0][0] == "assign":
            alias = items[0][1]
            expr = items[0][2]
        else:
            alias = None
            expr = items[0]
        return ("combine", {"alias": alias, "expr": expr})

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

    def exclude_stmt(self, items):
        conditions = []
        connective = "AND"
        for item in items:
            if isinstance(item, Condition):
                conditions.append(item)
            elif item.type == 'OR':
                connective = "OR"
        return ("exclude", ExcludeRule(conditions=conditions, connective=connective))

    def condition(self, items):
        return items[0]

    def eq_condition(self, items):
        return Condition(axis=str(items[0]), op="eq", values=[str(items[1])])

    def in_condition(self, items):
        return Condition(axis=str(items[0]), op="in", values=[str(v) for v in items[1:]])

    def not_in_condition(self, items):
        return Condition(axis=str(items[0]), op="not_in", values=[str(v) for v in items[1:]])

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
            axis = axes[name]
            vals = axis.values
            if axis.include:
                vals = [
                    AxisValue(key=v.key, value=f"{v.value}, {axis.include}", hide_key=v.hide_key)
                    for v in vals
                ]
            return [{name: val} for val in vals]
        elif name in vars:
            return [{name: AxisValue(key=name, value=vars[name])}]
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
                new_combo[k] = AxisValue(key=v.key, value=v.value, hide_key=True)
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
            r'\{\{(\w+)\.(\w+)\}\}',
            lambda m: str(ctx.get(f"{m.group(1)}.{m.group(2)}", m.group(0))),
            out,
        )
        out = re.sub(
            r'\{\{(\w+)\}\}',
            lambda m: str(ctx.get(m.group(1), m.group(0))),
            out,
        )
        if prev == out:
            break

    return out


def _clean_prompt(s: str) -> str:
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'\s*,\s*', ', ', s)
    s = re.sub(r'(,\s*)+', ', ', s)
    return s.strip(" ,\n")


def render(prog: Program, *,
           only: Optional[Dict[str, List[str]]] = None,
           fix: Optional[Dict[str, str]] = None,
           skip_excludes: bool = False,
           extra_excludes: Optional[List[Dict[str, Any]]] = None,
           limit: int = 0,
           offset: int = 0) -> List[Dict]:
    if not prog.combine_expr:
        return [{
            "filename": _substitute(prog.filename, prog.vars, {}).strip(),
            "prompt": _clean_prompt(_substitute(prog.template, prog.vars, {})),
            "meta": {},
        }]

    combos = eval_expr(prog.combine_expr, prog.axes, prog.vars)

    # -- only: axis 값 선택적 포함 --
    if only:
        combos = [c for c in combos if all(
            c.get(ax) is not None and c[ax].key in keys
            for ax, keys in only.items()
        )]

    # -- fix: 특정 축을 단일 값으로 고정 --
    if fix:
        combos = [c for c in combos if all(
            c.get(ax) is not None and c[ax].key == val
            for ax, val in fix.items()
        )]

    # -- skip_excludes: 기존 exclude 규칙 무시 --
    if not skip_excludes:
        def program_excluded(combo_dict):
            cks = {k: v.key for k, v in combo_dict.items()}
            for rule in prog.excludes:
                results = []
                for cond in rule.conditions:
                    val = cks.get(cond.axis)
                    if val is None:
                        results.append(False)
                    elif cond.op == "eq":
                        results.append(val == cond.values[0])
                    elif cond.op == "in":
                        results.append(val in cond.values)
                    elif cond.op == "not_in":
                        results.append(val not in cond.values)
                if rule.connective == "AND":
                    if all(results):
                        return True
                else:
                    if any(results):
                        return True
            return False
        combos = [c for c in combos if not program_excluded(c)]

    # -- extra_excludes: 추가 제외 규칙 --
    if extra_excludes:
        _extra_rules = [ExcludeRule(
            [Condition(**c) for c in r["conditions"]],
            r.get("connective", "AND")
        ) for r in extra_excludes]

        def extra_excluded(combo_dict):
            cks = {k: v.key for k, v in combo_dict.items()}
            for rule in _extra_rules:
                results = []
                for cond in rule.conditions:
                    val = cks.get(cond.axis)
                    if val is None:
                        results.append(False)
                    elif cond.op == "eq":
                        results.append(val == cond.values[0])
                    elif cond.op == "in":
                        results.append(val in cond.values)
                    elif cond.op == "not_in":
                        results.append(val not in cond.values)
                if rule.connective == "AND":
                    if all(results):
                        return True
                else:
                    if any(results):
                        return True
            return False
        combos = [c for c in combos if not extra_excluded(c)]

    total = len(combos)

    # -- 페이지네이션 --
    if offset:
        combos = combos[offset:]
    if limit:
        combos = combos[:limit]

    results = []
    for combo in combos:
        ctx = dict(prog.vars)
        keys = {}
        for k, v in combo.items():
            ctx[k] = v.value
            if not getattr(v, "hide_key", False):
                keys[k] = v.key
            for prop_name, prop_val in v.props.items():
                ctx[f"{k}.{prop_name}"] = prop_val
            
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
            "meta": {k: v for k, v in keys.items() if k != prog.combine_alias},
        })

    axes_info = {}
    for name, axis in prog.axes.items():
        axes_info[name] = {
            "include": axis.include,
            "values": [
                {
                    "key": v.key,
                    "value": v.value,
                    "props": dict(v.props),
                }
                for v in axis.values
            ]
        }

    excludes_info = [
        {
            "conditions": [
                {"axis": c.axis, "op": c.op, "values": list(c.values)}
                for c in rule.conditions
            ],
            "connective": rule.connective,
        }
        for rule in prog.excludes
    ]

    return {
        "total": total,
        "items": results,
        "axes": axes_info,
        "sets": dict(prog.vars),
        "excludes": excludes_info,
    }


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
    rendered = render(prog)
    for r in rendered["items"]:
        print(f"=== {r['filename']} ===")
        print(r["prompt"])
        print()
    print(f"Total: {rendered['total']} combinations")
