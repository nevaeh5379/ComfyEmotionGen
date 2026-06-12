import { useState, useEffect } from "react"
import { useBackend } from "../hooks/useBackend"
import { API } from "@/lib/api"
import { Loader2, AlertCircle } from "lucide-react"

export function InlineImagePreview({ filename, backendUrl }: { filename: string; backendUrl: string }) {
  const { jobs } = useBackend()
  const [show, setShow] = useState(false)

  // Find latest job matching filename
  // Using reverse to find the latest appended job since they are usually appended to the array
  const job = [...jobs].reverse().find(j => j.filename === filename)
  
  // Show the preview area if there is an active/completed job for this filename
  useEffect(() => {
    if (job) setShow(true)
  }, [job])

  if (!show || !job) return null
  
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
          <span className="text-[11px] font-medium">생성 중... ({job.progressPercent}%)</span>
        </div>
      ) : job.status === "done" && job.savedImageHashes && job.savedImageHashes.length > 0 ? (
        <img 
          src={`${backendUrl}${API.savedImages.detail(job.savedImageHashes[0]!)}`} 
          alt="Preview" 
          className="max-w-full max-h-[350px] object-contain rounded" 
        />
      ) : job.status === "error" ? (
        <div className="flex flex-col items-center gap-2 p-4 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-xs">생성 실패: {job.error}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground p-4">이미지 데이터가 없습니다.</div>
      )}
    </div>
  )
}
