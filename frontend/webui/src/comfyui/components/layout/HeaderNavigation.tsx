import { useRef } from "react"
import { Menu, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { usePanelLayout } from "../../contexts/PanelLayoutContext"
import type { JobView, WorkerView } from "../../types/Message"
import { ServerStatus, WorkerStatus } from "../StatusIndicators"
import { NAV_TABS, type TabId } from "./nav-tabs"

type MobileJobTab = "editor" | "status" | "list"
type DragStart = (clientX: number, clientY: number) => void

interface MobileNavigationProps {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  mobileJobTab: MobileJobTab
  setMobileJobTab: (tab: MobileJobTab) => void
  jobsCount: number
  isAliveBackend: boolean
  backendAlive: boolean
  workers: WorkerView[]
  jobs: JobView[]
}

interface DesktopNavigationProps {
  tabsRef: React.RefObject<HTMLDivElement | null>
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  useWindowMode: boolean
  onStatsDragStart?: DragStart | undefined
  onCurationDragStart?: DragStart | undefined
  onGalleryDragStart?: DragStart | undefined
}

interface DesktopTabButtonProps {
  tab: (typeof NAV_TABS)[number]
  active: boolean
  detached: boolean
  onSelect: () => void
  onDragStart?: DragStart | undefined
}

interface DragState {
  startX: number
  startY: number
  wasDragged: boolean
}

const JOB_SUB_TABS = [
  { id: "editor", label: "에디터" },
  { id: "status", label: "현황" },
] as const

function MobileJobTabs({
  activeTab,
  jobsCount,
  onSelect,
}: {
  activeTab: MobileJobTab
  jobsCount: number
  onSelect: (tab: MobileJobTab) => void
}): React.JSX.Element {
  const tabs = [
    ...JOB_SUB_TABS,
    { id: "list" as const, label: `기록 (${String(jobsCount)})` },
  ]
  return (
    <div className="mt-0.5 ml-4 border-l border-line pl-3">
      {tabs.map((tab) => (
        <SheetClose asChild key={tab.id}>
          <button
            className={`flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-accent/80 text-accent-foreground"
                : "text-muted-foreground/70 hover:text-foreground"
            }`}
            onClick={() => {
              onSelect(tab.id)
            }}
          >
            {tab.label}
          </button>
        </SheetClose>
      ))}
    </div>
  )
}

export function MobileNavigation({
  activeTab,
  setActiveTab,
  mobileJobTab,
  setMobileJobTab,
  jobsCount,
  isAliveBackend,
  backendAlive,
  workers,
  jobs,
}: MobileNavigationProps): React.JSX.Element {
  const selectJobTab = (tab: MobileJobTab): void => {
    setActiveTab("jobs")
    setMobileJobTab(tab)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[300px] sm:w-[320px]"
      >
        <SheetTitle className="sr-only">메뉴</SheetTitle>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[15px] font-black tracking-tighter text-transparent">
            ComfyEmotionGen WebUI
          </span>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <XIcon className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>

        <div className="flex flex-col gap-1 px-3 py-3">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <div key={tab.id}>
                <SheetClose asChild>
                  <button
                    className={`group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-bold transition-all ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                    onClick={() => {
                      setActiveTab(tab.id)
                      if (tab.id === "jobs") setMobileJobTab("editor")
                    }}
                  >
                    <Icon
                      className={`h-[17px] w-[17px] ${isActive ? "opacity-100" : "opacity-50"}`}
                    />
                    <span>{tab.label}</span>
                    {isActive && (
                      <div className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-foreground" />
                    )}
                  </button>
                </SheetClose>
                {tab.id === "jobs" && (
                  <MobileJobTabs
                    activeTab={mobileJobTab}
                    jobsCount={jobsCount}
                    onSelect={selectJobTab}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-auto border-t border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <ServerStatus
              name="백엔드"
              isConnected={isAliveBackend && backendAlive}
              okHint="백엔드와 연결되어 있습니다."
              failHint="백엔드 서버 상태를 확인해주세요."
            />
            <WorkerStatus
              workers={workers}
              backendAlive={isAliveBackend}
              jobs={jobs}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DesktopTabButton({
  tab,
  active,
  detached,
  onSelect,
  onDragStart,
}: DesktopTabButtonProps): React.JSX.Element {
  const dragStateRef = useRef<DragState | null>(null)
  const Icon = tab.icon
  const isDraggable = onDragStart !== undefined

  const handleMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    if (onDragStart === undefined) return
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      wasDragged: false,
    }

    const removeListeners = (): void => {
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseup", handleUp)
    }
    const handleMove = (moveEvent: MouseEvent): void => {
      const state = dragStateRef.current
      if (state === null || state.wasDragged) return
      const distance = Math.hypot(
        moveEvent.clientX - state.startX,
        moveEvent.clientY - state.startY
      )
      // 작은 포인터 흔들림을 클릭으로 유지하고 의도적인 드래그만 분리한다.
      if (distance <= 8) return
      state.wasDragged = true
      onDragStart(state.startX, state.startY)
      removeListeners()
    }
    const handleUp = (): void => {
      removeListeners()
      if (dragStateRef.current?.wasDragged !== true) {
        dragStateRef.current = null
      }
    }
    document.addEventListener("mousemove", handleMove)
    document.addEventListener("mouseup", handleUp)
  }

  const handleClick = (): void => {
    // 브라우저는 드래그 종료 뒤에도 click을 발생시키므로 한 번 소비한다.
    if (dragStateRef.current?.wasDragged === true) {
      dragStateRef.current = null
      return
    }
    onSelect()
  }

  return (
    <Button
      id={tab.id === "settings" ? "comfy-settings-button" : undefined}
      variant="ghost"
      size="sm"
      role="tab"
      aria-selected={active}
      aria-label={tab.label}
      onClick={handleClick}
      onMouseDown={isDraggable ? handleMouseDown : undefined}
      className={`relative h-10 shrink-0 gap-1.5 rounded-full px-4 text-[13px] font-black transition-all ${
        active
          ? "bg-foreground text-background shadow-lg"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      } ${isDraggable ? "cursor-grab select-none active:cursor-grabbing" : ""} ${
        tab.id === "settings" ? "comfy-settings-btn" : ""
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "opacity-100" : "opacity-70"}`} />
      <span className={active ? "" : "hidden sm:inline"}>{tab.label}</span>
      {detached && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
      )}
    </Button>
  )
}

/**
 * 데스크톱 탭의 선택과 창 분리 제스처를 담당한다.
 *
 * 창 분리가 가능한 탭과 실제 패널 상태를 이 경계에서 연결해 Header 본체가
 * 각 패널의 도킹/플로팅 세부 상태를 알 필요가 없게 한다.
 */
export function DesktopNavigation({
  tabsRef,
  activeTab,
  setActiveTab,
  useWindowMode,
  onStatsDragStart,
  onCurationDragStart,
  onGalleryDragStart,
}: DesktopNavigationProps): React.JSX.Element {
  const panel = usePanelLayout()
  const dragCallbacks: Partial<Record<TabId, DragStart | undefined>> = {
    stats: onStatsDragStart,
    curation: onCurationDragStart,
    gallery: onGalleryDragStart,
  }
  const detachedTabs = new Set<TabId>([
    ...(panel.stats.isFloating || panel.stats.isDocked
      ? ["stats" as const]
      : []),
    ...(panel.curation.isFloating || panel.curation.isDocked
      ? ["curation" as const]
      : []),
    ...(panel.gallery.isFloating || panel.gallery.isDocked
      ? ["gallery" as const]
      : []),
  ])

  return (
    <div
      ref={tabsRef}
      className="no-scrollbar hidden max-w-[280px] min-w-0 items-center gap-1 overflow-x-auto scroll-smooth px-1 pb-1 md:flex lg:max-w-[480px] xl:max-w-[640px]"
      role="tablist"
      aria-label="메인 탭 네비게이션"
    >
      {NAV_TABS.map((tab) => (
        <DesktopTabButton
          key={tab.id}
          tab={tab}
          active={activeTab === tab.id}
          detached={detachedTabs.has(tab.id)}
          onSelect={() => {
            setActiveTab(tab.id)
          }}
          onDragStart={useWindowMode ? dragCallbacks[tab.id] : undefined}
        />
      ))}
    </div>
  )
}
