import sys
sys.path.insert(0, 'src')
from lark import Lark
from pathlib import Path
from dataclasses import dataclass, field
from typing import List
import re

GRAMMAR_PATH = Path('src/prompt_dsl.lark')
grammar = GRAMMAR_PATH.read_text(encoding='utf-8')
raw_parser = Lark(grammar, parser='lalr', propagate_positions=True)

src = r'''{{set foo = "bar"}}
{{axis emotion include="looking at viewer, wide hips"}}
  happy: "smiling"
  sad: "crying"
{{/axis}}
{{template}}
hello {{emotion}}
world {{pose}}
{{/template}}
{{filename}}
img_{{emotion}}_{{pose}}
{{/filename}}
{{combine emotion + pose}}
{{exclude emotion in [happy, sad] AND pose = front}}
{{# comment #}}
'''

tree = raw_parser.parse(src)

@dataclass
class TemplateLine:
    line_num: int
    text: str
    keys: List[str] = field(default_factory=list)
    type: str = 'other'

# type priority: higher wins
type_priority = {
    'axis-header': 10, 'template-header': 10, 'filename-header': 10, 'set-header': 10,
    'axis-body': 9, 'template-body': 9, 'filename-body': 9,
    'end': 8,
    'axis-include': 7,
    'combine': 5, 'exclude': 5, 'comment': 5,
    'other': 0,
}

def build(tree, source):
    lines = source.split('\n')
    n = len(lines)
    result = [{'line_num': i + 1, 'text': lines[i], 'keys': [], 'type': 'other', 'priority': 0} for i in range(n)]
    
    def tag(start, end, typ, keys=None):
        pri = type_priority.get(typ, 0)
        for i in range(start - 1, min(end, n)):
            if pri >= result[i]['priority']:
                result[i]['type'] = typ
                result[i]['priority'] = pri
            if keys:
                for k in keys:
                    if k not in result[i]['keys']:
                        result[i]['keys'].append(k)
    
    def dfs(node):
        if not hasattr(node, 'data') or not hasattr(node, 'meta'):
            return
        rule = node.data
        start = getattr(node.meta, 'line', 1)
        end = getattr(node.meta, 'end_line', start)
        
        if rule == 'set_stmt':
            tag(start, start, 'set-header')
            for c in node.children:
                if hasattr(c, 'type') and c.type == 'NAME':
                    tag(c.line, c.line, 'set-header', [str(c)])
        elif rule == 'axis_def':
            tag(start, start, 'axis-header')
            axis_name = None
            for c in node.children:
                if hasattr(c, 'type') and c.type == 'NAME':
                    tag(c.line, c.line, 'axis-header', [str(c)])
                    axis_name = str(c)
                    break
            for c in node.children:
                if hasattr(c, 'data'):
                    if c.data == 'axis_entry':
                        cs = getattr(c.meta, 'line', start)
                        ce = getattr(c.meta, 'end_line', cs)
                        val_key = None
                        for c2 in c.children:
                            if hasattr(c2, 'type') and c2.type == 'NAME':
                                val_key = str(c2)
                                break
                        if axis_name and val_key:
                            tag(cs, ce, 'axis-body', [f'{axis_name}:{val_key}'])
                        else:
                            tag(cs, ce, 'axis-body')
                    elif c.data == 'axis_include':
                        cs = getattr(c.meta, 'line', start)
                        ce = getattr(c.meta, 'end_line', cs)
                        tag(cs, ce, 'axis-include')
                        if axis_name:
                            tag(cs, ce, 'axis-header', [axis_name])
            tag(end, end, 'end')
        elif rule == 'template_block':
            tag(start, start, 'template-header')
            # body = lines between header and end
            body_start = start + 1
            body_end = end - 1
            if body_end >= body_start:
                tag(body_start, body_end, 'template-body')
                for i in range(body_start, body_end + 1):
                    if i > n:
                        break
                    bline = lines[i - 1]
                    refs = re.findall(r'\{\{\s*([a-zA-Z_\-][a-zA-Z0-9_\-]*)\s*\}\}', bline)
                    if refs:
                        tag(i, i, 'template-body', refs)
            tag(end, end, 'end')
        elif rule == 'filename_block':
            tag(start, start, 'filename-header')
            body_start = start + 1
            body_end = end - 1
            if body_end >= body_start:
                tag(body_start, body_end, 'filename-body')
                for i in range(body_start, body_end + 1):
                    if i > n:
                        break
                    bline = lines[i - 1]
                    refs = re.findall(r'\{\{\s*([a-zA-Z_\-][a-zA-Z0-9_\-]*)\s*\}\}', bline)
                    if refs:
                        tag(i, i, 'filename-body', refs)
            tag(end, end, 'end')
        elif rule == 'combine_stmt':
            tag(start, end, 'combine')
        elif rule == 'exclude_stmt':
            tag(start, end, 'exclude')
        elif rule == 'comment':
            tag(start, end, 'comment')
        
        for c in node.children:
            if hasattr(c, 'data'):
                dfs(c)
    
    dfs(tree)
    return [TemplateLine(line_num=d['line_num'], text=d['text'], keys=d['keys'], type=d['type']) for d in result]

lines = build(tree, src)
for ln in lines:
    print(f'{ln.line_num:2}: [{ln.type:20}] keys={ln.keys} | {ln.text[:60]}')
