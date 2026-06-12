"""
prompt_dsl.py
AI 이미지 프롬프트 배치 생성을 위한 DSL.

문법 정의:  prompt_dsl.lark
사용:       python prompt_dsl.py <template_file>
"""

from __future__ import annotations

from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, cast, Dict, List, Optional, Union
import re

from lark import Lark, Transformer, UnexpectedInput


# ====== 라인 타입 enum ======

class LineType(Enum):
    """템플릿 줄의 의미론적 타입."""
    SET_HEADER = "set-header"
    AXIS_HEADER = "axis-header"
    AXIS_BODY = "axis-body"
    AXIS_INCLUDE = "axis-include"
    AXIS_END = "axis-end"
    TEMPLATE_HEADER = "template-header"
    TEMPLATE_BODY = "template-body"
    TEMPLATE_END = "template-end"
    FILENAME_HEADER = "filename-header"
    FILENAME_BODY = "filename-body"
    FILENAME_END = "filename-end"
    COMBINE = "combine"
    EXCLUDE = "exclude"
    COMMENT = "comment"
    END = "end"
    OTHER = "other"


# ====== 데이터 모델 ======

@dataclass
class TemplateLine:
    line_num: int
    text: str
    keys: List[str] = field(default_factory=list)
    type: LineType = LineType.OTHER

    def to_dict(self) -> Dict[str, Any]:
        """JSON 직렬화용 dict 변환."""
        return {
            "line_num": self.line_num,
            "text": self.text,
            "keys": self.keys,
            "type": self.type.value,
        }


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
    is_optional: bool = False


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
    template_structure: List[TemplateLine] = field(default_factory=list)


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
        is_optional = False
        include = None
        entries = []
        for item in items[1:]:
            if str(item) == "?":
                is_optional = True
            elif isinstance(item, AxisValue):
                entries.append(item)
            else:
                # axis_include result: plain string
                include = str(item)
        return ("axis", Axis(name=name, include=include, values=entries, is_optional=is_optional))

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


try:
    _raw_parser = Lark(
        GRAMMAR_PATH.read_text(encoding="utf-8"),
        parser="lalr",
        propagate_positions=True,
    )
    _parser = Lark(
        GRAMMAR_PATH.read_text(encoding="utf-8"),
        parser="lalr",
        transformer=_Builder(),
    )
except FileNotFoundError:
    raise ImportError(f"DSL grammar file not found: {GRAMMAR_PATH}")
except Exception as exc:
    raise ImportError(f"Failed to load DSL grammar: {exc}") from exc


class DSLSyntaxError(Exception):
    """사용자에게 보여줄 친절한 문법 에러."""


_TYPE_PRIORITY: Dict[LineType, int] = {
    LineType.SET_HEADER: 10,
    LineType.AXIS_HEADER: 10,
    LineType.TEMPLATE_HEADER: 10,
    LineType.FILENAME_HEADER: 10,
    LineType.AXIS_BODY: 9,
    LineType.TEMPLATE_BODY: 9,
    LineType.FILENAME_BODY: 9,
    LineType.AXIS_END: 8,
    LineType.TEMPLATE_END: 8,
    LineType.FILENAME_END: 8,
    LineType.END: 8,
    LineType.AXIS_INCLUDE: 7,
    LineType.COMBINE: 5,
    LineType.EXCLUDE: 5,
    LineType.COMMENT: 5,
    LineType.OTHER: 0,
}


class _StructureExtractor:
    """Lark AST에서 템플릿 줄 번호별 매핑 정보를 추출한다."""

    _REF_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_\-][a-zA-Z0-9_\-]*)\s*\}\}")

    def __init__(self, source: str) -> None:
        self.lines = source.split("\n")
        self.n = len(self.lines)
        self.rows: List[Dict[str, Any]] = [
            {
                "line_num": i + 1,
                "text": self.lines[i],
                "keys": [],
                "type": LineType.OTHER,
                "priority": 0,
            }
            for i in range(self.n)
        ]

    def _tag(self, start: int, end: int, typ: LineType, keys: Optional[List[str]] = None) -> None:
        pri = _TYPE_PRIORITY.get(typ, 0)
        for i in range(start - 1, min(end, self.n)):
            if pri >= self.rows[i]["priority"]:
                self.rows[i]["type"] = typ
                self.rows[i]["priority"] = pri
            if keys:
                row_keys: List[str] = self.rows[i]["keys"]
                for k in keys:
                    if k not in row_keys:
                        row_keys.append(k)

    def _find_axis_name(self, node) -> Optional[str]:
        for c in node.children:
            if hasattr(c, "type") and c.type == "NAME":
                return str(c)
        return None

    def _extract_entry_key(self, node) -> Optional[str]:
        for c2 in node.children:
            if hasattr(c2, "type") and c2.type == "NAME":
                return str(c2)
        return None

    def _collect_body_refs(self, start: int, end: int, typ: LineType) -> None:
        for i in range(start, end + 1):
            if i > self.n:
                break
            refs = self._REF_PATTERN.findall(self.lines[i - 1])
            if refs:
                self._tag(i, i, typ, refs)

    def _dfs(self, node) -> None:
        if not hasattr(node, "data") or not hasattr(node, "meta"):
            return
        rule: str = node.data
        start: int = getattr(node.meta, "line", 1)
        end: int = getattr(node.meta, "end_line", start)

        if rule == "set_stmt":
            self._tag(start, start, LineType.SET_HEADER)
            name = self._find_axis_name(node)
            if name:
                self._tag(start, start, LineType.SET_HEADER, [name])
        elif rule == "axis_def":
            self._tag(start, start, LineType.AXIS_HEADER)
            axis_name = self._find_axis_name(node)
            if axis_name:
                self._tag(start, start, LineType.AXIS_HEADER, [axis_name])
            for c in node.children:
                if not hasattr(c, "data"):
                    continue
                if c.data == "axis_entry":
                    cs = getattr(c.meta, "line", start)
                    ce = getattr(c.meta, "end_line", cs)
                    val_key = self._extract_entry_key(c)
                    if axis_name and val_key:
                        self._tag(cs, ce, LineType.AXIS_BODY, [f"{axis_name}:{val_key}"])
                    else:
                        self._tag(cs, ce, LineType.AXIS_BODY)
                elif c.data == "axis_include":
                    cs = getattr(c.meta, "line", start)
                    ce = getattr(c.meta, "end_line", cs)
                    self._tag(cs, ce, LineType.AXIS_INCLUDE)
                    if axis_name:
                        self._tag(cs, ce, LineType.AXIS_HEADER, [axis_name])
            self._tag(end, end, LineType.AXIS_END)
        elif rule == "template_block":
            self._tag(start, start, LineType.TEMPLATE_HEADER)
            body_start = start + 1
            body_end = end - 1
            if body_end >= body_start:
                self._tag(body_start, body_end, LineType.TEMPLATE_BODY)
                self._collect_body_refs(body_start, body_end, LineType.TEMPLATE_BODY)
            self._tag(end, end, LineType.TEMPLATE_END)
        elif rule == "filename_block":
            self._tag(start, start, LineType.FILENAME_HEADER)
            body_start = start + 1
            body_end = end - 1
            if body_end >= body_start:
                self._tag(body_start, body_end, LineType.FILENAME_BODY)
                self._collect_body_refs(body_start, body_end, LineType.FILENAME_BODY)
            self._tag(end, end, LineType.FILENAME_END)
        elif rule == "combine_stmt":
            self._tag(start, end, LineType.COMBINE)
        elif rule == "exclude_stmt":
            self._tag(start, end, LineType.EXCLUDE)
        elif rule == "comment":
            self._tag(start, end, LineType.COMMENT)

        for c in node.children:
            if hasattr(c, "data"):
                self._dfs(c)

    def extract(self, tree) -> List[TemplateLine]:
        self._dfs(tree)
        return [
            TemplateLine(
                line_num=d["line_num"],
                text=d["text"],
                keys=d["keys"],
                type=d["type"],
            )
            for d in self.rows
        ]


def _build_template_structure(tree, source: str) -> List[TemplateLine]:
    return _StructureExtractor(source).extract(tree)


def parse(src: str) -> Program:
    try:
        raw_tree = _raw_parser.parse(src)
        structure = _build_template_structure(raw_tree, src)
        prog = cast(Program, _parser.parse(src))
        prog.template_structure = structure
        return prog
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
                    AxisValue(key=v.key, value=f"{v.value}, {axis.include}", hide_key=v.hide_key, props=v.props)
                    for v in vals
                ]
            res = [{name: val} for val in vals]
            if getattr(axis, "is_optional", False):
                res.append({})
            return res
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
                new_combo[k] = AxisValue(key=v.key, value=v.value, hide_key=True, props=v.props)
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
            for left in res:
                for r in right:
                    merged = dict(left)
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
           offset: int = 0) -> Dict[str, Any]:
    if not prog.combine_expr:
        return {
            "total": 1,
            "items": [{
                "filename": _substitute(prog.filename, prog.vars, {}).strip(),
                "prompt": _clean_prompt(_substitute(prog.template, prog.vars, {})),
                "meta": {},
            }],
            "axes": {},
            "sets": dict(prog.vars),
            "excludes": [],
            "template_structure": [ln.to_dict() for ln in prog.template_structure],
        }

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
        
        # 생략된 선택적 축들에 대해 빈 문자열 기본값 바인딩
        for name, axis in prog.axes.items():
            if name not in combo:
                ctx[name] = ""
                keys[name] = ""
                
        for k, v in combo.items():
            ctx[k] = v.value
            if not getattr(v, "hide_key", False):
                keys[k] = v.key
            else:
                keys[k] = ""
            for prop_name, prop_val in v.props.items():
                ctx[f"{k}.{prop_name}"] = prop_val
            
        if prog.combine_alias:
            alias = prog.combine_alias
            # v.value가 비어있지 않은 것만 모아서 조립
            c_val = ", ".join(v.value for v in combo.values() if v.value.strip())
            c_key = "_".join(v.key for v in combo.values() if v.key.strip() and not getattr(v, "hide_key", False))
            ctx[alias] = c_val
            keys[alias] = c_key

        filename = _substitute(prog.filename, ctx, keys).strip()
        
        # clean_filename 옵션이 true(기본값)인 경우에만 다듬기 수행
        clean_opt = prog.vars.get("clean_filename", "true").lower() == "true"
        if clean_opt:
            filename = re.sub(r'__+', '_', filename)
            filename = re.sub(r'--+', '-', filename)
            filename = re.sub(r'\.\.+', '.', filename)
            filename = filename.strip('_-. ')

        results.append({
            "filename": filename,
            "prompt": _clean_prompt(_substitute(prog.template, ctx, keys)),
            "meta": {k: v for k, v in keys.items() if k != prog.combine_alias and keys[k]},
        })

    axes_info = {}
    for name, axis in prog.axes.items():
        axes_info[name] = {
            "include": axis.include,
            "is_optional": getattr(axis, "is_optional", False),
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
        "template_structure": [ln.to_dict() for ln in prog.template_structure],
    }


# ====== ComfyUI 연동 ======

WorkflowNode = Union[Dict[str, 'WorkflowNode'], List['WorkflowNode'], str, int, float, bool, None]


def inject_into_workflow(workflow: WorkflowNode, prompt: Union[str, Dict[str, str]], placeholder: str = "{{input}}") -> WorkflowNode:
    mapping: Dict[str, str] = prompt if isinstance(prompt, dict) else {placeholder: prompt}

    def walk(obj: WorkflowNode) -> WorkflowNode:
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
