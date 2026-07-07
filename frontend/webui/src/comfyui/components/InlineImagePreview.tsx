import { useState, useEffect } from "react"
import { useBackend } from "../hooks/useBackend"
import { API } from "@/lib/api"
import { Loader2, AlertCircle, Check, X, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { curationApi } from "../hooks/useSavedImages"
import type { CurationStatus } from "../types/Message"

export function InlineImagePreview({
  filename,
  backendUrl,
  onRegenerate,
  showCurationActions = false,
}: {
  filename: string
  backendUrl: string
  onRegenerate?: () => void
  showCurationActions?: boolean
}): React.JSX.Element | null {
  const { jobs } = useBackend()
  const [show, setShow] = useState(false)
  const [statusBusy, setStatusBusy] = useState<CurationStatus | null>(null)

  const job = [...jobs].reverse().find((j) => j.filename === filename)

  useEffect(() => {
    if (job !== undefined) {
      const timer = setTimeout((): void => {
        setShow(true)
      }, 0)
      return (): void => {
        clearTimeout(timer)
      }
    }
    return undefined
  }, [job])

  if (!show || job === undefined) return null

  const doneHash =
    job.status === "done" && job.savedImageHashes.length > 0
      ? job.savedImageHashes[0]
      : null

  const setStatus = async (status: CurationStatus): Promise<void> => {
    if (doneHash === null || doneHash === undefined) return
    const hash = doneHash
    setStatusBusy(status)
    try {
      await curationApi.patchStatus(backendUrl, hash, status)
      toast.success(
        status === "approved"
          ? "이미지를 통과 처리했습니다."
          : status === "rejected"
            ? "이미지를 탈락 처리했습니다."
            : "이미지 상태를 대기로 변경했습니다."
      )
    } catch {
      toast.error("이미지 상태 변경에 실패했습니다.")
    } finally {
      setStatusBusy(null)
    }
  }

  return (
    <div className="relative mt-3 flex flex-col items-center justify-center overflow-hidden rounded-md border bg-background p-3">
      <div className="absolute top-2 right-2 flex gap-1">
        {job.status === "done" && (
          <span className="rounded bg-ok-bg px-1.5 py-0.5 text-[10px] text-ok">
            완료
          </span>
        )}
      </div>

      {job.status === "pending" ||
      job.status === "queued" ||
      job.status === "running" ? (
        <div className="flex flex-col items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-[11px] font-medium">
            생성 중... ({String(job.progressPercent)}%)
          </span>
        </div>
      ) : doneHash !== null && doneHash !== undefined ? (
        <>
          <img
            src={`${backendUrl}${API.savedImages.detail(doneHash)}`}
            alt="Preview"
            className="max-h-[350px] max-w-full rounded object-contain"
          />
          {(showCurationActions || onRegenerate !== undefined) && (
            <div className="mt-3 flex w-full flex-wrap items-center justify-center gap-1.5">
              {showCurationActions && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px] text-ok hover:text-ok"
                    disabled={statusBusy !== null}
                    onClick={() => {
                      void setStatus("approved")
                    }}
                  >
                    <Check className="h-3 w-3" />
                    통과
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px] text-bad hover:text-bad"
                    disabled={statusBusy !== null}
                    onClick={() => {
                      void setStatus("rejected")
                    }}
                  >
                    <X className="h-3 w-3" />
                    탈락
                  </Button>
                </>
              )}
              {onRegenerate !== undefined && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={onRegenerate}
                >
                  <RotateCcw className="h-3 w-3" />
                  다시 생성
                </Button>
              )}
            </div>
          )}
        </>
      ) : job.status === "error" ? (
        <div className="flex flex-col items-center gap-2 p-4 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-xs">생성 실패: {String(job.error)}</span>
        </div>
      ) : (
        <div className="p-4 text-xs text-muted-foreground">
          이미지 데이터가 없습니다.
        </div>
      )}
    </div>
  )
}
