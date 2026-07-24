import { useEffect, useRef, useState } from "react"

import type { TabId } from "../components/layout/nav-tabs"

interface HeaderLayoutCache {
  tabsWidth: number
  galleryToolbarWidth: number
  compactGalleryToolbarWidth: number
}

interface HeaderElements {
  header: HTMLDivElement | null
  logo: HTMLSpanElement | null
  tabs: HTMLDivElement | null
  galleryToolbar: HTMLDivElement | null
  curationToolbar: HTMLDivElement | null
  rightSection: HTMLDivElement | null
}

interface HeaderLayoutResult {
  galleryToolbarCompact: boolean
  galleryToolbarUltraCompact: boolean
}

export interface HeaderResponsiveLayout {
  headerRef: React.RefObject<HTMLDivElement | null>
  logoRef: React.RefObject<HTMLSpanElement | null>
  tabsRef: React.RefObject<HTMLDivElement | null>
  galleryToolbarRef: React.RefObject<HTMLDivElement | null>
  curationToolbarRef: React.RefObject<HTMLDivElement | null>
  rightSectionRef: React.RefObject<HTMLDivElement | null>
  galleryToolbarCompact: boolean
  galleryToolbarUltraCompact: boolean
}

function elementWidth(element: HTMLElement | null): number {
  if (element === null) return 0
  return Math.max(element.scrollWidth, element.getBoundingClientRect().width)
}

function measureHeaderLayout(
  currentWidth: number,
  activeTab: TabId,
  elements: HeaderElements,
  cache: HeaderLayoutCache,
  toolbarCompact: boolean,
  toolbarUltraCompact: boolean
): HeaderLayoutResult {
  const logoWidth = elementWidth(elements.logo)
  const visibleGalleryWidth =
    activeTab === "gallery" ? elementWidth(elements.galleryToolbar) : 0
  const fixedRightSectionWidth =
    elementWidth(elements.rightSection) - visibleGalleryWidth
  let toolbarWidth = fixedRightSectionWidth

  if (activeTab === "gallery" && elements.galleryToolbar !== null) {
    const currentToolbarWidth = elementWidth(elements.galleryToolbar)

    // 접힌 상태의 폭을 전체 폭 캐시에 덮어쓰면 다시 펼칠 기준을 잃는다.
    if (!toolbarCompact && !toolbarUltraCompact) {
      cache.galleryToolbarWidth = currentToolbarWidth
    } else if (toolbarCompact && !toolbarUltraCompact) {
      cache.compactGalleryToolbarWidth = currentToolbarWidth
    }

    toolbarWidth += toolbarUltraCompact
      ? 36
      : toolbarCompact
        ? cache.compactGalleryToolbarWidth
        : cache.galleryToolbarWidth
  } else if (activeTab === "curation") {
    toolbarWidth += elementWidth(elements.curationToolbar)
  }

  const measuredTabsWidth = elementWidth(elements.tabs)
  if (measuredTabsWidth > 0) cache.tabsWidth = measuredTabsWidth

  const headerPadding = 80
  const tabsCompact =
    currentWidth < logoWidth + cache.tabsWidth + toolbarWidth + headerPadding
  if (activeTab !== "gallery") {
    return {
      galleryToolbarCompact: false,
      galleryToolbarUltraCompact: false,
    }
  }

  const tabsWidth = tabsCompact ? 120 : cache.tabsWidth
  const galleryToolbarCompact =
    currentWidth <
    logoWidth +
      tabsWidth +
      cache.galleryToolbarWidth +
      fixedRightSectionWidth +
      headerPadding
  const galleryToolbarUltraCompact =
    currentWidth <
    logoWidth +
      tabsWidth +
      cache.compactGalleryToolbarWidth +
      fixedRightSectionWidth +
      headerPadding

  return { galleryToolbarCompact, galleryToolbarUltraCompact }
}

function useHorizontalWheelScroll(
  ref: React.RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const handleWheel = (event: WheelEvent): void => {
      if (element.scrollWidth <= element.clientWidth) return
      event.preventDefault()
      element.scrollLeft += event.deltaY
    }
    element.addEventListener("wheel", handleWheel, { passive: false })
    return (): void => {
      element.removeEventListener("wheel", handleWheel)
    }
  }, [ref])
}

function useActiveTabVisibility(
  ref: React.RefObject<HTMLDivElement | null>,
  activeTab: TabId
): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      })
    }, 50)
    return (): void => {
      window.clearTimeout(timer)
    }
  }, [activeTab, ref])
}

/**
 * Header의 DOM 측정과 반응형 툴바 상태를 캡슐화한다.
 *
 * 측정용 ref와 폭 캐시는 함께 바뀌어야 한다. 이 훅 밖에서는 compact 상태만
 * 사용하게 해 레이아웃 계산이 표시 컴포넌트에 다시 흩어지지 않도록 한다.
 */
export function useHeaderResponsiveLayout(
  activeTab: TabId
): HeaderResponsiveLayout {
  const headerRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLSpanElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const galleryToolbarRef = useRef<HTMLDivElement>(null)
  const curationToolbarRef = useRef<HTMLDivElement>(null)
  const rightSectionRef = useRef<HTMLDivElement>(null)
  const cacheRef = useRef<HeaderLayoutCache>({
    tabsWidth: 480,
    galleryToolbarWidth: 560,
    compactGalleryToolbarWidth: 340,
  })
  const [galleryToolbarCompact, setGalleryToolbarCompact] = useState(false)
  const [galleryToolbarUltraCompact, setGalleryToolbarUltraCompact] =
    useState(false)

  useHorizontalWheelScroll(tabsRef)
  useActiveTabVisibility(tabsRef, activeTab)

  useEffect(() => {
    const header = headerRef.current
    if (header === null) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      const next = measureHeaderLayout(
        entry.contentRect.width,
        activeTab,
        {
          header,
          logo: logoRef.current,
          tabs: tabsRef.current,
          galleryToolbar: galleryToolbarRef.current,
          curationToolbar: curationToolbarRef.current,
          rightSection: rightSectionRef.current,
        },
        cacheRef.current,
        galleryToolbarCompact,
        galleryToolbarUltraCompact
      )
      setGalleryToolbarCompact(next.galleryToolbarCompact)
      setGalleryToolbarUltraCompact(next.galleryToolbarUltraCompact)
    })
    observer.observe(header)
    return (): void => {
      observer.disconnect()
    }
  }, [activeTab, galleryToolbarCompact, galleryToolbarUltraCompact])

  return {
    headerRef,
    logoRef,
    tabsRef,
    galleryToolbarRef,
    curationToolbarRef,
    rightSectionRef,
    galleryToolbarCompact,
    galleryToolbarUltraCompact,
  }
}
