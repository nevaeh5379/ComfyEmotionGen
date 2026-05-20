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
  onFileOpen?: (content: string, name: string) => void
}

const cegKeywords = /^(?:include|AND)\b/i
const cegTags = /^\{\{\/?(?:axis|template|filename|set|combine|exclude)\}\}/

const cegLanguage = StreamLanguage.define<{ inComment: boolean }>({
  startState: () => ({ inComment: false }),
  token: (stream: StringStream, state: { inComment: boolean }) => {
    if (state.inComment) {
      if (stream.match(/^[\s\S]*?#\}\}/)) {
        state.inComment = false
        return "comment"
      }
      stream.skipToEnd()
      return "comment"
    }
    if (stream.match(/^\{\{#/)) {
      if (stream.match(/^[\s\S]*?#\}\}/)) return "comment"
      state.inComment = true
      stream.skipToEnd()
      return "comment"
    }
    if (stream.match(cegTags)) return "tag"
    if (stream.match(/^\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/)) return "variableName"
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string"
    if (stream.match(/^\d+(?:\.\d+)?\b/)) return "number"
    if (stream.match(cegKeywords)) return "keyword"
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*(?=\s*:)/)) return "propertyName"
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) return "variableName"
    if (stream.match(/^[@~+*()=:]/)) return "operator"
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
    return [lang, baseTheme, EditorView.lineWrapping]
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
