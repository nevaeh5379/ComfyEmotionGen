import { ClipboardList, BarChart3, ImageIcon, Layers, Sparkles, Settings } from "lucide-react"

export const NAV_TABS = [
  { id: "jobs", label: "작업", icon: ClipboardList },
  { id: "stats", label: "통계", icon: BarChart3 },
  { id: "gallery", label: "갤러리", icon: ImageIcon },
  { id: "curation", label: "큐레이션", icon: Layers },
  { id: "generator", label: "템플릿 생성기", icon: Sparkles },
  { id: "settings", label: "설정", icon: Settings },
] as const

export type TabId = (typeof NAV_TABS)[number]["id"]
