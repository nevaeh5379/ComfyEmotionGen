import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { IS_PACKAGE_MODE, DEFAULT_BACKEND_URL } from "@/lib/runtime"
import type { AppSettings } from "./useSettings"

interface Props {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  backendUrl: string
  onBackendUrlChange: (url: string) => void
}

export function SettingsPanel({
  settings,
  updateSetting,
  backendUrl,
  onBackendUrlChange,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">백엔드 연결</h2>
        <FieldGroup>
          <Field>
            <FieldLabel>백엔드 서버 URL</FieldLabel>
            <Input
              type="url"
              placeholder={DEFAULT_BACKEND_URL}
              value={backendUrl}
              onChange={(e) => onBackendUrlChange(e.target.value)}
              disabled={IS_PACKAGE_MODE}
            />
            <FieldDescription>
              {IS_PACKAGE_MODE
                ? "포터블 모드: 런처가 할당한 백엔드 포트에 자동 연결됩니다."
                : "CEG 백엔드 서버 주소입니다. ComfyUI 워커 URL은 '잡' 탭에서 관리합니다."}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">이미지 최적화</h2>
        <FieldGroup>
          <Field>
            <FieldLabel>갤러리 페이지당 이미지 수</FieldLabel>
            <select
              className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
              value={settings.imagePageSize}
              onChange={(e) =>
                updateSetting(
                  "imagePageSize",
                  Number(e.target.value) as AppSettings["imagePageSize"]
                )
              }
            >
              <option value={24}>24장</option>
              <option value={48}>48장 (기본)</option>
              <option value={96}>96장</option>
            </select>
            <FieldDescription>
              갤러리 탭의 한 페이지에 표시할 이미지 수입니다.
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="lazy-load"
              checked={settings.imageLazyLoad}
              onCheckedChange={(v) => updateSetting("imageLazyLoad", v === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="lazy-load">이미지 지연 로딩</FieldLabel>
              <FieldDescription>
                화면 밖 이미지는 스크롤 시점에 로드합니다. 많은 이미지를 다룰 때 초기 로딩 속도가 빨라집니다.
              </FieldDescription>
            </div>
          </Field>
        </FieldGroup>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">큐레이션 동작</h2>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="auto-reject"
              checked={settings.autoApplyReject}
              onCheckedChange={(v) => updateSetting("autoApplyReject", v === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="auto-reject">리젝 자동 적용</FieldLabel>
              <FieldDescription>
                큐레이션에서 이미지를 선택하면 나머지를 자동으로 탈락 처리하고 다음 조합으로 이동합니다.
              </FieldDescription>
            </div>
          </Field>
        </FieldGroup>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">UI 기능</h2>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="enable-hover"
              checked={settings.enableHover}
              onCheckedChange={(v) => updateSetting("enableHover", v === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="enable-hover">호버 기능 사용</FieldLabel>
              <FieldDescription>
                이미지 위에 마우스를 올릴 때 확대 보기(Magnifier)와 미리보기 카드를 표시합니다. 성능이 낮은 환경에서 끄면 유용합니다.
              </FieldDescription>
            </div>
          </Field>
        </FieldGroup>
      </div>
    </div>
  )
}
