import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Search, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "../api"
import { convertGraphToPrompt } from "../services/appService"
import type { ComfyWorkflowLink, ComfyWorkflowNode } from "../types/workflow"
import type { WorkerView } from "../types/Message"

interface ComfyWorkflowImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (workflowJson: string, name: string) => void
  workers: WorkerView[]
}

export function ComfyWorkflowImportDialog({
  isOpen,
  onClose,
  onImport,
  workers,
}: ComfyWorkflowImportDialogProps): React.JSX.Element {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("")
  const [workflows, setWorkflows] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // 온라인 상태인 comfyui 타입의 워커만 필터링
  const activeWorkers = workers.filter(
    (w) => w.alive && (w.workerType === "comfyui" || !w.workerType)
  )

  // 기본 워커 선택
  useEffect(() => {
    const firstWorker = activeWorkers[0]
    if (firstWorker && !selectedWorkerId) {
      setSelectedWorkerId(firstWorker.id)
    }
  }, [activeWorkers, selectedWorkerId])

  // 워크플로우 목록 로드
  const loadWorkflows = useCallback(async (workerId: string) => {
    if (!workerId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getComfyWorkflows(workerId)
      
      // 다양한 ComfyUI API 버전 응답 스펙 호환 처리
      const fileNames = data
        .map((item: any) => {
          if (typeof item === "string") return item
          if (
            typeof item === "object" &&
            item !== null &&
            typeof item.name === "string"
          ) {
            // 폴더는 리스트에서 제외 (파일명만 남김)
            if (item.type && item.type !== "file") return null
            return item.name
          }
          return null
        })
        .filter((name): name is string => name !== null)

      setWorkflows(fileNames)
    } catch (err) {
      console.error("Failed to load comfy workflows:", err)
      setError("ComfyUI 서버로부터 워크플로우 목록을 가져오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  // 워커 변경되거나 열릴 때 트리거
  useEffect(() => {
    if (isOpen && selectedWorkerId) {
      void loadWorkflows(selectedWorkerId)
    }
  }, [isOpen, selectedWorkerId, loadWorkflows])

  // 파일 선택 및 API JSON 변환 로직
  const handleSelectWorkflow = async (filename: string) => {
    if (!selectedWorkerId) return
    setLoading(true)
    try {
      const content = await api.getComfyWorkflowContent(
        selectedWorkerId,
        filename
      )

      if (!content || typeof content !== "object") {
        toast.error("유효한 JSON 파일이 아닙니다.")
        return
      }

      // UI 포맷 JSON 인지 검증 (ComfyUI의 일반 저장 포맷은 nodes 배열을 포함함)
      if (Array.isArray(content.nodes)) {
        const rawLinks = content.links || []
        
        // ComfyUI UI JSON의 links는 보통 튜플(배열) 형태이므로 ComfyWorkflowLink 인터페이스로 변환
        const formattedLinks: ComfyWorkflowLink[] = rawLinks.map((link: any) => {
          if (Array.isArray(link)) {
            return {
              id: link[0],
              origin_id: link[1],
              origin_slot: link[2],
              target_id: link[3],
              target_slot: link[4],
              type: link[5],
            }
          }
          return link
        })

        // convertGraphToPrompt 호출하여 API 포맷으로 변환
        const apiPrompt = convertGraphToPrompt(
          content.nodes as ComfyWorkflowNode[],
          formattedLinks
        )

        const baseName = filename.replace(/\.[^/.]+$/, "")
        onImport(JSON.stringify(apiPrompt, null, 2), baseName)
        toast.success(`'${filename}' 워크플로우를 성공적으로 변환하여 로드했습니다.`)
        onClose()
      } else {
        // 이미 API 포맷일 경우 바로 임포트
        const baseName = filename.replace(/\.[^/.]+$/, "")
        onImport(JSON.stringify(content, null, 2), baseName)
        toast.success(`'${filename}' API 워크플로우를 로드했습니다.`)
        onClose()
      }
    } catch (err) {
      console.error("Failed to load workflow content:", err)
      toast.error("워크플로우 데이터를 로드하고 변환하는 도중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  const filteredWorkflows = workflows.filter((name) =>
    name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>ComfyUI 워크플로우 직접 로드</DialogTitle>
          <DialogDescription>
            ComfyUI 서버에 저장된 워크플로우 파일을 선택하여 WebUI의 API 형식으로 직접 변환해 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* 워커 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground shrink-0 w-16">서버 선택</span>
            <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
              <SelectTrigger className="flex-1 h-9">
                <SelectValue placeholder="ComfyUI 서버 선택..." />
              </SelectTrigger>
              <SelectContent>
                {activeWorkers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    활성화된 ComfyUI 서버가 없습니다.
                  </SelectItem>
                ) : (
                  activeWorkers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.id} ({w.url})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* 검색 바 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="워크플로우 이름 검색..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* 리스트 영역 */}
          <div className="border rounded-lg max-h-60 overflow-y-auto divide-y bg-background">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                목록을 불러오는 중...
              </div>
            ) : error ? (
              <div className="text-center py-8 text-xs text-destructive px-4">
                {error}
              </div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {searchQuery ? "검색 결과가 없습니다." : "저장된 워크플로우 파일이 없습니다."}
              </div>
            ) : (
              filteredWorkflows.map((filename) => (
                <button
                  key={filename}
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-xs font-medium hover:bg-muted/70 transition-colors flex items-center justify-between"
                  onClick={() => void handleSelectWorkflow(filename)}
                >
                  <span className="truncate flex-1 pr-4">{filename}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded font-mono">
                    Load
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadWorkflows(selectedWorkerId)}
            disabled={loading || !selectedWorkerId}
          >
            새로고침
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
