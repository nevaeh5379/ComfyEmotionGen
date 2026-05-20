import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { IS_PACKAGE_MODE, DEFAULT_BACKEND_URL } from "@/lib/runtime"
import type { AppSettings } from "../hooks/useSettings"
import { WorkerManager } from "./WorkerManager"
import type { WorkerView } from "../types/Message"
import { FRONTEND_VERSION, COMMIT } from "@/version"

interface Props {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => void
  backendUrl: string
  onBackendUrlChange: (url: string) => void
  workers: WorkerView[]
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1">
      <h3 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="mt-0.5 shrink-0">{children}</div>
    </div>
  )
}

export function SettingsPanel({
  settings,
  updateSetting,
  backendUrl,
  onBackendUrlChange,
  workers,
}: Props) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
        {/* 페이지 헤더 */}
        <div className="flex items-end justify-between border-b border-line pb-4">
          <div>
            <h1 className="text-xl font-black tracking-tight">설정</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ComfyEmotionGen 앱 환경 설정
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground/60">
            <span className="mono">v{FRONTEND_VERSION}</span>
            {COMMIT && (
              <span className="mono rounded bg-muted px-1.5 py-0.5">
                {COMMIT.slice(0, 7)}
              </span>
            )}
          </div>
        </div>

        {/* 서버 설정 */}
        <Section title="서버 설정">
          <div className="space-y-1">
            <SettingRow
              label="백엔드 서버 URL"
              description={
                IS_PACKAGE_MODE
                  ? "포터블 모드: 런처가 할당한 백엔드 포트에 자동 연결됩니다."
                  : "CEG 백엔드 서버 주소입니다."
              }
            >
              <Input
                type="url"
                placeholder={DEFAULT_BACKEND_URL}
                value={backendUrl}
                onChange={(e) => onBackendUrlChange(e.target.value)}
                disabled={IS_PACKAGE_MODE}
                className="h-8 w-72 text-sm"
              />
            </SettingRow>
          </div>

          <Separator className="my-2" />

          <div className="py-4">
            <div className="mb-1 space-y-0.5">
              <p className="text-sm font-medium">ComfyUI 워커</p>
              <p className="text-sm text-muted-foreground">
                여러 인스턴스를 추가하면 작업이 idle 워커에 자동 분배됩니다.
              </p>
            </div>
            <div className="mt-3">
              <WorkerManager backendUrl={backendUrl} workers={workers} />
            </div>
          </div>
        </Section>

        {/* 이미지 최적화 */}
        <Section title="이미지 최적화">
          <div className="space-y-1">
            <SettingRow
              label="갤러리 페이지당 이미지 수"
              description="갤러리 탭의 한 페이지에 표시할 이미지 수입니다."
            >
              <Select
                value={String(settings.imagePageSize)}
                onValueChange={(v) =>
                  updateSetting(
                    "imagePageSize",
                    Number(v) as AppSettings["imagePageSize"]
                  )
                }
              >
                <SelectTrigger className="h-8 w-36 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24장</SelectItem>
                  <SelectItem value="48">48장</SelectItem>
                  <SelectItem value="96">96장</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <Separator />
            <SettingRow
              label="이미지 지연 로딩"
              description="화면 밖 이미지는 스크롤 시점에 로드합니다. 많은 이미지를 다룰 때 초기 로딩 속도가 빨라집니다."
            >
              <Switch
                checked={settings.imageLazyLoad}
                onCheckedChange={(v) =>
                  updateSetting("imageLazyLoad", v === true)
                }
              />
            </SettingRow>
          </div>
        </Section>

        {/* 큐레이션 동작 */}
        <Section title="큐레이션 동작">
          <SettingRow
            label="리젝 자동 적용"
            description="큐레이션에서 이미지를 선택하면 나머지를 자동으로 탈락 처리하고 다음 조합으로 이동합니다."
          >
            <Switch
              checked={settings.autoApplyReject}
              onCheckedChange={(v) =>
                updateSetting("autoApplyReject", v === true)
              }
            />
          </SettingRow>
        </Section>

        {/* UI 기능 */}
        <Section title="UI 기능">
          <SettingRow
            label="호버 기능 사용"
            description="이미지 위에 마우스를 올릴 때 확대 보기와 미리보기 카드를 표시합니다. 성능이 낮은 환경에서 끄면 유용합니다."
          >
            <Switch
              checked={settings.enableHover}
              onCheckedChange={(v) => updateSetting("enableHover", v === true)}
            />
          </SettingRow>
        </Section>

        {/* 키보드 단축키 */}
        <Section title="키보드 단축키">
          <div className="space-y-0">
            {([
              ["D", "다크/라이트 모드 전환"],
              ["ESC", "이미지 뷰어 닫기"],
              ["Shift + 드래그", "이미지 뷰어에서 영역 확대"],
              ["좌클릭", "이미지 뷰어에서 확대"],
              ["우클릭", "이미지 뷰어에서 축소"],
              ["스크롤 휠", "이미지 뷰어에서 줌 인/아웃"],
            ] as const).map(([key, desc]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="text-sm text-muted-foreground">{desc}</span>
                <kbd className="shrink-0 rounded-md border bg-muted px-2 py-1 font-mono text-[11px] font-bold text-muted-foreground">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </ScrollArea>
  )
}
