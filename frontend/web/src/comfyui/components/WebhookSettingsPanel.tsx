import { useCallback, useState } from "react"
import { Bell, BellOff, Plus, Trash2, Send, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useConfirm } from "@/comfyui/hooks/useConfirm"
import {
  useWebhooks,
  type WebhookConfig,
  type ChannelType,
} from "../hooks/useWebhooks"

const CHANNEL_LABELS: Record<ChannelType, string> = {
  discord: "Discord",
  telegram: "Telegram",
  generic: "Generic",
}

const CHANNEL_PLACEHOLDERS: Record<ChannelType, string> = {
  discord: "https://discord.com/api/webhooks/...",
  telegram: "Bot TOKEN 또는 전체 API URL",
  generic: "https://example.com/webhook",
}

const EVENT_LABELS: Record<string, string> = {
  job_done: "잡 완료",
  job_error: "잡 실패",
  batch_completed: "배치 완료",
}

interface Props {
  backendUrl: string
}

export function WebhookSettingsPanel({ backendUrl }: Props) {
  const confirm = useConfirm()
  const {
    configs,
    isLoading,
    addConfig,
    updateConfig,
    deleteConfig,
    testConfig,
    allEvents,
  } = useWebhooks(backendUrl)

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const [newConfig, setNewConfig] = useState<WebhookConfig>({
    id: "",
    name: "",
    channel_type: "discord",
    url: "",
    events: [...allEvents],
    enabled: true,
    include_image: false,
  })

  const updateNewConfig = useCallback(
    <K extends keyof WebhookConfig>(key: K, value: WebhookConfig[K]) => {
      setNewConfig((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleAdd = async () => {
    if (!newConfig.name.trim()) {
      toast.error("이름을 입력하세요.")
      return
    }
    if (!newConfig.url.trim()) {
      toast.error("URL을 입력하세요.")
      return
    }
    if (newConfig.events.length === 0) {
      toast.error("최소 하나의 이벤트를 선택하세요.")
      return
    }
    const ok = await addConfig(newConfig)
    if (ok) {
      toast.success("웹훅이 추가되었습니다.")
      setIsAdding(false)
      setNewConfig({
        id: "",
        name: "",
        channel_type: "discord",
        url: "",
        events: [...allEvents],
        enabled: true,
        include_image: false,
      })
    } else {
      toast.error("웹훅 추가에 실패했습니다.")
    }
  }

  const handleToggleEnabled = async (cfg: WebhookConfig) => {
    await updateConfig(cfg.id, { enabled: !cfg.enabled })
  }

  const handleDelete = async (cfg: WebhookConfig) => {
    if (
      !(await confirm({
        title: "웹훅 삭제",
        description: `'${cfg.name}' 웹훅을 삭제하시겠습니까?`,
        variant: "destructive",
        confirmText: "삭제",
      }))
    )
      return
    const ok = await deleteConfig(cfg.id)
    if (ok) {
      toast.success("웹훅이 삭제되었습니다.")
    }
  }

  const handleTest = async (cfg: WebhookConfig) => {
    setTestingId(cfg.id)
    const ok = await testConfig(cfg.id)
    setTestingId(null)
    if (ok) {
      toast.success("테스트 알림이 전송되었습니다.")
    } else {
      toast.error("테스트 알림 전송에 실패했습니다.")
    }
  }

  const handleToggleEvent = (cfg: WebhookConfig, event: string) => {
    const events = cfg.events.includes(event)
      ? cfg.events.filter((e) => e !== event)
      : [...cfg.events, event]
    updateConfig(cfg.id, { events })
  }

  const handleToggleImage = async (cfg: WebhookConfig) => {
    await updateConfig(cfg.id, { include_image: !cfg.include_image })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">웹훅 알림</p>
        <p className="text-sm text-muted-foreground">
          잡 완료/실패 시 Discord, Telegram 등으로 알림을 전송합니다.
        </p>
      </div>

      {/* Existing webhooks */}
      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((cfg) => (
            <WebhookCard
              key={cfg.id}
              config={cfg}
              isEditing={editingId === cfg.id}
              setEditingId={setEditingId}
              isTesting={testingId === cfg.id}
              onToggleEnabled={handleToggleEnabled}
              onDelete={handleDelete}
              onTest={handleTest}
              onToggleEvent={handleToggleEvent}
              onToggleImage={handleToggleImage}
            />
          ))}
        </div>
      )}

      {/* Add form */}
      {isAdding ? (
        <WebhookForm
          config={newConfig}
          onUpdate={updateNewConfig}
          onSubmit={handleAdd}
          onCancel={() => setIsAdding(false)}
          isSubmitting={isLoading}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          웹훅 추가
        </Button>
      )}
    </div>
  )
}

// ── Webhook Card ──

interface WebhookCardProps {
  config: WebhookConfig
  isEditing: boolean
  setEditingId: (id: string | null) => void
  isTesting: boolean
  onToggleEnabled: (cfg: WebhookConfig) => void
  onDelete: (cfg: WebhookConfig) => void
  onTest: (cfg: WebhookConfig) => void
  onToggleEvent: (cfg: WebhookConfig, event: string) => void
  onToggleImage: (cfg: WebhookConfig) => void
}

function WebhookCard({
  config,
  isEditing,
  setEditingId,
  isTesting,
  onToggleEnabled,
  onDelete,
  onTest,
  onToggleEvent,
  onToggleImage,
}: WebhookCardProps) {
  const [showUrl, setShowUrl] = useState(false)

  return (
    <div
      className={`rounded-lg border ${
        config.enabled ? "border-line" : "border-line/50 opacity-60"
      } space-y-2 p-3`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => onToggleEnabled(config)} className="shrink-0">
            {config.enabled ? (
              <Bell className="h-4 w-4 text-ok" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <div>
            <p className="text-sm font-semibold">{config.name}</p>
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              {CHANNEL_LABELS[config.channel_type]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onTest(config)}
            disabled={isTesting || !config.enabled}
          >
            {isTesting ? (
              <Send className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setEditingId(isEditing ? null : config.id)}
          >
            {isEditing ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={() => onDelete(config)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* URL (masked) */}
      <div className="flex items-center gap-1.5">
        <code className="flex-1 truncate font-mono text-[10px] text-muted-foreground">
          {showUrl ? config.url : config.url.replace(/\/[^/]*$/, "/••••••••")}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => setShowUrl(!showUrl)}
        >
          {showUrl ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Events & options (expandable) */}
      {isEditing && (
        <div className="space-y-2 border-t border-line pt-2">
          <div>
            <p className="mb-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              알림 이벤트
            </p>
            <div className="space-y-1">
              {["job_done", "job_error", "batch_completed"].map((event) => (
                <div key={event} className="flex items-center gap-2">
                  <Checkbox
                    id={`evt-${config.id}-${event}`}
                    checked={config.events.includes(event)}
                    onCheckedChange={() => onToggleEvent(config, event)}
                  />
                  <Label
                    htmlFor={`evt-${config.id}-${event}`}
                    className="text-xs"
                  >
                    {EVENT_LABELS[event]}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.include_image}
                onCheckedChange={() => onToggleImage(config)}
              />
              <span className="text-xs">결과 이미지 포함</span>
            </div>
          </div>
        </div>
      )}

      {/* Event badges (collapsed) */}
      {!isEditing && (
        <div className="flex flex-wrap gap-1">
          {config.events.map((event) => (
            <span
              key={event}
              className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground"
            >
              {EVENT_LABELS[event]}
            </span>
          ))}
          {config.include_image && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
              이미지 포함
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Webhook Form ──

interface WebhookFormProps {
  config: WebhookConfig
  onUpdate: <K extends keyof WebhookConfig>(
    key: K,
    value: WebhookConfig[K]
  ) => void
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
}

function WebhookForm({
  config,
  onUpdate,
  onSubmit,
  onCancel,
  isSubmitting,
}: WebhookFormProps) {
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div>
        <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          이름
        </Label>
        <Input
          placeholder="예) 메인 디스코드 채널"
          value={config.name}
          onChange={(e) => onUpdate("name", e.target.value)}
          className="mt-1 h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            채널 타입
          </Label>
          <Select
            value={config.channel_type}
            onValueChange={(v) => onUpdate("channel_type", v as ChannelType)}
          >
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discord">Discord</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="generic">Generic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            활성화
          </Label>
          <div className="mt-2">
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => onUpdate("enabled", v === true)}
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          URL
        </Label>
        <Input
          placeholder={CHANNEL_PLACEHOLDERS[config.channel_type]}
          value={config.url}
          onChange={(e) => onUpdate("url", e.target.value)}
          className="mt-1 h-8 text-sm"
        />
      </div>

      <div>
        <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          알림 이벤트
        </Label>
        <div className="mt-1.5 space-y-1">
          {["job_done", "job_error", "batch_completed"].map((event) => (
            <div key={event} className="flex items-center gap-2">
              <Checkbox
                id={`new-evt-${event}`}
                checked={config.events.includes(event)}
                onCheckedChange={(checked) => {
                  const events = checked
                    ? [...config.events, event]
                    : config.events.filter((e) => e !== event)
                  onUpdate("events", events)
                }}
              />
              <Label htmlFor={`new-evt-${event}`} className="text-xs">
                {EVENT_LABELS[event]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={config.include_image}
          onCheckedChange={(v) => onUpdate("include_image", v === true)}
        />
        <span className="text-xs">결과 이미지 포함</span>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isSubmitting}>
          추가
        </Button>
      </div>
    </div>
  )
}
