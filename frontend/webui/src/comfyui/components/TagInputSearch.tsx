import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Search, X, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

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
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
        if (
          isOpen &&
          candidates.length > 0 &&
          activeIndex >= 0 &&
          activeIndex < candidates.length
        ) {
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
          setActiveIndex((prev) =>
            candidates.length > 0 ? (prev + 1) % candidates.length : 0
          )
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setActiveIndex((prev) =>
            candidates.length > 0
              ? (prev - 1 + candidates.length) % candidates.length
              : 0
          )
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
        "relative flex min-h-[34px] flex-wrap items-center gap-1.5 rounded-md border border-line bg-background p-1.5 transition-all",
        size === "sm" ? "px-2 py-1" : "px-3 py-1.5"
      )}
    >
      {/* Icon Prefix */}
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45" />

      {/* Render Tags */}
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="h-auto border border-primary/10 bg-primary/5 text-primary hover:bg-primary/10"
        >
          {tag}
          <button
            type="button"
            onClick={() => onRemoveTag(tag)}
            className="inline-flex items-center justify-center rounded p-0.5 text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
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
          "min-w-[80px] flex-1 border-none bg-transparent p-0 outline-none placeholder:text-muted-foreground/40 focus:ring-0",
          size === "sm" ? "h-6 text-[11px]" : "h-7 text-xs"
        )}
      />

      {/* Candidates Dropdown */}
      {isOpen && candidates.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 animate-in overflow-y-auto rounded-md border border-line bg-popover py-1 shadow-md duration-100 fade-in slide-in-from-top-1">
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
                "flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] transition-colors",
                idx === activeIndex
                  ? "bg-muted text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Tag className="h-3 w-3 shrink-0 text-muted-foreground/35" />
                <span className="truncate">
                  {renderHighlight(cand.value, value)}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded border px-1 py-0.5 text-[8px] font-medium tracking-wide",
                  cand.type === "filename" &&
                    "border-info/20 bg-info/5 text-info",
                  (cand.type === "prompt" || cand.type === "tag") &&
                    "border-ok/20 bg-ok/5 text-ok",
                  (cand.type === "error" || cand.type === "metadata") &&
                    "border-bad/20 bg-bad/5 text-bad"
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
