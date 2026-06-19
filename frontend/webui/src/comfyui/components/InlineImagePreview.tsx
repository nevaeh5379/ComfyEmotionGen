/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { useState, useEffect } from "react"
import { useBackend } from "../hooks/useBackend"
import { API } from "@/lib/api"
import { Loader2, AlertCircle } from "lucide-react"

export function InlineImagePreview({ filename, backendUrl }: { filename: string; backendUrl: string }): React.JSX.Element | null {
  const { jobs } = useBackend()
  const [show, setShow] = useState(false)

  const job = [...jobs].reverse().find(j => j.filename === filename)
  
  useEffect(() => {
    if (job !== undefined && job !== null) {
      const timer = setTimeout((): void => { setShow(true); }, 0)
      return (): void => { clearTimeout(timer); }
    }
    return undefined
  }, [job])

  if (!show || job === undefined || job === null) return null

  const doneHash = job.status === "done" && job.savedImageHashes.length > 0
    ? job.savedImageHashes[0]
    : null

  return (
    <div className="mt-3 rounded-md border p-3 bg-background flex flex-col justify-center items-center relative overflow-hidden">
      <div className="absolute top-2 right-2 flex gap-1">
        {job.status === "done" && (
          <span className="text-[10px] bg-ok-bg text-ok px-1.5 py-0.5 rounded">완료</span>
        )}
      </div>

      {(job.status === "pending" || job.status === "queued" || job.status === "running") ? (
        <div className="flex flex-col items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-[11px] font-medium">생성 중... ({String(job.progressPercent)}%)</span>
        </div>
        ) : doneHash !== null && doneHash !== undefined ? (
          <img 
           src={`${backendUrl}${API.savedImages.detail(doneHash)}`} 
           alt="Preview" 
           className="max-w-full max-h-[350px] object-contain rounded" 
         />
       ) : job.status === "error" ? (
        <div className="flex flex-col items-center gap-2 p-4 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-xs">생성 실패: {String(job.error)}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground p-4">이미지 데이터가 없습니다.</div>
      )}
    </div>
  )
}
