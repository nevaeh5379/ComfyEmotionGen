import { useCallback, useMemo, useRef } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { json } from "@codemirror/lang-json"
import { StreamLanguage, type StringStream } from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import { useTheme } from "./theme-provider"

type Language = "json" | "ceg"

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
}

interface CegState {
  inComment: boolean
  inBlock: "template" | "filename" | "axis" | null
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
      if (stream.match(/^[\s\S]*?#\}\}/)) {
        state.inComment = false
        return "comment"
      }
      stream.skipToEnd()
      return "comment"
    }
    if (stream.match(/^\{\{#/)) {
      if (stream.match(/^[\s\S]*?#\}\}/)) {
        return "comment"
      }
      state.inComment = true
      stream.skipToEnd()
      return "comment"
    }

    // 2. If we are in tag context (inside a double-curly tag)
    if (state.inTag) {
      if (stream.match(/^\s+/)) {
        return null // skip whitespace
      }
      if (stream.match(/^\}\}/)) {
        state.inTag = false
        return "tag"
      }

      // Keywords inside tag context
      if (stream.match(/^(?:set|axis|combine|exclude|include|in|not)\b/i)) {
        return "keyword"
      }
      if (stream.match(/^(?:AND|OR)\b/)) {
        return "keyword"
      }

      // Strings inside tag
      if (stream.match(/^"(?:[^"\\]|\\.)*"/)) {
        return "string"
      }

      // Numbers
      if (stream.match(/^\d+(?:\.\d+)?\b/)) {
        return "number"
      }

      // Variable name (allow dashes inside NAME)
      if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_\-]*/)) {
        return "variableName"
      }

      // Operators inside tag
      if (stream.match(/^[@~?+*()=:[\]]/)) {
        return "operator"
      }

      // Fallback
      stream.next()
      return null
    }

    // 3. Match opening tag blocks
    if (stream.match(/^\{\{template\}\}/)) {
      state.inBlock = "template"
      return "tag"
    }
    if (stream.match(/^\{\{filename\}\}/)) {
      state.inBlock = "filename"
      return "tag"
    }

    // Closing template/filename blocks
    if (stream.match(/^\{\{\/template\}\}/)) {
      state.inBlock = null
      return "tag"
    }
    if (stream.match(/^\{\{\/filename\}\}/)) {
      state.inBlock = null
      return "tag"
    }

    // Axis block tag opening/closing
    if (stream.match(/^\{\{/)) {
      if (stream.match(/^\/axis\}\}/)) {
        state.inBlock = null
        return "tag"
      }
      if (stream.match(/^axis\b/)) {
        state.inTag = true
        state.inBlock = "axis"
        return "tag"
      }
      if (stream.match(/^(?:set|combine|exclude)\b/)) {
        state.inTag = true
        return "tag"
      }
      state.inTag = true
      return "tag"
    }

    // 4. If we are inside template/filename blocks, highlight placeholders like {{mood}} or {{mood.key}}
    if (state.inBlock === "template" || state.inBlock === "filename") {
      if (stream.match(/^\{\{[a-zA-Z_][a-zA-Z0-9_\-]*(?:\.[a-zA-Z_][a-zA-Z0-9_\-]*)?\}\}/)) {
        return "variableName"
      }
      if (stream.match(/^[^{]+/)) {
        return null
      }
      stream.next()
      return null
    }

    // 5. If we are inside axis block, parse entries
    if (state.inBlock === "axis") {
      if (stream.match(/^\s+/)) {
        return null
      }

      if (stream.match(/^\{/)) {
        state.curlyDepth++
        return "operator"
      }
      if (stream.match(/^\}/)) {
        state.curlyDepth = Math.max(0, state.curlyDepth - 1)
        return "operator"
      }

      if (stream.match(/^"(?:[^"\\]|\\.)*"/)) {
        return "string"
      }

      if (stream.match(/^\d+(?:\.\d+)?\b/)) {
        return "number"
      }

      if (state.curlyDepth > 0) {
        if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_\-]*(?=\s*:)/)) {
          return "propertyName"
        }
      } else {
        if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_\-]*(?=\s*:)/)) {
          return "variableName"
        }
      }

      if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_\-]*/)) {
        return "variableName"
      }

      if (stream.match(/^[:,]/)) {
        return "operator"
      }

      stream.next()
      return null
    }

    // 6. Default fallback for plain content outside tag/blocks
    if (stream.match(/^[^{]+/)) {
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
})

const CodeEditor = ({
  value,
  onChange,
  language,
  placeholder,
  className = "",
  minHeight = "8rem",
  maxHeight,
  bareWrapper = false,
  onFileOpen,
}: CodeEditorProps) => {
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
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

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ""
    },
    [handleFile]
  )
  const { theme } = useTheme()
  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme

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
    return [lang, baseTheme, EditorView.lineWrapping, domHandlers]
  }, [language])

  return (
    <div
      ref={dropZoneRef}
      className={`flex h-full min-h-0 flex-col overflow-hidden ${bareWrapper ? "" : "rounded-md border bg-muted/50"} ${className}`}
      style={maxHeight ? { minHeight, maxHeight } : { minHeight }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
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
