import { useCallback, useEffect, useMemo, useRef } from "react"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { json } from "@codemirror/lang-json"
import { StreamLanguage, type StringStream } from "@codemirror/language"
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view"
import { StateField, type Text } from "@codemirror/state"
import { parseAxisEntryAtLine } from "../lib/workflowUtils"
import { useTheme } from "./theme-context"

type Language = "json" | "ceg"

export interface AxisEntryContextInfo {
  axisName: string
  entryKey: string
  allEntryKeys: string[]
  screenX: number
  screenY: number
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: Language
  placeholder?: string
  className?: string
  minHeight?: string
  maxHeight?: string
  /** When true, skips the outer wrapper border/background so it can be placed inside an InputGroup */
  bareWrapper?: boolean
  /** Called when a file is dropped or opened via file input */
  onFileOpen?: ((content: string, name: string) => void) | undefined
  /** Called on right-click over an axis entry line (ceg language only). */
  onAxisEntryContext?: ((info: AxisEntryContextInfo) => void) | undefined
  /** lineIndex(0-based) → active boolean, for line dimming of disabled axis entries. */
  axisEntryActiveMap?: Map<number, boolean> | undefined
  /** 1-based line number to highlight as a syntax error (red underline). */
  errorLine?: number | null | undefined
}

interface CegState {
  inComment: boolean
  inBlock: "template" | "filename" | "axis" | "override" | null
  inTag: boolean
  curlyDepth: number
}

const cegLanguage = StreamLanguage.define<CegState>({
  startState: () => ({
    inComment: false,
    inBlock: null,
    inTag: false,
    curlyDepth: 0,
  }),
  token: (stream: StringStream, state: CegState) => {
    // 1. Handle block comment
    if (state.inComment) {
      if (stream.match(/^[\s\S]*?#\}\}/) !== null) {
        state.inComment = false
        return "comment"
      }
      stream.skipToEnd()
      return "comment"
    }
    if (stream.match(/^\{\{#/) !== null) {
      if (stream.match(/^[\s\S]*?#\}\}/) !== null) {
        return "comment"
      }
      state.inComment = true
      stream.skipToEnd()
      return "comment"
    }

    // 2. If we are in tag context (inside a double-curly tag)
    if (state.inTag) {
      if (stream.match(/^\s+/) !== null) {
        return null // skip whitespace
      }
      if (stream.match(/^\}\}/) !== null) {
        state.inTag = false
        return "tag"
      }

      // Keywords inside tag context
      if (
        stream.match(/^(?:set|axis|combine|exclude|override|include|in|not)\b/i) !== null
      ) {
        return "keyword"
      }
      if (stream.match(/^(?:AND|OR)\b/) !== null) {
        return "keyword"
      }

      // Strings inside tag
      if (stream.match(/^"(?:[^"\\]|\\.)*"/) !== null) {
        return "string"
      }

      // Numbers
      if (stream.match(/^\d+(?:\.\d+)?\b/) !== null) {
        return "number"
      }

      // Variable name (allow dashes inside NAME)
      if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/) !== null) {
        return "variableName"
      }

      // Operators inside tag
      if (stream.match(/^[@~?+*()=:[\]]/) !== null) {
        return "operator"
      }

      // Fallback
      stream.next()
      return null
    }

    // 3. Match opening tag blocks
    if (stream.match(/^\{\{template\}\}/) !== null) {
      state.inBlock = "template"
      return "tag"
    }
    if (stream.match(/^\{\{filename\}\}/) !== null) {
      state.inBlock = "filename"
      return "tag"
    }

    // Closing template/filename blocks
    if (stream.match(/^\{\{\/template\}\}/) !== null) {
      state.inBlock = null
      return "tag"
    }
    if (stream.match(/^\{\{\/filename\}\}/) !== null) {
      state.inBlock = null
      return "tag"
    }

    // Axis block tag opening/closing
    if (stream.match(/^\{\{/) !== null) {
      if (stream.match(/^\/(?:axis|override)\}\}/) !== null) {
        state.inBlock = null
        return "tag"
      }
      if (stream.match(/^axis\b/) !== null) {
        state.inTag = true
        state.inBlock = "axis"
        return "tag"
      }
      if (stream.match(/^override\b/) !== null) {
        state.inTag = true
        state.inBlock = "override"
        return "tag"
      }
      if (stream.match(/^(?:set|combine|exclude)\b/) !== null) {
        state.inTag = true
        return "tag"
      }
      state.inTag = true
      return "tag"
    }

    // 4. If we are inside template/filename blocks, highlight placeholders like {{mood}} or {{mood.key}}
    if (state.inBlock === "template" || state.inBlock === "filename") {
      if (
        stream.match(
          /^\{\{[a-zA-Z_][a-zA-Z0-9_-]*(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)?\}\}/
        ) !== null
      ) {
        return "variableName"
      }
      if (stream.match(/^[^{]+/) !== null) {
        return null
      }
      stream.next()
      return null
    }

    if (state.inBlock === "override") {
      if (stream.match(/^\s+/) !== null) {
        return null
      }
      if (stream.match(/^(?:prompt|slot\.[a-zA-Z_][a-zA-Z0-9_-]*|meta\.[a-zA-Z_][a-zA-Z0-9_-]*)/) !== null) {
        return "variableName"
      }
      if (stream.match(/^"(?:[^"\\]|\\.)*"/) !== null) {
        return "string"
      }
      if (stream.match(/^-?\d+(?:\.\d+)?\b/) !== null) {
        return "number"
      }
      if (stream.match(/^(?:true|false)\b/i) !== null) {
        return "atom"
      }
      if (stream.match(/^(?:\+=|=)/) !== null) {
        return "operator"
      }
      if (stream.match(/^[^{}]+/) !== null) {
        return null
      }
      stream.next()
      return null
    }

    // 5. If we are inside axis block, parse entries
    if (state.inBlock === "axis") {
      if (stream.match(/^\s+/) !== null) {
        return null
      }

      if (stream.match(/^\{/) !== null) {
        state.curlyDepth++
        return "operator"
      }
      if (stream.match(/^\}/) !== null) {
        state.curlyDepth = Math.max(0, state.curlyDepth - 1)
        return "operator"
      }

      if (stream.match(/^"(?:[^"\\]|\\.)*"/) !== null) {
        return "string"
      }

      if (stream.match(/^\d+(?:\.\d+)?\b/) !== null) {
        return "number"
      }

      if (state.curlyDepth > 0) {
        if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*(?=\s*:)/) !== null) {
          return "propertyName"
        }
      } else {
        if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*(?=\s*:)/) !== null) {
          return "variableName"
        }
      }

      if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/) !== null) {
        return "variableName"
      }

      if (stream.match(/^[:,]/) !== null) {
        return "operator"
      }

      stream.next()
      return null
    }

    // 6. Default fallback for plain content outside tag/blocks
    if (stream.match(/^[^{]+/) !== null) {
      return null
    }
    stream.next()
    return null
  },
  languageData: { commentTokens: { block: { open: "{{#", close: "#}}" } } },
})

const baseTheme = EditorView.theme({
  "&": { fontSize: "0.875rem" },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    padding: "0.75rem 0",
  },
  ".cm-gutters": { display: "none" },
  ".cm-focused": { outline: "none" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "auto", flex: "1 1 auto" },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-axis-entry-disabled": {
    opacity: "0.4",
    textDecoration: "line-through",
    textDecorationColor: "var(--muted-foreground, #888)",
  },
  ".cm-axis-entry-active::before": {
    content: "'✓'",
    color: "var(--primary, #22c55e)",
    fontWeight: "700",
    marginRight: "0.25em",
    fontSize: "0.75em",
  },
  ".cm-error-line": {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "#ef4444",
  },
})

const CodeEditor = (props: CodeEditorProps): React.JSX.Element => {
  const {
    value,
    onChange,
    language,
    placeholder,
    className = "",
    minHeight = "8rem",
    maxHeight,
    bareWrapper = false,
    onFileOpen,
    onAxisEntryContext,
    axisEntryActiveMap,
    errorLine,
  } = props
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<ReactCodeMirrorRef | null>(null)

  const timerRef = useRef<number | null>(null)
  const pendingValueRef = useRef(value)

  useEffect(() => {
    pendingValueRef.current = value
  }, [value])

  const flushChange = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      onChange(pendingValueRef.current)
    }
  }, [onChange])

  const handleLocalChange = useCallback(
    (val: string) => {
      pendingValueRef.current = val
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = window.setTimeout(() => {
        onChange(val)
      }, 250)
    },
    [onChange]
  )

  // Flush on unmount
  useEffect(() => {
    return (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        onChange(pendingValueRef.current)
      }
    }
  }, [onChange])

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e): void => {
        const content = e.target?.result
        if (typeof content === "string" && onFileOpen) {
          onFileOpen(content, file.name)
        }
      }
      reader.readAsText(file)
    },
    [onFileOpen]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // 우클릭 컨텍스트 메뉴: 캡처 단계에서 CodeMirror 내부 처리보다 먼저 잡음
  // (텍스트 선택 상태에서도 동작하도록)
  const onAxisEntryContextRef = useRef(onAxisEntryContext)
  useEffect(() => {
    onAxisEntryContextRef.current = onAxisEntryContext
  }, [onAxisEntryContext])

  useEffect(() => {
    if (!onAxisEntryContext || language !== "ceg") return
    const view = editorRef.current?.view
    const contentDOM = view?.contentDOM
    if (!contentDOM) return

    const handler = (event: MouseEvent): void => {
      const cb = onAxisEntryContextRef.current
      const v = editorRef.current?.view
      if (!cb || !v) return
      const pos = v.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return
      const lineInfo = v.state.doc.lineAt(pos)
      const lineIndex = lineInfo.number - 1 // 0-based
      const text = v.state.doc.toString()
      const loc = parseAxisEntryAtLine(text, lineIndex)
      if (loc === null) return
      event.preventDefault()
      event.stopPropagation()
      cb({
        axisName: loc.axisName,
        entryKey: loc.entryKey,
        allEntryKeys: loc.allEntryKeys,
        screenX: event.clientX,
        screenY: event.clientY,
      })
    }
    // 캡처 단계에서 등록하여 CodeMirror의 버블 단계 핸들러보다 먼저 실행
    contentDOM.addEventListener("contextmenu", handler, true)
    return (): void => {
      contentDOM.removeEventListener("contextmenu", handler, true)
    }
  }, [onAxisEntryContext, language])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ""
    },
    [handleFile]
  )
  const { theme: rawTheme } = useTheme()
  const resolvedTheme: "dark" | "light" =
    rawTheme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : rawTheme

  const extensions = useMemo(() => {
    const lang = language === "json" ? json() : cegLanguage
    const domHandlers = EditorView.domEventHandlers({
      drop: (e) => {
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          e.preventDefault()
          return true // Prevents CodeMirror's default text insertion
        }
        return false
      },
    })

    const exts = [lang, baseTheme, EditorView.lineWrapping, domHandlers]

    // 라인 데코레이션 (axis entry 활성/비활성 + 문법 에러 줄)
    const activeMap = axisEntryActiveMap ?? new Map<number, boolean>()
    const hasActiveMap = axisEntryActiveMap !== undefined && axisEntryActiveMap.size > 0
    const errLine = errorLine ?? null
    if (hasActiveMap || errLine !== null) {
      const buildDecorations = (doc: Text): DecorationSet => {
        const decos: { from: number; deco: ReturnType<typeof Decoration.line> }[] = []
        for (let i = 0; i < doc.lines; i++) {
          // 에러 줄이면 우선 표시 (활성/비활성과 중복 적용 방지)
          if (errLine !== null && i === errLine - 1) {
            decos.push({
              from: doc.line(i + 1).from,
              deco: Decoration.line({ class: "cm-error-line" }),
            })
            continue
          }
          if (hasActiveMap) {
            const active = activeMap.get(i)
            if (active === false) {
              decos.push({
                from: doc.line(i + 1).from,
                deco: Decoration.line({ class: "cm-axis-entry-disabled" }),
              })
            } else if (active === true) {
              decos.push({
                from: doc.line(i + 1).from,
                deco: Decoration.line({ class: "cm-axis-entry-active" }),
              })
            }
          }
        }
        return Decoration.set(
          decos.map((d) => d.deco.range(d.from)),
          true
        )
      }
      const decoField = StateField.define<DecorationSet>({
        create: (state) => buildDecorations(state.doc),
        update: (_current, tr) => buildDecorations(tr.state.doc),
        provide: (f) => EditorView.decorations.from(f),
      })
      exts.push(decoField)
    }

    return exts
  }, [language, axisEntryActiveMap, errorLine])

  return (
    <div
      ref={dropZoneRef}
      className={`flex h-full min-h-0 flex-col overflow-hidden ${bareWrapper ? "" : "rounded-md border bg-muted/50"} ${className}`}
      style={maxHeight !== undefined ? { minHeight, maxHeight } : { minHeight }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={handleLocalChange}
        onBlur={flushChange}
        extensions={extensions}
        theme={resolvedTheme}
        {...(placeholder !== undefined ? { placeholder } : {})}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          highlightSelectionMatches: false,
          autocompletion: false,
        }}
        height="100%"
        style={{ height: "100%", minHeight, maxHeight }}
        className="h-full min-h-0"
      />
      {onFileOpen && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.txt"
          className="hidden"
          onChange={handleFileInputChange}
        />
      )}
    </div>
  )
}

export default CodeEditor
