import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Download, Upload } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Kbd } from "@/components/ui/kbd"

import { Switch } from "@/components/ui/switch"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IS_PACKAGE_MODE, DEFAULT_BACKEND_URL } from "@/lib/runtime"
import type { AppSettings } from "../hooks/useSettings"
import { WorkerManager } from "./WorkerManager"
import { WebhookSettingsPanel } from "./WebhookSettingsPanel"
import type { WorkerView } from "../types/Message"
import { BUNDLE_VERSION, COMMIT, IS_LOCAL_DEV } from "@/version"
import { useUpdateCheck } from "@/comfyui/hooks/useUpdateCheck"
import { useTemplateContext } from "@/comfyui/contexts/TemplateContext"
import { saveSetting } from "@/lib/serverStorage"
import type { SavedTemplate } from "@/comfyui/hooks/useSavedTemplates"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { toast } from "sonner"

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
  const template = useTemplateContext()
  const update = useUpdateCheck(settings.updateChannel)

  return (
    <div className="w-full">
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
            {IS_LOCAL_DEV ? (
              <span className="mono">{COMMIT || "dev"}</span>
            ) : (
              <>
                <span className="mono">{BUNDLE_VERSION}</span>
                {COMMIT && !BUNDLE_VERSION.includes(COMMIT) && (
                  <span className="mono rounded bg-muted px-1.5 py-0.5">
                    {COMMIT.slice(0, 7)}
                  </span>
                )}
                {update && (
                  <a
                    href={update.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-primary/10 px-1.5 py-0.5 text-primary hover:bg-primary/20"
                  >
                    ↑ {update.tag}
                  </a>
                )}
              </>
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onBackendUrlChange(e.target.value)
                }
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
          <Separator />
          <SettingRow
            label="내보내기 범위"
            description="갤러리 내보내기 시 다운로드할 이미지 범위를 선택합니다."
          >
            <Select
              value={settings.galleryExportScope}
              onValueChange={(v) =>
                updateSetting(
                  "galleryExportScope",
                  v as AppSettings["galleryExportScope"]
                )
              }
            >
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">통과된 이미지만</SelectItem>
                <SelectItem value="all">전체 이미지</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <Separator />
          <SettingRow
            label="내보내기 중복 처리"
            description="동일 파일명 이미지 내보내기 시 중복 처리 방식을 선택합니다."
          >
            <Select
              value={settings.galleryExportStrategy}
              onValueChange={(v) =>
                updateSetting(
                  "galleryExportStrategy",
                  v as AppSettings["galleryExportStrategy"]
                )
              }
            >
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hash">HASH 기반 (해시로 고유명)</SelectItem>
                <SelectItem value="number">NUM 기반 (숫자 순번)</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <Separator />
          <SettingRow
            label="단일 이미지 다운로드"
            description="이미지를 클릭했을 때 다운로드 방식을 선택합니다."
          >
            <Select
              value={settings.singleDownloadMode}
              onValueChange={(v) =>
                updateSetting(
                  "singleDownloadMode",
                  v as AppSettings["singleDownloadMode"]
                )
              }
            >
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newtab">새탭에서 열기</SelectItem>
                <SelectItem value="direct">바로 다운로드</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </Section>

        {/* 업데이트 */}
        <Section title="업데이트">
          <SettingRow
            label="업데이트 채널"
            description={
              IS_LOCAL_DEV
                ? "로컬 개발 환경에서는 자동 업데이트가 비활성화됩니다."
                : "새 버전을 확인할 채널입니다. dev는 가장 최신 빌드, stable은 검증된 릴리즈입니다."
            }
          >
            <Select
              value={settings.updateChannel}
              onValueChange={(v) =>
                updateSetting(
                  "updateChannel",
                  v as AppSettings["updateChannel"]
                )
              }
              disabled={IS_LOCAL_DEV}
            >
              <SelectTrigger className="h-8 w-36 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">자동 감지</SelectItem>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
                <SelectItem value="dev">Dev</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </Section>

        {/* 진행률 표시 */}
        <Section title="진행률 표시">
          <SettingRow
            label="진행률 계산 방식"
            description="세션 전체 진행률 표시에 적용할 계산 방식을 선택합니다."
          >
            <Select
              value={settings.progressCalculation}
              onValueChange={(v) =>
                updateSetting(
                  "progressCalculation",
                  v as AppSettings["progressCalculation"]
                )
              }
            >
              <SelectTrigger className="h-8 w-52 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="done">완료만 / 전체</SelectItem>
                <SelectItem value="doneOrCancelled">완료 + 취소 / 전체</SelectItem>
                <SelectItem value="doneOrFailed">완료 + 실패 / 전체</SelectItem>
                <SelectItem value="excludeFromDenominator">완료 / (전체 - 실패 - 취소)</SelectItem>
              </SelectContent>
            </Select>
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
          <Separator />
          <SettingRow
            label="창 모드 기능 사용"
            description="패널을 창 모드로 분리하거나 마우스 드래그로 외부 창으로 분리할 수 있습니다."
          >
            <Switch
              checked={settings.useWindowMode}
              onCheckedChange={(v) => updateSetting("useWindowMode", v === true)}
            />
          </SettingRow>
        </Section>

        {/* 알림 설정 */}
        <Section title="알림 설정">
          <WebhookSettingsPanel backendUrl={backendUrl} />
        </Section>

        {/* 데이터 관리 */}
        <Section title="데이터 관리">
          <div className="flex flex-wrap gap-3 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={template.savedTemplates.length === 0}
              onClick={() => {
                const data = template.savedTemplates.map((t) => ({
                  name: t.name,
                  template: t.template,
                  savedAt: t.savedAt,
                }))
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `templates_${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              전체 탬플릿 내보내기 (JSON)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const input = document.createElement("input")
                input.type = "file"
                input.accept = ".json"
                input.onchange = () => {
                  const target = input.files?.[0]
                  if (!target) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    try {
                      const imported = JSON.parse(reader.result as string)
                      if (!Array.isArray(imported)) {
                        toast.error("유효한 탬플릿 파일이 아닙니다.")
                        return
                      }
                      const now = Date.now()
                      const newTemplates: SavedTemplate[] = imported.map(
                        (item: unknown) => {
                          const p = item as Record<string, unknown>
                          return {
                            id: `${now + Math.random().toString(36).slice(2, 7)}`,
                            name: (p.name as string) || "미명 탬플릿",
                            template: (p.template as string) || "",
                            savedAt: (p.savedAt as number) || now,
                          }
                        }
                      )
                      const existing = loadTemplates()
                      const merged = [...existing, ...newTemplates]
                      persistTemplates(merged)
                      toast.success(
                        `${newTemplates.length}개의 탬플릿를 가져왔습니다.`
                      )
                    } catch {
                      toast.error("파일을 읽는 중 오류가 발생했습니다.")
                    }
                  }
                  reader.readAsText(target)
                }
                input.click()
              }}
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              탬플릿 가져오기 (JSON)
            </Button>
          </div>
        </Section>

        {/* 키보드 단축키 */}
        <Section title="키보드 단축키">
          <div className="space-y-6 pt-2">
            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">전역 & 앱 탐색</h4>
              <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
                {[
                  ["Alt + 1..5", "탭 전환 (작업, 통계, 갤러리, 큐레이션, 설정)"],
                  ["D", "다크/라이트 테마 토글"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-1 text-xs">
                    <span className="text-muted-foreground">{desc}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">작업 관리</h4>
              <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
                {[
                  ["Ctrl + Enter", "작업 실행 (작업 탭)"],
                  ["Ctrl + S", "템플릿/워크플로우 저장 (편집기)"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-1 text-xs">
                    <span className="text-muted-foreground">{desc}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">갤러리 탐색 & 조작</h4>
              <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
                {[
                  ["← / → / ↑ / ↓ (h/l/k/j)", "이미지 격자 포커스 이동"],
                  ["Enter / Space", "상세 보기 열기 / 선택 토글"],
                  ["1 / A", "선택된 이미지 통과 (Approved)"],
                  ["2 / X", "선택된 이미지 탈락 (Rejected)"],
                  ["3 / T", "선택된 이미지 휴지통 이동 / 대기 복원"],
                  ["P", "비교 뷰 추가 / 제거 (Pin)"],
                  ["Ctrl + Shift + R", "갤러리 새로고침"],
                  ["ESC", "포커스 해제 / 상세 보기 닫기"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-1 text-xs">
                    <span className="text-muted-foreground">{desc}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">이미지 뷰어</h4>
              <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
                {[
                  ["Shift + 드래그", "뷰어에서 영역 지정 확대"],
                  ["좌클릭", "이미지 확대"],
                  ["우클릭", "이미지 축소"],
                  ["스크롤 휠", "줌 인/아웃"],
                  ["ESC", "뷰어 닫기"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-1 text-xs">
                    <span className="text-muted-foreground">{desc}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

function loadTemplates(): SavedTemplate[] {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEYS.savedTemplates) ?? "[]"
    ) as SavedTemplate[]
  } catch {
    return []
  }
}

function persistTemplates(templates: SavedTemplate[]): void {
  const serialized = JSON.stringify(templates)
  try {
    localStorage.setItem(STORAGE_KEYS.savedTemplates, serialized)
  } catch {
    // ignore quota errors
  }
  // 서버 비동기 저장
  saveSetting(STORAGE_KEYS.savedTemplates, serialized).catch(() => {})
}
