"""Unit tests for backend.src.prompt_dsl — parser, evaluator, renderer, inject."""

from __future__ import annotations

import pytest

from backend.src.prompt_dsl import (
    Axis,
    AxisValue,
    Condition,
    DSLSyntaxError,
    ExcludeRule,
    Program,
    _clean_prompt,
    eval_expr,
    inject_into_workflow,
    parse,
    render,
)


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _simple_program():
    """Minimal program: one axis, one combine, one template, one filename."""
    return parse(
        '{{set style = "anime"}}\n'
        '{{axis mood}}\n'
        '  happy : "a happy scene"\n'
        '  sad : "a sad scene"\n'
        '{{/axis}}\n'
        '{{combine mood}}\n'
        '{{template}}{{mood}}{{/template}}\n'
        '{{filename}}{{mood}}{{/filename}}\n'
    )


# ══════════════════════════════════════════════
#  Parser Tests
# ══════════════════════════════════════════════

class TestParser:
    """Tests for parse() producing a correct Program."""

    def test_basic_parse_returns_program(self):
        prog = _simple_program()
        assert isinstance(prog, Program)

    def test_vars_parsed(self):
        prog = _simple_program()
        assert prog.vars == {"style": "anime"}

    def test_axes_parsed(self):
        prog = _simple_program()
        assert "mood" in prog.axes
        axis = prog.axes["mood"]
        assert isinstance(axis, Axis)
        assert axis.name == "mood"
        assert not axis.is_optional

    def test_axis_values_parsed(self):
        prog = _simple_program()
        vals = prog.axes["mood"].values
        assert len(vals) == 2
        assert vals[0].key == "happy"
        assert vals[0].value == "a happy scene"
        assert vals[1].key == "sad"
        assert vals[1].value == "a sad scene"

    def test_combine_expr_parsed(self):
        prog = _simple_program()
        assert prog.combine_expr is not None
        # 'mood' → ("var", "mood")
        assert prog.combine_expr == ("var", "mood")

    def test_combine_alias_none_when_no_alias(self):
        prog = _simple_program()
        assert prog.combine_alias is None

    def test_template_parsed(self):
        prog = _simple_program()
        assert prog.template == "{{mood}}"

    def test_filename_parsed(self):
        prog = _simple_program()
        assert prog.filename == "{{mood}}"

    def test_comment_ignored(self):
        prog = parse(
            '{{# this is a comment #}}\n'
            '{{axis color}}\n'
            '  red : "red"\n'
            '{{/axis}}\n'
            '{{combine color}}\n'
            '{{template}}color{{/template}}\n'
            '{{filename}}color{{/filename}}\n'
        )
        assert "color" in prog.axes

    def test_set_statement(self):
        prog = parse('{{set greeting = "hello world"}}\n')
        assert prog.vars == {"greeting": "hello world"}

    def test_multiple_set_statements(self):
        prog = parse(
            '{{set a = "1"}}\n'
            '{{set b = "2"}}\n'
            '{{axis x}}\n'
            '  v : "val"\n'
            '{{/axis}}\n'
            '{{combine x}}\n'
            '{{template}}{{a}}-{{b}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.vars["a"] == "1"
        assert prog.vars["b"] == "2"

    def test_optional_axis(self):
        prog = parse(
            '{{axis mood?}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.axes["mood"].is_optional is True

    def test_axis_include(self):
        prog = parse(
            '{{axis mood include="default inc"}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.axes["mood"].include == "default inc"

    def test_axis_with_props(self):
        prog = parse(
            '{{axis quality}}\n'
            '  hd : {res: "1920x1080", fps: "60"}\n'
            '{{/axis}}\n'
            '{{combine quality}}\n'
            '{{template}}{{quality}}{{/template}}\n'
            '{{filename}}{{quality}}{{/filename}}\n'
        )
        v = prog.axes["quality"].values[0]
        assert v.key == "hd"
        assert v.props["res"] == "1920x1080"
        assert v.props["fps"] == "60"

    def test_combine_alias(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{axis b}}\n'
            '  y : "y"\n'
            '{{/axis}}\n'
            '{{combine combo=a * b}}\n'
            '{{template}}{{combo}}{{/template}}\n'
            '{{filename}}{{combo}}{{/filename}}\n'
        )
        assert prog.combine_alias == "combo"

    def test_combine_union_expression(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{axis b}}\n'
            '  y : "y"\n'
            '{{/axis}}\n'
            '{{combine a + b}}\n'
            '{{template}}{{a}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.combine_expr == ("add", [("var", "a"), ("var", "b")])

    def test_combine_cartesian_expression(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{axis b}}\n'
            '  y : "y"\n'
            '{{/axis}}\n'
            '{{combine a * b}}\n'
            '{{template}}{{a}} {{b}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.combine_expr == ("mul", [("var", "a"), ("var", "b")])

    def test_combine_hide_key(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{combine ~a}}\n'
            '{{template}}{{a}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.combine_expr == ("hide_key", ("var", "a"))

    def test_combine_literal_string(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{combine a + "literal"}}\n'
            '{{template}}{{a}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert prog.combine_expr == ("add", [("var", "a"), ("str", "literal")])

    def test_exclude_eq(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=sad}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        assert len(prog.excludes) == 1
        rule = prog.excludes[0]
        assert rule.connective == "AND"
        assert len(rule.conditions) == 1
        cond = rule.conditions[0]
        assert cond.axis == "mood"
        assert cond.op == "eq"
        assert cond.values == ["sad"]

    def test_exclude_in(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "a"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood in [a, b]}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        cond = prog.excludes[0].conditions[0]
        assert cond.op == "in"
        assert cond.values == ["a", "b"]

    def test_exclude_not_in(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "a"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood not in [x]}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        cond = prog.excludes[0].conditions[0]
        assert cond.op == "not_in"
        assert cond.values == ["x"]

    def test_exclude_or_connective(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "a"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=a OR mood=b}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        rule = prog.excludes[0]
        assert rule.connective == "OR"


# ══════════════════════════════════════════════
#  Syntax Error Tests
# ══════════════════════════════════════════════

class TestDSLSyntaxError:
    """Tests for malformed DSL input raising DSLSyntaxError."""

    def test_unclosed_axis_block(self):
        with pytest.raises(DSLSyntaxError):
            parse('{{axis mood}}\n  happy : "h"\n')

    def test_unclosed_template_block(self):
        with pytest.raises(DSLSyntaxError):
            parse('{{template}}some content\n')

    def test_invalid_statement(self):
        with pytest.raises(DSLSyntaxError):
            parse('{{invalid_stmt}}\n')

    def test_empty_input(self):
        # Empty input should parse (all fields default)
        prog = parse("")
        assert isinstance(prog, Program)
        assert prog.vars == {}

    def test_set_missing_value(self):
        with pytest.raises(DSLSyntaxError):
            parse('{{set x}}\n')


# ══════════════════════════════════════════════
#  Evaluator Tests
# ══════════════════════════════════════════════

class TestEvalExpr:
    """Tests for eval_expr() producing combination contexts."""

    def test_var_axis(self):
        axis = Axis(name="mood", values=[
            AxisValue(key="happy", value="happy scene"),
            AxisValue(key="sad", value="sad scene"),
        ])
        combos = eval_expr(("var", "mood"), {"mood": axis}, {})
        assert len(combos) == 2
        assert combos[0]["mood"].key == "happy"
        assert combos[1]["mood"].key == "sad"

    def test_var_optional_axis_includes_empty(self):
        axis = Axis(name="mood", is_optional=True, values=[
            AxisValue(key="happy", value="happy scene"),
        ])
        combos = eval_expr(("var", "mood"), {"mood": axis}, {})
        # One real + one empty (omitted)
        assert len(combos) == 2
        assert {} == combos[1]

    def test_var_from_sets(self):
        combos = eval_expr(("var", "greeting"), {}, {"greeting": "hello"})
        assert len(combos) == 1
        assert combos[0]["greeting"].value == "hello"

    def test_var_undefined_raises(self):
        with pytest.raises(DSLSyntaxError, match="정의되지 않은 축"):
            eval_expr(("var", "unknown"), {}, {})

    def test_str_literal(self):
        combos = eval_expr(("str", "hello"), {}, {})
        assert len(combos) == 1
        # The literal is stored in a dummy key
        val = list(combos[0].values())[0]
        assert val.value == "hello"

    def test_hide_key(self):
        axis = Axis(name="mood", values=[
            AxisValue(key="happy", value="happy scene"),
        ])
        combos = eval_expr(("hide_key", ("var", "mood")), {"mood": axis}, {})
        assert len(combos) == 1
        assert combos[0]["mood"].hide_key is True

    def test_add_union(self):
        a = Axis(name="a", values=[AxisValue(key="x", value="x")])
        b = Axis(name="b", values=[AxisValue(key="y", value="y")])
        combos = eval_expr(("add", [("var", "a"), ("var", "b")]), {"a": a, "b": b}, {})
        assert len(combos) == 2

    def test_mul_cartesian(self):
        a = Axis(name="a", values=[AxisValue(key="x", value="x"), AxisValue(key="x2", value="x2")])
        b = Axis(name="b", values=[AxisValue(key="y", value="y")])
        combos = eval_expr(("mul", [("var", "a"), ("var", "b")]), {"a": a, "b": b}, {})
        assert len(combos) == 2  # 2 * 1
        assert "a" in combos[0]
        assert "b" in combos[0]

    def test_axis_include_appended(self):
        axis = Axis(name="mood", include="master, masterpiece", values=[
            AxisValue(key="happy", value="happy"),
        ])
        combos = eval_expr(("var", "mood"), {"mood": axis}, {})
        assert combos[0]["mood"].value == "happy, master, masterpiece"


# ══════════════════════════════════════════════
#  Render Tests — Basic
# ══════════════════════════════════════════════

class TestRenderBasic:
    """Tests for render() without combine expressions (no axes)."""

    def test_render_no_combine(self):
        prog = Program(
            vars={"greeting": "hello"},
            axes={},
            combine_alias=None,
            combine_expr=None,
            excludes=[],
            template="{{greeting}} world",
            filename="out",
        )
        result = render(prog)
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "hello world"
        assert result["items"][0]["filename"] == "out"
        assert result["sets"] == {"greeting": "hello"}

    def test_render_no_combine_no_vars(self):
        prog = Program(
            vars={},
            axes={},
            combine_alias=None,
            combine_expr=None,
            excludes=[],
            template="just a prompt",
            filename="simple",
        )
        result = render(prog)
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "just a prompt"

    def test_render_sets_variable_substitution(self):
        prog = parse(
            '{{set prefix = "photo"}}\n'
            '{{axis style}}\n'
            '  anime : "anime style"\n'
            '{{/axis}}\n'
            '{{combine style}}\n'
            '{{template}}{{prefix}} of {{style}}{{/template}}\n'
            '{{filename}}{{style}}{{/filename}}\n'
        )
        result = render(prog)
        assert result["items"][0]["prompt"] == "photo of anime style"


# ══════════════════════════════════════════════
#  Render Tests — Combine
# ══════════════════════════════════════════════

class TestRenderCombine:
    """Tests for render() with various combine expressions."""

    def test_single_axis(self):
        prog = parse(
            '{{axis color}}\n'
            '  red : "red"\n'
            '  blue : "blue"\n'
            '{{/axis}}\n'
            '{{combine color}}\n'
            '{{template}}a {{color}} scene{{/template}}\n'
            '{{filename}}{{color}}{{/filename}}\n'
        )
        result = render(prog)
        assert result["total"] == 2
        prompts = [i["prompt"] for i in result["items"]]
        assert "a red scene" in prompts
        assert "a blue scene" in prompts

    def test_cartesian_product(self):
        prog = parse(
            '{{axis color}}\n'
            '  red : "red"\n'
            '  blue : "blue"\n'
            '{{/axis}}\n'
            '{{axis size}}\n'
            '  big : "big"\n'
            '  small : "small"\n'
            '{{/axis}}\n'
            '{{combine color * size}}\n'
            '{{template}}{{color}} {{size}}{{/template}}\n'
            '{{filename}}{{color}}_{{size}}{{/filename}}\n'
        )
        result = render(prog)
        assert result["total"] == 4  # 2 * 2

    def test_union_add(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{axis b}}\n'
            '  y : "y"\n'
            '{{/axis}}\n'
            '{{combine a + b}}\n'
            '{{template}}{{a}}{{b}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        assert result["total"] == 2

    def test_combine_alias(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{combine combo=mood}}\n'
            '{{template}}{{combo}}{{/template}}\n'
            '{{filename}}{{combo}}{{/filename}}\n'
        )
        result = render(prog)
        # Alias should appear as a combined value
        filenames = [i["filename"] for i in result["items"]]
        assert "happy" in filenames
        assert "sad" in filenames

    def test_combine_alias_with_cartesian(self):
        prog = parse(
            '{{axis a}}\n'
            '  x : "x"\n'
            '{{/axis}}\n'
            '{{axis b}}\n'
            '  y : "y"\n'
            '{{/axis}}\n'
            '{{combine combo=a * b}}\n'
            '{{template}}{{combo}}{{/template}}\n'
            '{{filename}}{{combo}}{{/filename}}\n'
        )
        result = render(prog)
        assert result["total"] == 1  # 1*1


# ══════════════════════════════════════════════
#  Render Tests — Exclude
# ══════════════════════════════════════════════

class TestRenderExclude:
    """Tests for render() with exclude rules."""

    def test_exclude_eq_blocks_matching(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=sad}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "happy"

    def test_exclude_in_blocks_matching(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "alpha"\n'
            '  b : "beta"\n'
            '  c : "gamma"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood in [a, b]}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "gamma"

    def test_exclude_not_in_keeps_matching(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "alpha"\n'
            '  b : "beta"\n'
            '  c : "gamma"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood not in [a]}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        # "not in [a]" means exclude anything whose key is NOT in [a]
        # only "a" is in [a] → exclude b and c
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "alpha"

    def test_exclude_and_connective(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{axis light}}\n'
            '  bright : "bright"\n'
            '  dark : "dark"\n'
            '{{/axis}}\n'
            '{{combine mood * light}}\n'
            '{{exclude mood=happy AND light=dark}}\n'
            '{{template}}{{mood}} {{light}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        # 2 combos, one excluded (happy+dark)
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "happy bright"

    def test_exclude_or_connective(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=happy OR mood=sad}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        # OR: both match, all excluded
        assert result["total"] == 0

    def test_skip_excludes_flag(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=sad}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog, skip_excludes=True)
        # Skip excludes: all items returned
        assert result["total"] == 2

    def test_extra_excludes(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '  angry : "angry"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=angry}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(
            prog,
            extra_excludes=[
                {"conditions": [{"axis": "mood", "op": "eq", "values": ["sad"]}], "connective": "AND"}
            ],
        )
        # Both "angry" (program exclude) and "sad" (extra exclude) removed
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "happy"

    def test_excludes_info_in_output(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{exclude mood=happy}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        assert len(result["excludes"]) == 1
        exc = result["excludes"][0]
        assert exc["conditions"][0]["axis"] == "mood"
        assert exc["conditions"][0]["op"] == "eq"
        assert exc["connective"] == "AND"


# ══════════════════════════════════════════════
#  Render Tests — Filters
# ══════════════════════════════════════════════

class TestRenderFilters:
    """Tests for render() with only, fix, limit, offset."""

    def test_only_filter(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog, only={"mood": ["happy"]})
        assert result["total"] == 1
        assert result["items"][0]["prompt"] == "happy"

    def test_fix_filter(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '  sad : "sad"\n'
            '{{/axis}}\n'
            '{{axis light}}\n'
            '  bright : "bright"\n'
            '  dark : "dark"\n'
            '{{/axis}}\n'
            '{{combine mood * light}}\n'
            '{{template}}{{mood}} {{light}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog, fix={"light": "bright"})
        assert result["total"] == 2
        for item in result["items"]:
            assert "bright" in item["prompt"]

    def test_limit(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "a"\n'
            '  b : "b"\n'
            '  c : "c"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog, limit=2)
        assert result["total"] == 3  # total reflects unfiltered count
        assert len(result["items"]) == 2

    def test_offset(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "a"\n'
            '  b : "b"\n'
            '  c : "c"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog, offset=1)
        # total reflects count before offset slicing
        assert result["total"] == 3
        # offset truncates from front: combos[1:]
        assert len(result["items"]) == 2

    def test_limit_and_offset(self):
        prog = parse(
            '{{axis mood}}\n'
            '  a : "a"\n'
            '  b : "b"\n'
            '  c : "c"\n'
            '  d : "d"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog, offset=1, limit=2)
        # total is computed before pagination, and offset excludes 1 item before limit
        assert result["total"] == 4
        assert len(result["items"]) == 2


# ══════════════════════════════════════════════
#  Render Tests — Optional Axis & Hide Key
# ══════════════════════════════════════════════

class TestRenderOptionalAndHideKey:
    """Tests for optional axes and hide_key (~) modifier."""

    def test_optional_axis_produces_empty_binding(self):
        prog = parse(
            '{{set prefix = "photo"}}\n'
            '{{axis mood?}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{prefix}} {{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        # 2 items: one with mood="happy", one with mood="" (omitted)
        assert result["total"] == 2
        prompts = [i["prompt"] for i in result["items"]]
        assert "photo happy" in prompts
        # The empty binding: {{mood}} resolves to "" and _clean_prompt normalizes whitespace
        # Result will be "photo" (trailing space + empty cleaned away)
        assert "photo" in prompts

    def test_hide_key_modifier(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "a happy scene"\n'
            '{{/axis}}\n'
            '{{combine ~mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}{{mood}}{{/filename}}\n'
        )
        result = render(prog)
        # hide_key means the key is not included in filename/meta
        item = result["items"][0]
        # The value should still be substituted in template
        assert "happy" in item["prompt"] or "a happy scene" in item["prompt"]
        # Key should not appear in meta
        assert item["meta"] == {} or "mood" not in item.get("meta", {})

    def test_hide_key_excludes_from_filename_keys(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy scene"\n'
            '{{/axis}}\n'
            '{{combine ~mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}{{mood.key}}_out{{/filename}}\n'
        )
        result = render(prog)
        # hide_key means {{mood.key}} resolves to empty string, and the
        # leading underscore is cleaned away by the filename sanitiser.
        item = result["items"][0]
        assert item["filename"] == "out"


# ══════════════════════════════════════════════
#  Render Tests — Filename
# ══════════════════════════════════════════════

class TestRenderFilename:
    """Tests for filename generation, including clean_filename behaviour."""

    def test_basic_filename(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}prompt{{/template}}\n'
            '{{filename}}out_{{mood}}{{/filename}}\n'
        )
        result = render(prog)
        assert result["items"][0]["filename"] == "out_happy"

    def test_clean_filename_normalizes_double_underscores(self):
        prog = parse(
            '{{set clean_filename = "true"}}\n'
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}prompt{{/template}}\n'
            '{{filename}}{{mood}}__suffix{{/filename}}\n'
        )
        result = render(prog)
        # Double underscores should be collapsed
        assert "__" not in result["items"][0]["filename"]

    def test_clean_filename_false_preserves_doubles(self):
        prog = parse(
            '{{set clean_filename = "false"}}\n'
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}prompt{{/template}}\n'
            '{{filename}}happy__suffix{{/filename}}\n'
        )
        result = render(prog)
        # clean_filename=false: double underscores preserved
        assert "__" in result["items"][0]["filename"]

    def test_clean_filename_strips_leading_dots_dashes(self):
        prog = parse(
            '{{set clean_filename = "true"}}\n'
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}prompt{{/template}}\n'
            '{{filename}}_-.test{{/filename}}\n'
        )
        result = render(prog)
        fn = result["items"][0]["filename"]
        # leading _-. should be stripped
        assert not fn.startswith("_") or fn == "test"


# ══════════════════════════════════════════════
#  Render Tests — Props
# ══════════════════════════════════════════════

class TestRenderProps:
    """Tests for axis value properties ({{axis.prop}})."""

    def test_props_substituted_in_template(self):
        prog = parse(
            '{{axis quality}}\n'
            '  hd : {res: "1920x1080", fps: "60"}\n'
            '{{/axis}}\n'
            '{{combine quality}}\n'
            '{{template}}Resolution: {{quality.res}}, FPS: {{quality.fps}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        prompt = result["items"][0]["prompt"]
        assert "1920x1080" in prompt
        assert "60" in prompt

    def test_axes_info_includes_props(self):
        prog = parse(
            '{{axis quality}}\n'
            '  hd : {res: "1920x1080"}\n'
            '{{/axis}}\n'
            '{{combine quality}}\n'
            '{{template}}{{quality}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        ax = result["axes"]["quality"]
        assert ax["values"][0]["props"]["res"] == "1920x1080"


# ══════════════════════════════════════════════
#  Inject Workflow Tests
# ══════════════════════════════════════════════

class TestInjectIntoWorkflow:
    """Tests for inject_into_workflow()."""

    def test_single_placeholder_string(self):
        workflow = {"node1": {"text": "{{input}}"}}
        result = inject_into_workflow(workflow, "hello")
        assert result["node1"]["text"] == "hello"

    def test_does_not_mutate_original(self):
        workflow = {"node1": {"text": "{{input}}"}}
        result = inject_into_workflow(workflow, "hello")
        assert workflow["node1"]["text"] == "{{input}}"
        assert result["node1"]["text"] == "hello"

    def test_custom_placeholder(self):
        workflow = {"node1": {"text": "PROMPT_HERE"}}
        result = inject_into_workflow(workflow, "hello", placeholder="PROMPT_HERE")
        assert result["node1"]["text"] == "hello"

    def test_dict_prompt_multiple_keys(self):
        workflow = {
            "node1": {"positive": "{{positive}}", "negative": "{{negative}}"},
        }
        result = inject_into_workflow(workflow, {"{{positive}}": "cat", "{{negative}}": "ugly"})
        assert result["node1"]["positive"] == "cat"
        assert result["node1"]["negative"] == "ugly"

    def test_non_string_values_ignored(self):
        workflow = {
            "node1": {"count": 42, "text": "{{input}}"},
        }
        result = inject_into_workflow(workflow, "hello")
        assert result["node1"]["count"] == 42
        assert result["node1"]["text"] == "hello"

    def test_nested_replacement(self):
        workflow = {"node1": {"text": "a {{input}} b {{input}} c"}}
        result = inject_into_workflow(workflow, "X")
        assert result["node1"]["text"] == "a X b X c"

    def test_list_in_workflow(self):
        workflow = {"node1": ["{{input}}", "static"]}
        result = inject_into_workflow(workflow, "replaced")
        assert result["node1"][0] == "replaced"
        assert result["node1"][1] == "static"

    def test_none_values_preserved(self):
        workflow = {"node1": {"text": None, "other": "{{input}}"}}
        result = inject_into_workflow(workflow, "hello")
        assert result["node1"]["text"] is None
        assert result["node1"]["other"] == "hello"


# ══════════════════════════════════════════════
#  Clean Prompt Tests
# ══════════════════════════════════════════════

class TestCleanPrompt:
    """Tests for _clean_prompt()."""

    def test_collapses_whitespace(self):
        assert _clean_prompt("hello   world") == "hello world"

    def test_normalizes_commas(self):
        assert _clean_prompt("a,b,c") == "a, b, c"

    def test_removes_trailing_comma(self):
        assert _clean_prompt("hello, ") == "hello"

    def test_strips_leading_whitespace(self):
        assert _clean_prompt("  hello  ") == "hello"

    def test_multiple_commas_collapsed(self):
        assert _clean_prompt("a,, ,b") == "a, b"

    def test_newlines_collapsed(self):
        assert _clean_prompt("hello\n\nworld") == "hello world"

    def test_mixed_whitespace_and_commas(self):
        result = _clean_prompt("a ,  b ,  c ")
        assert result == "a, b, c"


# ══════════════════════════════════════════════
#  Render Axes Info & Sets
# ══════════════════════════════════════════════

class TestRenderOutputStructure:
    """Tests for the structure of render() output."""

    def test_axes_info_present(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        assert "mood" in result["axes"]
        ax = result["axes"]["mood"]
        assert ax["values"][0]["key"] == "happy"
        assert "is_optional" in ax

    def test_sets_info_present(self):
        prog = parse(
            '{{set style = "anime"}}\n'
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        assert result["sets"] == {"style": "anime"}

    def test_item_has_filename_prompt_meta(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        item = result["items"][0]
        assert "filename" in item
        assert "prompt" in item
        assert "meta" in item

    def test_meta_excludes_alias(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine combo=mood}}\n'
            '{{template}}{{combo}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        # meta should not contain the alias key "combo" (only concrete axis keys)
        item = result["items"][0]
        assert "combo" not in item["meta"]

    def test_meta_includes_axis_keys(self):
        prog = parse(
            '{{axis mood}}\n'
            '  happy : "happy"\n'
            '{{/axis}}\n'
            '{{combine mood}}\n'
            '{{template}}{{mood}}{{/template}}\n'
            '{{filename}}out{{/filename}}\n'
        )
        result = render(prog)
        item = result["items"][0]
        assert "mood" in item["meta"]