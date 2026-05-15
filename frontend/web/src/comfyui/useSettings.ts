import { useCallback, useEffect, useState } from "react"

const SETTINGS_KEY = "appSettings"

export interface AppSettings {
  imagePageSize: 24 | 48 | 96
  imageLazyLoad: boolean
  autoApplyReject: boolean
  enableHover: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  imagePageSize: 48,
  imageLazyLoad: true,
  autoApplyReject: true,
  enableHover: true,
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
