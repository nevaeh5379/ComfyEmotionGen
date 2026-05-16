import { useEffect, useMemo, useState } from "react"
import type { NodeMapping } from "../lib/workflow"
import {
  applyAxisFilters,
  buildWorkflowForItem,
  itemKey,
} from "../lib/workflowUtils"
import type { RenderItem, RenderItemsResponse } from "./renderTypes"

interface ImageUploadState {
  uploadedName: string | null
  error: string | null
  uploading: boolean
}

interface UseJobRunnerParams {
  cegTemplate: string
  workflowJson: string
  nodeMappings: NodeMapping[]
  imageUploads: Record<string, ImageUploadState>
  backendUrl: string
  isAliveBackend: boolean
}

export function useJobRunner({
  cegTemplate,
  workflowJson,
  nodeMappings,
  imageUploads,
  backendUrl,
  isAliveBackend,
}: UseJobRunnerParams) {
  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [parserError, setParserError] = useState<string | null>(null)
  const [axisValueFilter, setAxisValueFilter] = useState<
    Record<string, Record<string, boolean>>
  >({})
  const [collapsedAxes, setCollapsedAxes] = useState<Set<string>>(new Set())
  const [uncheckedItems, setUncheckedItems] = useState<Set<string>>(new Set())
  const [repeatCount, setRepeatCount] = useState(1)

  // CEG 템플릿 변경 시 자동 파싱 (600ms debounce)
  useEffect(() => {
    if (!isAliveBackend || !cegTemplate.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setParserError(null)
      try {
        const res = await fetch(`${backendUrl}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: cegTemplate }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as RenderItemsResponse
        setFakeJobQueue(data.items)
        setUncheckedItems(new Set())
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        setParserError(err instanceof Error ? err.message : String(err))
      }
    }, 600)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [cegTemplate, isAliveBackend, backendUrl])

  // 파서 결과에서 축 값 자동 감지 (새 값만 추가, 기존 설정 유지)
  useEffect(() => {
    if (fakeJobQueue.length === 0) return
    setAxisValueFilter((prev) => {
      const next = { ...prev }
      fakeJobQueue.forEach((item) => {
        Object.entries(item.meta).forEach(([key, value]) => {
          if (!next[key]) next[key] = {}
          if (next[key]![value] === undefined) next[key]![value] = true
        })
      })
      return next
    })
  }, [fakeJobQueue])

  const callParser = async (): Promise<RenderItemsResponse | undefined> => {
    try {
      const response = await fetch(`${backendUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: cegTemplate || "" }),
      })
      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        throw new Error(
          `HTTP ${response.status}: ${errorText || response.statusText}`
        )
      }
      return (await response.json()) as RenderItemsResponse
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("Error occurred while fetching parser API:", error)
      setParserError(message)
      return undefined
    }
  }

  const submitJobs = async (renderItems: RenderItem[]): Promise<boolean> => {
    if (!workflowJson || renderItems.length === 0) return false
    const imageNameMap: Record<string, string> = {}
    for (const m of nodeMappings) {
      if (m.sourceType === "image") {
        const name = imageUploads[`${m.nodeId}.${m.inputKey}`]?.uploadedName
        if (name) imageNameMap[`${m.nodeId}.${m.inputKey}`] = name
      }
    }
    const items = renderItems.map((item) => ({
      filename: item.filename,
      prompt: item.prompt,
      workflow: buildWorkflowForItem(
        workflowJson,
        item,
        nodeMappings,
        imageNameMap
      ),
      meta: item.meta,
      cegTemplate: cegTemplate,
    }))
    try {
      const res = await fetch(`${backendUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return true
    } catch (error) {
      console.error("Failed to submit jobs:", error)
      return false
    }
  }

  const handleRun = async () => {
    if (!workflowJson || !isAliveBackend) return
    const parserResult = await callParser()
    if (!parserResult) return
    const items = applyAxisFilters(parserResult.items, axisValueFilter)
    const repeated =
      repeatCount > 1
        ? Array.from({ length: repeatCount }, () => items).flat()
        : items
    await submitJobs(repeated)
  }

  const handleRunSelected = async () => {
    if (!workflowJson || !isAliveBackend) return false
    const parserResult = await callParser()
    if (!parserResult) return false
    const selected = parserResult.items.filter(
      (item) => !uncheckedItems.has(itemKey(item))
    )
    const repeated =
      repeatCount > 1
        ? Array.from({ length: repeatCount }, () => selected).flat()
        : selected
    return await submitJobs(repeated)
  }

  const toggleItemCheck = (key: string) => {
    setUncheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const checkAllItems = () => setUncheckedItems(new Set())
  const uncheckAllItems = () =>
    setUncheckedItems(new Set(fakeJobQueue.map(itemKey)))

  const toggleAxisCollapse = (axis: string) =>
    setCollapsedAxes((prev) => {
      const next = new Set(prev)
      if (next.has(axis)) next.delete(axis)
      else next.add(axis)
      return next
    })

  const estimatedRunCount = useMemo(
    () =>
      fakeJobQueue.length > 0
        ? applyAxisFilters(fakeJobQueue, axisValueFilter).length
        : null,
    [fakeJobQueue, axisValueFilter]
  )

  const axisFilteredItems = useMemo(
    () => applyAxisFilters(fakeJobQueue, axisValueFilter),
    [fakeJobQueue, axisValueFilter]
  )

  const axisExcludedItems = useMemo(() => {
    const includedSet = new Set(axisFilteredItems.map(itemKey))
    return fakeJobQueue.filter((item) => !includedSet.has(itemKey(item)))
  }, [fakeJobQueue, axisFilteredItems])

  const filteredByAxisSet = useMemo(() => {
    if (Object.keys(axisValueFilter).length === 0) return null
    return new Set(applyAxisFilters(fakeJobQueue, axisValueFilter).map(itemKey))
  }, [fakeJobQueue, axisValueFilter])

  const hasActiveFilter = Object.values(axisValueFilter).some((vals) =>
    Object.values(vals).some((v) => !v)
  )

  const selectedCount = useMemo(
    () =>
      fakeJobQueue.length > 0
        ? fakeJobQueue.filter((item) => !uncheckedItems.has(itemKey(item)))
            .length
        : null,
    [fakeJobQueue, uncheckedItems]
  )

  return {
    fakeJobQueue,
    parserError,
    axisValueFilter,
    setAxisValueFilter,
    collapsedAxes,
    uncheckedItems,
    repeatCount,
    setRepeatCount,
    handleRun,
    handleRunSelected,
    toggleItemCheck,
    checkAllItems,
    uncheckAllItems,
    toggleAxisCollapse,
    estimatedRunCount,
    axisFilteredItems,
    axisExcludedItems,
    filteredByAxisSet,
    hasActiveFilter,
    selectedCount,
  }
}
