import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, Replace } from "lucide-react"
import { toast } from "sonner"

interface RenameCandidate {
  hash: string
  oldFilename: string
  newFilename: string
  metaChanged: boolean
}

interface RenameResponse {
  matched: number
  renamed: number
  updated: RenameCandidate[]
}

interface Props {
  backendUrl: string
}

export function FilenameMigrationTool({ backendUrl }: Props): React.JSX.Element {
  const [fromSegment, setFromSegment] = useState("")
  const [toSegment, setToSegment] = useState("")
  const [axisName, setAxisName] = useState("")
  const [axisValueFrom, setAxisValueFrom] = useState("")
  const [axisValueTo, setAxisValueTo] = useState("")
  const [dryRunResult, setDryRunResult] = useState<RenameResponse | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  const cleanUrl = backendUrl.replace(/\/+$/, "")
  const hasMetaAxis = axisName.trim() !== ""

  async function runDryRun(): Promise<void> {
    if (!fromSegment.trim()) {
      toast.error("찾을 파일명 조각을 입력하세요.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${cleanUrl}/saved-images/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromSegment: fromSegment.trim(),
          toSegment: toSegment.trim(),
          axisName: hasMetaAxis ? axisName.trim() : null,
          axisValueFrom: hasMetaAxis ? axisValueFrom.trim() : null,
          axisValueTo: hasMetaAxis ? axisValueTo.trim() : null,
          dryRun: true,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(text)
      }
      const data = (await res.json()) as RenameResponse
      setDryRunResult(data)
      setPreviewOpen(true)
    } catch (err) {
      toast.error(
        `미리보기 실패: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setLoading(false)
    }
  }

  async function applyRename(): Promise<void> {
    setApplying(true)
    try {
      const res = await fetch(`${cleanUrl}/saved-images/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromSegment: fromSegment.trim(),
          toSegment: toSegment.trim(),
          axisName: hasMetaAxis ? axisName.trim() : null,
          axisValueFrom: hasMetaAxis ? axisValueFrom.trim() : null,
          axisValueTo: hasMetaAxis ? axisValueTo.trim() : null,
          dryRun: false,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(text)
      }
      const data = (await res.json()) as RenameResponse
      toast.success(
        `${String(data.renamed)}개 이미지의 파일명을 변경했습니다.`
      )
      setPreviewOpen(false)
      setDryRunResult(null)
      setFromSegment("")
      setToSegment("")
      setAxisName("")
      setAxisValueFrom("")
      setAxisValueTo("")
    } catch (err) {
      toast.error(
        `적용 실패: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-card/30 p-4 transition-all duration-200 hover:bg-card/50">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-500">
            <Replace className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">파일명 마이그레이션</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              템플릿의 file_key(별명)를 수정해서 기존 생성 이미지와 매칭이
              깨졌을 때 복구합니다. 저장 이미지의 파일명 부분 문자열을
              일괄 치환합니다. 필요하면 메타의 축 값도 함께 갱신.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">찾을 파일명 조각 (이전 file_key)</Label>
            <Input
              value={fromSegment}
              onChange={(e) => { setFromSegment(e.target.value); }}
              placeholder="예: oversized shirt"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">새 파일명 조각 (수정된 file_key)</Label>
            <Input
              value={toSegment}
              onChange={(e) => { setToSegment(e.target.value); }}
              placeholder="예: oversized-shirt"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            메타 축 값도 함께 갱신 (axis key를 바꾼 경우)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-line/60 bg-background/40 p-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px]">축 이름</Label>
              <Input
                value={axisName}
                onChange={(e) => { setAxisName(e.target.value); }}
                placeholder="예: sfw_outfit"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px]">이전 축 값</Label>
              <Input
                value={axisValueFrom}
                onChange={(e) => { setAxisValueFrom(e.target.value); }}
                placeholder="예: oversized_shirt"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px]">새 축 값</Label>
              <Input
                value={axisValueTo}
                onChange={(e) => { setAxisValueTo(e.target.value); }}
                placeholder="예: baggy_shirt"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </details>

        <div className="flex items-center gap-2 self-end">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !fromSegment.trim()}
            onClick={() => void runDryRun()}
            className="h-8 text-xs"
          >
            {loading ? "미리보기 중..." : "미리보기"}
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>파일명 마이그레이션 미리보기</DialogTitle>
            <DialogDescription>
              {dryRunResult
                ? `${String(dryRunResult.matched)}개 이미지가 영향받습니다.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {dryRunResult && dryRunResult.matched > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  적용 시 저장 이미지의 original_filename이 일괄 수정되며
                  되돌릴 수 없습니다. 사전에 DB 백업을 권장합니다.
                </span>
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">
                        이전 파일명
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        새 파일명
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        메타
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRunResult.updated.slice(0, 200).map((c) => (
                      <tr key={c.hash} className="border-t border-line/60">
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {c.oldFilename}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px]">
                          {c.newFilename}
                        </td>
                        <td className="px-3 py-1.5 text-[11px]">
                          {c.metaChanged ? "변경" : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dryRunResult.matched > 200 && (
                <p className="text-[11px] text-muted-foreground">
                  외 {String(dryRunResult.matched - 200)}개 더 있음.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              영향받는 이미지가 없습니다.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPreviewOpen(false); }}
              disabled={applying}
            >
              취소
            </Button>
            <Button
              size="sm"
              disabled={
                applying ||
                !dryRunResult ||
                dryRunResult.matched === 0
              }
              onClick={() => void applyRename()}
            >
              {applying ? "적용 중..." : "적용"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}