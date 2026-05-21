/**
 * 전역 단축키 훅.
 *
 * ┌──────────────────────┬────────────────────────────────────────┬────────────────────────┐
 * │       Shortcut       │                 Action                 │         Scope          │
 * ├──────────────────────┼────────────────────────────────────────┼────────────────────────┤
 * │ Ctrl/Cmd + Enter     │ Run jobs (handleRun)                   │ Jobs tab only          │
 * ├──────────────────────┼────────────────────────────────────────┼────────────────────────┤
 * │ Ctrl/Cmd + S         │ Save current template/workflow/mapping │ Jobs → editor tab only │
 * ├──────────────────────┼────────────────────────────────────────┼────────────────────────┤
 * │ Ctrl/Cmd + Shift + R │ Refresh gallery                        │ Gallery tab only       │
 * └──────────────────────┴────────────────────────────────────────┴────────────────────────┘
 */

import { useEffect } from "react"
import { toast } from "sonner"
import type { TabId } from "../components/layout/nav-tabs"

interface UseGlobalShortcutsOptions {
  activeTab: TabId
  mobileJobTab?: "editor" | "status" | "list"
  canRun: boolean
  handleRun: () => void
  handleSave: () => void
  handleGalleryRefresh: () => void
}

export function useGlobalShortcuts({
  activeTab,
  mobileJobTab,
  canRun,
  handleRun,
  handleSave,
  handleGalleryRefresh,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes("Mac")
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd + Enter → Run jobs (Jobs tab only)
      if (modifier && e.key === "Enter" && !e.shiftKey) {
        if (activeTab === "jobs") {
          e.preventDefault()
          if (canRun) {
            handleRun()
            toast.success("작업을 실행했습니다.")
          }
        }
        return
      }

      // Ctrl/Cmd + S → Save (Jobs → editor tab only)
      if (modifier && e.key === "s" && !e.shiftKey) {
        if (activeTab === "jobs" && mobileJobTab === "editor") {
          e.preventDefault()
          handleSave()
          toast.success("저장되었습니다.")
        }
        return
      }

      // Ctrl/Cmd + Shift + R → Refresh gallery (Gallery tab only)
      if (modifier && e.shiftKey && e.key === "R") {
        if (activeTab === "gallery") {
          e.preventDefault()
          handleGalleryRefresh()
          toast.success("갤러리를 새로고침했습니다.")
        }
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    activeTab,
    mobileJobTab,
    canRun,
    handleRun,
    handleSave,
    handleGalleryRefresh,
  ])
}
