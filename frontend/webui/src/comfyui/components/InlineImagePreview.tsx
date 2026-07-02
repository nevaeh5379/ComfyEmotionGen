import { useState, useEffect } from "react"
import { useBackend } from "../hooks/useBackend"
import { API } from "@/lib/api"
import { Loader2, AlertCircle } from "lucide-react"

export function InlineImagePreview({
  filename,
  backendUrl,
}: {
  filename: string
  backendUrl: string
}): React.JSX.Element | null {
  const { jobs } = useBackend()
  const [show, setShow] = useState(false)

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
        <img
          src={`${backendUrl}${API.savedImages.detail(doneHash)}`}
          alt="Preview"
          className="max-h-[350px] max-w-full rounded object-contain"
        />
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
