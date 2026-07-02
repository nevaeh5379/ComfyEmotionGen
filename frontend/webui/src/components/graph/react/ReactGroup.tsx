import React, { useRef, useState } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { useShallow } from "zustand/react/shallow"
import { Lock, Unlock, Trash2, Palette } from "lucide-react"

interface ReactGroupProps {
  id: number
}

export function ReactGroup({ id }: ReactGroupProps): React.JSX.Element | null {
  const group = useReactGraphStore(
    useShallow((s) => s.groups.find((g) => g.id === id) ?? null)
  )
  const zoom = useReactGraphStore((s) => s.zoom)
  const updateGroupBounding = useReactGraphStore((s) => s.updateGroupBounding)
  const updateGroupTitle = useReactGraphStore((s) => s.updateGroupTitle)
  const updateGroupColor = useReactGraphStore((s) => s.updateGroupColor)
  const toggleGroupLock = useReactGraphStore((s) => s.toggleGroupLock)
  const removeGroup = useReactGraphStore((s) => s.removeGroup)
  const nodes = useReactGraphStore((s) => s.nodes)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState("")

  if (!group) return null

  const [gx, gy, gw, gh] = group.bounding
  const color = group.color ?? "#333355"

  // 드래그 핸들러 (그룹 헤더/전체 영역)
  const handleMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return // 좌클릭만
    // 리사이즈 핸들이나 락 아이콘 등을 클릭하면 패스
    const target = e.target as HTMLElement
    if (target.closest("[data-no-drag]")) return

    e.stopPropagation()
    useReactGraphStore.getState().takeSnapshot()

    // 드래그 시작 시 그룹 영역 내에 있는 노드들을 수집
    const activeId = useReactGraphStore.getState().activeGraphId
    const activeNodes = nodes.filter((n) =>
      activeId === null
        ? n.graphId === null || n.graphId === undefined
        : n.graphId === activeId
    )

    // center point overlap check
    const insideNodes = activeNodes.filter((node) => {
      const cx = node.pos[0] + node.size[0] / 2
      const cy = node.pos[1] + node.size[1] / 2
      return cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh
    })

    const startX = gx
    const startY = gy
    const startMX = e.clientX
    const startMY = e.clientY

    // 각 내부 노드들의 시작 위치 저장
    const startNodePositions = insideNodes.map((n) => ({
      id: n.id,
      pos: [...n.pos] as [number, number],
    }))

    const onMove = (ev: MouseEvent): void => {
      if (group.locked) return
      const dx = Math.round((ev.clientX - startMX) / zoom)
      const dy = Math.round((ev.clientY - startMY) / zoom)

      // 그룹 이동
      updateGroupBounding(id, [startX + dx, startY + dy, gw, gh])

      // 내부 노드들 함께 이동
      for (const np of startNodePositions) {
        useReactGraphStore
          .getState()
          .updateNodePos(np.id, [np.pos[0] + dx, np.pos[1] + dy])
      }
    }

    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // 리사이즈 핸들러 (우측 하단)
  const handleResizeMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    useReactGraphStore.getState().takeSnapshot()

    const startMX = e.clientX
    const startMY = e.clientY
    const startW = gw
    const startH = gh

    const onMove = (ev: MouseEvent): void => {
      if (group.locked) return
      const dx = Math.round((ev.clientX - startMX) / zoom)
      const dy = Math.round((ev.clientY - startMY) / zoom)

      const nextW = Math.max(140, startW + dx)
      const nextH = Math.max(80, startH + dy)

      updateGroupBounding(id, [gx, gy, nextW, nextH])
    }

    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const startRename = (): void => {
    setTitleInput(group.title)
    setIsEditingTitle(true)
  }

  const finishRename = (): void => {
    if (titleInput.trim()) {
      updateGroupTitle(id, titleInput.trim())
    }
    setIsEditingTitle(false)
  }

  return (
    <div
      data-group-id={id}
      className="pointer-events-auto absolute rounded-lg border-2 transition-shadow duration-200 select-none"
      style={{
        left: gx,
        top: gy,
        width: gw,
        height: gh,
        borderColor: color,
        backgroundColor: `${color}12`, // ~7% opacity background
        boxShadow: "0 4px 20px -2px rgba(0,0,0,0.3)",
        zIndex: 5, // Render behind nodes (zIndex typically 10+)
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Group Title Bar */}
      <div
        className="flex cursor-move items-center justify-between rounded-t-md border-b px-3 py-1.5 text-xs font-semibold text-zinc-100 select-none"
        style={{
          backgroundColor: `${color}25`, // darker header background
          borderColor: `${color}35`,
        }}
      >
        {isEditingTitle ? (
          <input
            data-no-drag
            type="text"
            className="w-32 rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-zinc-100 focus:border-zinc-500 focus:outline-none"
            value={titleInput}
            onChange={(e) => {
              setTitleInput(e.target.value)
            }}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename()
              if (e.key === "Escape") setIsEditingTitle(false)
            }}
            autoFocus
          />
        ) : (
          <span
            className="max-w-[150px] cursor-pointer truncate hover:underline"
            onDoubleClick={startRename}
          >
            {group.title}
          </span>
        )}

        <div
          className="flex items-center gap-1.5 opacity-40 transition-opacity hover:opacity-100"
          data-no-drag
        >
          <button
            onClick={() => {
              toggleGroupLock(id)
            }}
            className="hover:bg-zinc-850 rounded p-0.5 text-zinc-300 transition-colors hover:text-zinc-100"
            title={group.locked ? "Unlock Group" : "Lock Group"}
          >
            {group.locked ? (
              <Lock size={12} className="text-amber-500" />
            ) : (
              <Unlock size={12} />
            )}
          </button>

          <button
            onClick={() => {
              const colors = [
                "#3b82f6",
                "#ef4444",
                "#10b981",
                "#f59e0b",
                "#8b5cf6",
                "#ec4899",
                "#6b7280",
                "#333355",
              ]
              const curIndex = colors.indexOf(color)
              const nextColor =
                colors[(curIndex + 1) % colors.length] ?? "#333355"
              updateGroupColor(id, nextColor)
            }}
            className="hover:bg-zinc-850 rounded p-0.5 text-zinc-300 transition-colors hover:text-zinc-100"
            title="Change Color"
          >
            <Palette size={12} />
          </button>

          <button
            onClick={() => {
              removeGroup(id)
            }}
            className="hover:bg-zinc-855 rounded p-0.5 text-red-400 transition-colors hover:text-red-300"
            title="Delete Group"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Resize Handle at bottom right */}
      {!group.locked && (
        <div
          data-no-drag
          className="absolute right-0 bottom-0 flex h-4 w-4 cursor-se-resize items-end justify-end p-0.5"
          onMouseDown={handleResizeMouseDown}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className="text-zinc-500 opacity-60 transition-opacity hover:opacity-100"
          >
            <path
              d="M6 0 L8 0 L8 8 L0 8 L0 6 L4 6 L4 4 L6 4 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
    </div>
  )
}
