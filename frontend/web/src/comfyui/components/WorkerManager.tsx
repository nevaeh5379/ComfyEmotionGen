import { useState } from "react"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

import type { WorkerView } from "../types/Message"

interface Props {
  backendUrl: string
  workers: WorkerView[]
}

interface ActiveJobConflict {
  workerId: string
  jobId: string
}

export function WorkerManager({ backendUrl, workers }: Props) {
  const [newUrl, setNewUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ActiveJobConflict | null>(null)

  const handleAdd = async () => {
    const url = newUrl.trim()
    if (!url || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${backendUrl}/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `HTTP ${res.status}`)
      }
      setNewUrl("")
      toast.success("워커가 추가되었습니다.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.error(`추가 실패: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const sendDelete = async (workerId: string, force: boolean) => {
    const qs = force ? "?force=true" : ""
    return fetch(`${backendUrl}/workers/${workerId}${qs}`, { method: "DELETE" })
  }

  const handleDelete = async (workerId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await sendDelete(workerId, false)
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        const detail = body.detail ?? {}
        setConflict({
          workerId: detail.workerId ?? workerId,
          jobId: detail.jobId ?? "?",
        })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("워커가 삭제되었습니다.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.error(`삭제 실패: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const confirmForceDelete = async () => {
    if (!conflict || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await sendDelete(conflict.workerId, true)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConflict(null)
      toast.success("작업 취소 및 워커 삭제가 완료되었습니다.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.error(`강제 삭제 실패: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1 rounded-md border bg-muted/30 p-2">
        {workers.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            등록된 워커가 없습니다. 아래에서 ComfyUI URL을 추가하세요.
          </p>
        )}
        {workers.map((w) => {
          const status = !w.alive
            ? { label: "down", dot: "bg-red-500", text: "text-red-500" }
            : w.busy
              ? { label: "busy", dot: "bg-yellow-500", text: "text-yellow-600" }
              : { label: "idle", dot: "bg-green-500", text: "text-green-600" }
          return (
            <div
              key={w.id}
              className="group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <span className="w-14 flex-none font-mono text-xs text-muted-foreground">
                {w.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {w.url}
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                <span className={`text-xs ${status.text}`}>{status.label}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                onClick={() => handleDelete(w.id)}
                disabled={busy}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="http://localhost:8188"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd()
          }}
          className="h-8 text-sm"
          disabled={busy}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={busy || !newUrl.trim()}
        >
          추가
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">⚠ {error}</p>}

      {conflict && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
          <p className="mb-2 font-semibold">진행 중인 작업이 있습니다</p>
          <p className="mb-3 text-xs text-muted-foreground">
            워커 <code className="font-mono">{conflict.workerId}</code>가 작업{" "}
            <code className="font-mono">{conflict.jobId}</code>를 실행 중입니다.
            작업을 취소하고 워커를 삭제할까요?
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmForceDelete}
              disabled={busy}
            >
              작업 취소 후 삭제
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConflict(null)}
              disabled={busy}
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
