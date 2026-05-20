import { useCallback, useEffect, useState } from "react"

import { STORAGE_KEYS } from "@/lib/storageKeys"

const SETTINGS_KEY = STORAGE_KEYS.appSettings

export interface AppSettings {
  imagePageSize: 24 | 48 | 96
  imageLazyLoad: boolean
  autoApplyReject: boolean
  enableHover: boolean
  /** 갤러리 내보내기 범위: approved(통과된 이미지만) | all(전체 이미지) */
  galleryExportScope: "approved" | "all"
  /** 갤러리 내보내기 중복 처리: hash(해시 기반) | number(숫자 기반) */
  galleryExportStrategy: "hash" | "number"
  /** 단일 이미지 다운로드 방식: newtab(새탭 열기) | direct(바로 다운로드) */
  singleDownloadMode: "newtab" | "direct"
}

const DEFAULT_SETTINGS: AppSettings = {
  imagePageSize: 48,
  imageLazyLoad: true,
  autoApplyReject: true,
  enableHover: true,
  galleryExportScope: "approved",
  galleryExportStrategy: "hash",
  singleDownloadMode: "newtab",
}

const load = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    return stored
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(load)

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  return { settings, updateSetting }
}
