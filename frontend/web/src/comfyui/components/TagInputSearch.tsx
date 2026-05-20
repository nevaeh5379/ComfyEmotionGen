import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Search, X, Tag } from "lucide-react"
import { cn } from "@/lib/utils"

export type CandidateType = "filename" | "prompt" | "error" | "tag" | "metadata"

export interface Candidate {
  value: string
  type: CandidateType
}

interface TagInputSearchProps {
  value: string
  tags: string[]
  candidates: Candidate[]
  ref?: React.RefObject<HTMLInputElement>
  placeholder: string
  onValueChange: (v: string) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  size?: "sm" | "md"
}

export const TagInputSearch = memo(function TagInputSearch({
  value,
  tags,
  candidates,
  ref: refProp,
  placeholder,
  onValueChange,
  onAddTag,
  onRemoveTag,
  size = "sm",
}: TagInputSearchProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset active index when candidates list changes
  useEffect(() => {
    setActiveIndex(0)
  }, [candidates])

  // Open dropdown when value exists and candidates exist
  useEffect(() => {
    if (value && candidates.length > 0) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }, [value, candidates])

  // Handle click outside to close the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const getPrefix = (type: CandidateType): string => {
    if (type === "filename") return "@"
    if (type === "prompt" || type === "tag") return "#"
    return "$"
  }

  const getLabel = (type: CandidateType): string => {
    switch (type) {
      case "filename":
        return "파일명"
      case "prompt":
        return "프롬프트"
      case "tag":
        return "태그"
      case "error":
        return "에러"
      case "metadata":
        return "메타데이터"
      default:
        return "기타"
    }
  }

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        if (isOpen && candidates.length > 0 && activeIndex >= 0 && activeIndex < candidates.length) {
          const cand = candidates[activeIndex]!
          onAddTag(getPrefix(cand.type) + cand.value)
          setIsOpen(false)
        } else {
          const trimmed = value.trim()
          if (trimmed) {
            onAddTag(trimmed)
            setIsOpen(false)
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setActiveIndex((prev) => (candidates.length > 0 ? (prev + 1) % candidates.length : 0))
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setActiveIndex((prev) => (candidates.length > 0 ? (prev - 1 + candidates.length) % candidates.length : 0))
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        setIsOpen(false)
      } else if (e.key === "Backspace" && !value && tags.length > 0) {
        onRemoveTag(tags[tags.length - 1]!)
      }
    },
    [candidates, tags, value, activeIndex, isOpen, onAddTag, onRemoveTag]
  )

  // Highlight matching characters by making them bold
  const renderHighlight = (text: string, query: string) => {
    const cleanQuery = query.replace(/^[@#$]/, "").toLowerCase()
    if (!cleanQuery) return <span>{text}</span>
    const index = text.toLowerCase().indexOf(cleanQuery)
    if (index === -1) return <span>{text}</span>

    const before = text.substring(0, index)
    const match = text.substring(index, index + cleanQuery.length)
    const after = text.substring(index + cleanQuery.length)

    return (
      <span>
        {before}
        <strong className="font-semibold text-primary">{match}</strong>
        {after}
      </span>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-wrap items-center gap-1.5 p-1.5 border border-line rounded-md bg-background min-h-[34px] transition-all",
        size === "sm" ? "px-2 py-1" : "px-3 py-1.5"
      )}
    >
      {/* Icon Prefix */}
      <Search className="h-3.5 w-3.5 text-muted-foreground/45 shrink-0" />

      {/* Render Tags */}
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-primary/5 text-primary border border-primary/10 px-1.5 py-0.5 text-[10px] font-medium transition-all hover:bg-primary/10"
        >
          {tag}
          <button
            type="button"
            onClick={() => onRemoveTag(tag)}
            className="inline-flex items-center justify-center rounded p-0.5 hover:bg-primary/20 text-primary/70 hover:text-primary transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {/* Text Input */}
      <input
        ref={refProp}
        type="text"
        value={value}
        onFocus={() => {
          if (value && candidates.length > 0) setIsOpen(true)
        }}
        onChange={(e) => {
          onValueChange(e.target.value)
        }}
        onKeyDown={onKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className={cn(
          "flex-1 min-w-[80px] bg-transparent outline-none border-none p-0 focus:ring-0 placeholder:text-muted-foreground/40",
          size === "sm" ? "text-[11px] h-6" : "text-xs h-7"
        )}
      />

      {/* Candidates Dropdown */}
      {isOpen && candidates.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-line bg-popover shadow-md py-1 animate-in fade-in slide-in-from-top-1 duration-100 max-h-60 overflow-y-auto">
          {candidates.map((cand, idx) => (
            <button
              key={cand.value + "-" + cand.type}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                onAddTag(getPrefix(cand.type) + cand.value)
                setIsOpen(false)
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-1.5 text-[11px] text-left transition-colors",
                idx === activeIndex ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Tag className="h-3 w-3 text-muted-foreground/35 shrink-0" />
                <span className="truncate">{renderHighlight(cand.value, value)}</span>
              </div>
              <span
                className={cn(
                  "px-1 py-0.5 rounded text-[8px] font-medium tracking-wide shrink-0 border",
                  cand.type === "filename" && "bg-info/5 border-info/20 text-info",
                  (cand.type === "prompt" || cand.type === "tag") && "bg-ok/5 border-ok/20 text-ok",
                  (cand.type === "error" || cand.type === "metadata") && "bg-bad/5 border-bad/20 text-bad"
                )}
              >
                {getLabel(cand.type)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
