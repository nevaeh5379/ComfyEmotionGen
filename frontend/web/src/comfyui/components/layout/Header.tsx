import {
  ClipboardList,
  Image as ImageIcon,
  Layers,
  Menu,
  Settings,
  XIcon,
  FilterIcon,
  MoreVertical,
  RefreshCwIcon,
  DownloadIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs } from "@/components/ui/tabs"
import { CompositionTabsList } from "../CompositionTabsList"
import { WorkCompositionToolbar } from "../WorkCompositionToolbar"
import { ServerStatus, WorkerStatus } from "../StatusIndicators"
import type { WorkerView, CurationStatus } from "../../types/Message"

export const NAV_TABS = [
  { id: "jobs", label: "작업", icon: ClipboardList },
  { id: "gallery", label: "갤러리", icon: ImageIcon },
  { id: "curation", label: "큐레이션", icon: Layers },
  { id: "settings", label: "설정", icon: Settings },
] as const

export type TabId = (typeof NAV_TABS)[number]["id"]

interface HeaderProps {
  activeTab: TabId
  setActiveTab: (t: TabId) => void
  isAliveBackend: boolean
  backendAlive: boolean
  workers: WorkerView[]
  jobsCount: number
  mobileJobTab: "editor" | "status" | "list"
  setMobileJobTab: (v: "editor" | "status" | "list") => void
  compositionTab: "ceg" | "workflow"
  setCompositionTab: (v: "ceg" | "workflow") => void
  
  // Job specific
  repeatCount: number
  setRepeatCount: (v: number | ((c: number) => number)) => void
  handleRun: () => void
  canRun: boolean
  estimatedRunCount: number | null
  setIsSelectionOpen: (v: boolean) => void
  hasActiveFilter: boolean
  setIsAxisFilterOpen: (v: boolean) => void
  setIsGraphOpen: (v: boolean) => void

  // Gallery specific
  galleryStatusFilter: CurationStatus | "all"
  setGalleryStatusFilter: (v: CurationStatus | "all") => void
  galleryViewMode: "grid" | "compare"
  setGalleryViewMode: (v: "grid" | "compare") => void
  galleryGroupMode: boolean
  setGalleryGroupMode: (v: boolean) => void
  galleryShowFilters: boolean
  setGalleryShowFilters: (v: boolean) => void
  galleryHasAnyFilter: boolean
  galleryFilenameFilter: string
  setGalleryFilenameFilter: (v: string) => void
  galleryTagFilter: string
  setGalleryTagFilter: (v: string) => void
  galleryMetadataFilter: string
  setGalleryMetadataFilter: (v: string) => void
  galleryHideRejected: boolean
  setGalleryHideRejected: (v: boolean) => void
  setGalleryDuplicateStrategy: (v: "hash" | "number") => void

  // Curation specific
  curationSelectedTemplateId: string
  setCurationSelectedTemplateId: (v: string) => void
  savedTemplates: { id: string; name: string }[]
}

export function Header(props: HeaderProps) {
  return (
    <nav className="sticky top-0 z-50 shrink-0 border-b border-line bg-panel/95 backdrop-blur supports-backdrop-filter:bg-panel/80">
      <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex items-center overflow-hidden md:gap-4">
          {/* Mobile hamburger (left side) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-[300px] sm:w-[320px]"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <span className="bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[15px] font-black tracking-tighter text-transparent">
                  ComfyEmotionGen
                </span>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <XIcon className="h-4 w-4" />
                  </Button>
                </SheetClose>
              </div>

              {/* Navigation */}
              <div className="flex flex-col gap-1 px-3 py-3">
                {NAV_TABS.map((tab) => {
                  const Icon = tab.icon
                  const isActive = props.activeTab === tab.id
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
                            props.setActiveTab(tab.id)
                            if (tab.id === "jobs") props.setMobileJobTab("editor")
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
                        <div className="mt-0.5 ml-4 border-l border-line pl-3">
                          {[
                            { id: "editor" as const, label: "에디터" },
                            { id: "status" as const, label: "현황" },
                            {
                              id: "list" as const,
                              label: `기록 (${props.jobsCount})`,
                            },
                          ].map((sub) => (
                            <SheetClose asChild key={sub.id}>
                              <button
                                className={`flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold transition-all ${
                                  props.mobileJobTab === sub.id
                                    ? "bg-accent/80 text-accent-foreground"
                                    : "text-muted-foreground/70 hover:text-foreground"
                                }`}
                                onClick={() => {
                                  props.setActiveTab("jobs")
                                  props.setMobileJobTab(sub.id)
                                }}
                              >
                                {sub.label}
                              </button>
                            </SheetClose>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="mt-auto border-t border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <ServerStatus
                    name="백엔드"
                    isConnected={props.isAliveBackend && props.backendAlive}
                    okHint="백엔드와 연결되어 있습니다."
                    failHint="백엔드 서버 상태를 확인해주세요."
                  />
                  <WorkerStatus
                    workers={props.workers}
                    backendAlive={props.isAliveBackend}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <span className="shrink-0 bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-[14px] font-black tracking-tighter text-transparent md:text-[15px]">
            <span className="hidden md:inline">ComfyEmotionGen</span>
          </span>
          <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
          {/* Desktop tabs */}
          <div className="no-scrollbar hidden items-center gap-1 overflow-x-auto px-1 pb-1 md:flex">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => props.setActiveTab(tab.id)}
                  className={`h-10 shrink-0 gap-1.5 rounded-full px-4 text-[13px] font-black transition-all ${
                    props.activeTab === tab.id
                      ? "bg-foreground text-background shadow-lg"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${props.activeTab === tab.id ? "opacity-100" : "opacity-70"}`}
                  />
                  <span
                    className={
                      props.activeTab === tab.id ? "" : "hidden sm:inline"
                    }
                  >
                    {tab.label}
                  </span>
                </Button>
              )
            })}
          </div>
          {/* Mobile composition tabs (jobs only) */}
          {props.activeTab === "jobs" && (
            <div className="flex flex-1 items-center justify-between gap-2 overflow-x-auto no-scrollbar md:hidden">
              <Tabs
                value={props.compositionTab}
                onValueChange={(v) => props.setCompositionTab(v as "ceg" | "workflow")}
              >
                <CompositionTabsList />
              </Tabs>
              <WorkCompositionToolbar
                repeatCount={props.repeatCount}
                setRepeatCount={props.setRepeatCount}
                handleRun={props.handleRun}
                canRun={props.canRun}
                estimatedRunCount={props.estimatedRunCount}
                onSelectionOpen={() => props.setIsSelectionOpen(true)}
                hasActiveFilter={props.hasActiveFilter}
                onAxisFilterOpen={() => props.setIsAxisFilterOpen(true)}
                onGraphOpen={() => props.setIsGraphOpen(true)}
              />
            </div>
          )}
          {/* Gallery toolbar (merged into nav) */}
          {props.activeTab === "gallery" && (
            <div className="flex items-center gap-1.5">
              <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
              <Select
                value={props.galleryStatusFilter}
                onValueChange={(v: string) => {
                  props.setGalleryStatusFilter(
                    v as CurationStatus | "all"
                  )
                }}
              >
                <SelectTrigger className="h-7 w-[70px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "all",
                      "pending",
                      "approved",
                      "rejected",
                      "trashed",
                    ] as const
                  ).map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="text-[12px] font-bold"
                    >
                      {s === "all"
                        ? "전체"
                        : s === "pending"
                          ? "대기"
                          : s === "approved"
                            ? "통과"
                            : s === "rejected"
                              ? "탈락"
                              : "휴지통"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={props.galleryGroupMode ? "group" : props.galleryViewMode}
                onValueChange={(v) => {
                  if (v === "group") {
                    props.setGalleryGroupMode(true)
                  } else {
                    props.setGalleryGroupMode(false)
                    props.setGalleryViewMode(v as "grid" | "compare")
                  }
                }}
              >
                <SelectTrigger className="h-7 w-[60px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group" className="text-[12px] font-bold">
                    그룹
                  </SelectItem>
                  <SelectItem value="grid" className="text-[12px] font-bold">
                    그리드
                  </SelectItem>
                  <SelectItem
                    value="compare"
                    className="text-[12px] font-bold"
                  >
                    비교
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                size="sm"
                variant={props.galleryShowFilters ? "secondary" : "outline"}
                onClick={() => props.setGalleryShowFilters(!props.galleryShowFilters)}
                className="relative h-7 w-7 p-0"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                {props.galleryHasAnyFilter && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary"></span>
                )}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px]">
                  <DropdownMenuLabel className="text-[11px] font-bold">
                    내보내기
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => props.setGalleryDuplicateStrategy("hash")}
                    className="text-[12px] font-bold"
                  >
                    <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                    HASH 기반
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => props.setGalleryDuplicateStrategy("number")}
                    className="text-[12px] font-bold"
                  >
                    <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                    NUM 기반
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {}}>
                    <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
                    새로고침
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                    휴지통 비우기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {/* Curation toolbar (merged into nav) */}
          {props.activeTab === "curation" && (
            <div className="flex items-center gap-1.5">
              <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
              {/* Template selector */}
              <Select
                value={props.curationSelectedTemplateId || "__current__"}
                onValueChange={(v) =>
                  props.setCurationSelectedTemplateId(v === "__current__" ? "" : v)
                }
              >
                <SelectTrigger className="h-7 w-[130px] border-line bg-background px-1.5 text-[11px] font-bold shadow-none focus:ring-0 sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="__current__"
                    className="text-[12px] font-bold"
                  >
                    현재 편집 중인 템플릿
                  </SelectItem>
                  {props.savedTemplates.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={t.id}
                      className="text-[12px] font-bold"
                    >
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="ml-1 hidden shrink-0 items-center gap-2 md:flex">
          <ServerStatus
            name="백엔드"
            isConnected={props.isAliveBackend && props.backendAlive}
            okHint="백엔드와 연결되어 있습니다."
            failHint="백엔드 서버 상태를 확인해주세요."
          />
          <WorkerStatus
            workers={props.workers}
            backendAlive={props.isAliveBackend}
          />
        </div>
      </div>

      {/* Collapsible Filters (gallery only) */}
      {props.activeTab === "gallery" && props.galleryShowFilters && (
        <div className="border-t border-line/60 bg-panel/80 px-3 py-2 md:px-4 md:py-2.5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">
                검색
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center">
                <Input
                  className="h-7 w-full text-xs"
                  type="search"
                  placeholder="파일명 필터"
                  value={props.galleryFilenameFilter}
                  onChange={(e) => props.setGalleryFilenameFilter(e.target.value)}
                />
                <Input
                  className="h-7 w-full text-xs"
                  type="search"
                  placeholder="태그 필터"
                  value={props.galleryTagFilter}
                  onChange={(e) => props.setGalleryTagFilter(e.target.value)}
                />
                <Input
                  className="h-7 w-full text-xs"
                  type="search"
                  placeholder="메타데이터/prompt 검색"
                  value={props.galleryMetadataFilter}
                  onChange={(e) => props.setGalleryMetadataFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="hidden h-4 w-px bg-line md:block" />

            <div className="flex items-center justify-between border-t border-line/40 pt-2 md:border-0 md:pt-0">
              <div className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  id="gallery-hide-rejected"
                  checked={props.galleryHideRejected}
                  onCheckedChange={(v) => props.setGalleryHideRejected(v === true)}
                />
                <Label
                  htmlFor="gallery-hide-rejected"
                  className="cursor-pointer text-[11px] font-bold text-muted-foreground"
                >
                  리젝 숨기기
                </Label>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-muted-foreground"
                onClick={() => {
                  props.setGalleryFilenameFilter("")
                  props.setGalleryTagFilter("")
                  props.setGalleryMetadataFilter("")
                  props.setGalleryHideRejected(false)
                }}
              >
                <XIcon className="mr-1 h-3 w-3" />
                필터 초기화
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
