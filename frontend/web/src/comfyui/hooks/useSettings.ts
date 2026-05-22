import { useCallback, useMemo } from "react"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { useSyncedStorage } from "./useSyncedStorage"

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
  /** 업데이트 채널: auto(빌드 채널 자동 감지) | dev | beta | stable */
  updateChannel: "auto" | "dev" | "beta" | "stable"
  /** 세션 진행률 계산 방식 */
  progressCalculation:
    | "done"
    | "doneOrCancelled"
    | "doneOrFailed"
    | "excludeFromDenominator"
  /** 창 모드 기능 사용 여부 */
  useWindowMode: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  imagePageSize: 48,
  imageLazyLoad: true,
  autoApplyReject: true,
  enableHover: true,
  galleryExportScope: "approved",
  galleryExportStrategy: "hash",
  singleDownloadMode: "newtab",
  updateChannel: "auto",
  progressCalculation: "done",
  useWindowMode: true,
}

export const useSettings = () => {
  const [raw, setRaw] = useSyncedStorage<AppSettings>(
    SETTINGS_KEY,
    DEFAULT_SETTINGS
  )

  // 서버/캐시 데이터가 DEFAULT_SETTINGS 에 없는 키를 포함할 수 있으므로 병합
  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...raw }),
    [raw]
  )

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setRaw((current) => {
        const merged = { ...DEFAULT_SETTINGS, ...current }
        return { ...merged, [key]: value }
      })
    },
    [setRaw]
  )

  return { settings, updateSetting }
}
