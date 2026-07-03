import { useCallback, useEffect, useState, type RefObject } from "react"
import type { GraphContextMenuState } from "./GraphContextMenu"

interface UseGraphContextMenuOptions {
  containerRef: RefObject<HTMLDivElement | null>
}

interface UseGraphContextMenuResult {
  menu: GraphContextMenuState | null
  openMenu: (event: React.MouseEvent) => void
  closeMenu: () => void
}

function readElementNumberAttribute(
  element: Element | null,
  attribute: string
): number | undefined {
  const value = element?.getAttribute(attribute)
  if (value === undefined || value === null) return undefined
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

export function useGraphContextMenu({
  containerRef,
}: UseGraphContextMenuOptions): UseGraphContextMenuResult {
  const [menu, setMenu] = useState<GraphContextMenuState | null>(null)

  const closeMenu = useCallback((): void => {
    setMenu(null)
  }, [])

  const openMenu = useCallback(
    (event: React.MouseEvent): void => {
      event.preventDefault()
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const target = event.target as HTMLElement
      const clickedNodeId = readElementNumberAttribute(
        target.closest("[data-node-id]"),
        "data-node-id"
      )
      const clickedGroupId = readElementNumberAttribute(
        target.closest("[data-group-id]"),
        "data-group-id"
      )

      setMenu({
        x,
        y,
        screenX: event.clientX,
        screenY: event.clientY,
        nodeId: clickedNodeId,
        groupId: clickedGroupId,
      })
    },
    [containerRef]
  )

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement
      if (target.closest(".context-menu-container") === null) {
        closeMenu()
      }
    }

    document.addEventListener("mousedown", handleDocumentClick)
    return (): void => {
      document.removeEventListener("mousedown", handleDocumentClick)
    }
  }, [closeMenu])

  return { menu, openMenu, closeMenu }
}
