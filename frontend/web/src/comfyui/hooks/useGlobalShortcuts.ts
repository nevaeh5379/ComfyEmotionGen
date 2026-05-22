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
  setActiveTab?: (tab: TabId) => void
  toggleShortcuts?: () => void
}

export function useGlobalShortcuts({
  activeTab,
  mobileJobTab,
  canRun,
  handleRun,
  handleSave,
  handleGalleryRefresh,
  setActiveTab,
  toggleShortcuts,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in editable element
      const activeEl = document.activeElement
      const isEditable =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.getAttribute("contenteditable") === "true")

      if (e.key === "?") {
        if (isEditable) return
        e.preventDefault()
        toggleShortcuts?.()
        return
      }

      const isMac = navigator.platform.includes("Mac")
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // Ctrl + Shift + 1..6 or Alt + 1..6 → Switch tabs
      const isSwitchTabModifier =
        (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) ||
        (modifier && e.shiftKey)
      if (isSwitchTabModifier && e.key >= "1" && e.key <= "6") {
        e.preventDefault()
        const tabIndex = parseInt(e.key) - 1
        const tabs: TabId[] = [
          "jobs",
          "stats",
          "gallery",
          "curation",
          "generator",
          "settings",
        ]
        const targetTab = tabs[tabIndex]
        if (targetTab && setActiveTab) {
          setActiveTab(targetTab)
          const tabNames: Record<TabId, string> = {
            jobs: "작업",
            stats: "통계",
            gallery: "갤러리",
            curation: "큐레이션",
            generator: "템플릿 생성기",
            settings: "설정",
          }
          toast.info(`'${tabNames[targetTab]}' 탭으로 이동했습니다.`)
        }
        return
      }

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
    setActiveTab,
    toggleShortcuts,
  ])
}
