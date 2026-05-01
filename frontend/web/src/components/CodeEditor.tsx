import { useCallback, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import cegPrismLanguage from "@/lib/ceg-prism-language";

// Register custom CEG language once
Prism.languages.ceg = cegPrismLanguage;

type Language = "json" | "ceg";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const CodeEditor = ({
  value,
  onChange,
  language,
  placeholder,
  className = "",
  minHeight = "8rem",
}: CodeEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange],
  );

  // Sync scroll between textarea and pre
  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const pre = preRef.current;
    if (textarea && pre) {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }
  }, []);

  // Highlight code whenever value or language changes
  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;
    const code = value || " ";
    const grammar = Prism.languages[language];
    if (grammar) {
      pre.innerHTML =
        Prism.highlight(code, grammar, language) +
        "\n";
    } else {
      pre.textContent = code + "\n";
    }
  }, [value, language]);

  return (
    <div
      className={`relative rounded-md border bg-muted/50 ${className}`}
      style={{ minHeight }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="absolute inset-0 z-10 w-full resize-none bg-transparent p-3 font-mono text-sm text-transparent caret-gray-700 dark:caret-gray-300 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
        style={{ minHeight }}
      />
      <pre
        ref={preRef}
        className="pointer-events-none whitespace-pre-wrap wrap-break-word p-3 font-mono text-sm"
        style={{ minHeight }}
        aria-hidden="true"
      />
    </div>
  );
};

export default CodeEditor;
