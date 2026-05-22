import React, { useRef, useEffect } from "react"
import { X, ArrowUpRight, Move } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface FloatingWindowProps {
  isOpen: boolean
  onClose: () => void
  onDock: () => void
  initialPos: { x: number; y: number }
  initialSize: { w: number; h: number }
  onPosChange: (pos: { x: number; y: number }) => void
  onSizeChange: (size: { w: number; h: number }) => void
  children: React.ReactNode
  title?: string
  toolbar?: React.ReactNode
}

export function FloatingWindow({
  isOpen,
  onClose,
  onDock,
  initialPos,
  initialSize,
  onPosChange,
  onSizeChange,
  children,
  title = "플로팅 윈도우",
  toolbar,
}: FloatingWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(initialPos)
  const sizeRef = useRef(initialSize)

  // 초기 위치 및 크기 설정
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.left = `${initialPos.x}px`
      containerRef.current.style.top = `${initialPos.y}px`
      containerRef.current.style.width = `${initialSize.w}px`
      containerRef.current.style.height = `${initialSize.h}px`
    }
    posRef.current = initialPos
    sizeRef.current = initialSize
  }, [initialPos, initialSize])

  if (!isOpen) return null

  // 1. 드래그(이동) 핸들러 - Zero-lag DOM 조작
  const handleDragMouseDown = (e: React.MouseEvent) => {
    // 버튼 클릭이나 입력 요소 클릭 시에는 드래그 차단
    const target = e.target as HTMLElement
    if (target.closest("button") || target.closest("input") || target.closest("select")) {
      return
    }

    e.preventDefault()

    const startX = e.clientX
    const startY = e.clientY
    const startLeft = posRef.current.x
    const startTop = posRef.current.y

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let nextLeft = startLeft + deltaX
      let nextTop = startTop + deltaY

      // 화면(뷰포트) 경계 가두리(Containment) 적용
      const winW = sizeRef.current.w
      const screenW = window.innerWidth
      const screenH = window.innerHeight

      // 최소/최대 안전선 지정
      nextLeft = Math.max(0, Math.min(nextLeft, screenW - winW))
      nextTop = Math.max(0, Math.min(nextTop, screenH - 40)) // 헤더 영역은 무조건 보이게 방어

      if (containerRef.current) {
        containerRef.current.style.left = `${nextLeft}px`
        containerRef.current.style.top = `${nextTop}px`
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)

      // 최종 위치를 React State 및 localStorage에 한 번만 커밋
      if (containerRef.current) {
        const finalLeft = parseInt(containerRef.current.style.left || "0", 10)
        const finalTop = parseInt(containerRef.current.style.top || "0", 10)
        const nextPos = { x: finalLeft, y: finalTop }
        posRef.current = nextPos
        onPosChange(nextPos)
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  };

  // 2. 리사이즈 핸들러 - Zero-lag DOM 조작
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const startWidth = sizeRef.current.w
    const startHeight = sizeRef.current.h

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let nextWidth = startWidth + deltaX
      let nextHeight = startHeight + deltaY

      // 최소 크기 제한 (너비 360px, 높이 250px)
      nextWidth = Math.max(360, nextWidth)
      nextHeight = Math.max(250, nextHeight)

      // 최대 크기 제한 (뷰포트 범위 내)
      nextWidth = Math.min(nextWidth, window.innerWidth - posRef.current.x)
      nextHeight = Math.min(nextHeight, window.innerHeight - posRef.current.y)

      if (containerRef.current) {
        containerRef.current.style.width = `${nextWidth}px`
        containerRef.current.style.height = `${nextHeight}px`
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)

      // 최종 크기를 React State 및 localStorage에 한 번만 커밋
      if (containerRef.current) {
        const finalWidth = parseInt(containerRef.current.style.width || "0", 10)
        const finalHeight = parseInt(containerRef.current.style.height || "0", 10)
        const nextSize = { w: finalWidth, h: finalHeight }
        sizeRef.current = nextSize
        onSizeChange(nextSize)
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 flex flex-col rounded-xl border border-line bg-panel/95 shadow-2xl backdrop-blur supports-backdrop-filter:bg-panel/85 overflow-hidden transition-shadow duration-200 focus-within:shadow-primary/5 focus-within:border-line-active"
      style={{
        minWidth: "360px",
        minHeight: "250px",
      }}
    >
      {/* 윈도우 헤더 (드래그 핸들) */}
      <div
        onMouseDown={handleDragMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-line cursor-move select-none shrink-0"
      >
        <div className="flex items-center gap-1.5 text-foreground">
          <Move className="h-3.5 w-3.5 opacity-60 text-primary animate-pulse" />
          <span className="text-[12px] font-black tracking-tight">{title}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* 결합 (Dock) 버튼 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                onClick={onDock}
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold bg-popover border border-line text-popover-foreground">
              메인 탭 결합 (Dock)
            </TooltipContent>
          </Tooltip>

          {/* 닫기 버튼 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-bold bg-destructive text-destructive-foreground">
              닫기
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 윈도우 전용 툴바 (옵션) */}
      {toolbar && (
        <div className="shrink-0 border-b border-line/50 bg-panel/30 px-3 py-1.5 flex flex-wrap items-center gap-1.5">
          {toolbar}
        </div>
      )}

      {/* 윈도우 바디 (콘텐츠) */}
      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col bg-background/30">
        {children}
      </div>

      {/* 리사이즈 핸들러 (우측 하단 코너) */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize z-50 flex items-end justify-end p-0.5 group"
        aria-label="창 크기 조절"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className="text-muted-foreground/40 group-hover:text-primary transition-colors"
        >
          <line x1="6" y1="0" x2="6" y2="6" stroke="currentColor" strokeWidth="1" />
          <line x1="0" y1="6" x2="6" y2="6" stroke="currentColor" strokeWidth="1" />
          <line x1="6" y1="3" x2="3" y2="6" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
    </div>
  )
}
