import { SettingsPanel } from "../SettingsPanel"
import type { AppSettings } from "../../hooks/useSettings"
import type { WorkerView } from "../../types/Message"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsTabProps {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => void
  backendUrl: string
  onBackendUrlChange: (url: string) => void
  workers: WorkerView[]
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

export function SettingsTab({
  settings,
  updateSetting,
  backendUrl,
  onBackendUrlChange,
  workers,
}: SettingsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <SettingsPanel
        settings={settings}
        updateSetting={updateSetting}
        backendUrl={backendUrl}
        onBackendUrlChange={onBackendUrlChange}
        workers={workers}
      />
    </div>
  )
}