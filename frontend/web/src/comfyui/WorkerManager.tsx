import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import type { WorkerView } from "./Message"

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1 rounded-md border bg-muted/30 p-2">
        {workers.length === 0 && (
          <p className="text-xs text-muted-foreground">
            등록된 워커가 없습니다. 아래에서 ComfyUI URL을 추가하세요.
          </p>
        )}
        {workers.map((w) => {
          const status = !w.alive
            ? { label: "down", color: "text-red-600" }
            : w.busy
              ? { label: "busy", color: "text-yellow-600" }
              : { label: "idle", color: "text-green-600" }
          return (
            <div key={w.id} className="flex items-center gap-2 text-sm">
              <span className="w-20 flex-none font-mono text-xs">{w.id}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {w.url}
              </span>
              <span className={`w-12 flex-none text-xs ${status.color}`}>
                {status.label}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(w.id)}
                disabled={busy}
              >
                삭제
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
          <p className="mb-2 font-semibold">진행 중인 잡이 있습니다</p>
          <p className="mb-3 text-xs text-muted-foreground">
            워커 <code className="font-mono">{conflict.workerId}</code>가 잡{" "}
            <code className="font-mono">{conflict.jobId}</code>를 실행 중입니다.
            잡을 취소하고 워커를 삭제할까요?
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmForceDelete}
              disabled={busy}
            >
              잡 취소 후 삭제
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
