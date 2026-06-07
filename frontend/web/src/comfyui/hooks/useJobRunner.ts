import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  applyAxisFilters,
  buildWorkflowForItem,
  itemKey,
  randomSelect,
} from "../../lib/workflowUtils"
import { API, HEADERS } from "@/lib/api"
import { CEG_TEMPLATE_DEBOUNCE_MS } from "@/lib/constants"
import type { RenderItem, RenderItemsResponse } from "../types/renderTypes"
import { useTemplateContext } from "../contexts/TemplateContext"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useNodeMappingContext } from "../contexts/NodeMappingContext"
import { useBackendUrl } from "./useBackendUrl"
import { useBackendHealth } from "./useBackendHealth"

export function useJobRunner() {
  const backendUrl = useBackendUrl()
  const { isAliveBackend } = useBackendHealth()
  const { cegTemplate } = useTemplateContext()
  const { workflowJson } = useWorkflowContext()
  const { nodeMappings } = useNodeMappingContext()

  const [fakeJobQueue, setFakeJobQueue] = useState<RenderItem[]>([])
  const [parserError, setParserError] = useState<string | null>(null)
  const [axisValueFilter, setAxisValueFilter] = useState<
    Record<string, Record<string, boolean>>
  >({})
  const [collapsedAxes, setCollapsedAxes] = useState<Set<string>>(new Set())
  const [uncheckedItems, setUncheckedItems] = useState<Set<string>>(new Set())
  const [repeatCount, setRepeatCount] = useState(1)
  const [randomRunCount, setRandomRunCount] = useState(1)

  const [renderResponse, setRenderResponse] = useState<RenderItemsResponse | null>(null)

  // CEG 템플릿 변경 시 자동 파싱 (debounce)
  useEffect(() => {
    if (!isAliveBackend || !cegTemplate.trim()) {
      setFakeJobQueue([])
      setRenderResponse(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setParserError(null)
      try {
        const res = await fetch(`${backendUrl}${API.render}`, {
          method: "POST",
          headers: HEADERS.json,
          body: JSON.stringify({ template: cegTemplate }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as RenderItemsResponse
        setFakeJobQueue(data.items)
        setRenderResponse(data)
        setUncheckedItems(new Set())
        // Discover axes from new data (add new keys/values, preserve existing toggles)
        setAxisValueFilter((prev) => {
          const next = { ...prev }
          data.items.forEach((item) => {
            Object.entries(item.meta).forEach(([key, value]) => {
              if (!next[key]) next[key] = {}
              if (next[key]![value] === undefined) next[key]![value] = true
            })
          })
          return next
        })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        setParserError(err instanceof Error ? err.message : String(err))
        setRenderResponse(null)
      }
    }, CEG_TEMPLATE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [cegTemplate, isAliveBackend, backendUrl])

  const callParser = useCallback(async (): Promise<RenderItemsResponse | undefined> => {
    try {
      const response = await fetch(`${backendUrl}${API.render}`, {
        method: "POST",
        headers: HEADERS.json,
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
  }, [backendUrl, cegTemplate])

  const submitJobs = useCallback(async (renderItems: RenderItem[]): Promise<boolean> => {
    if (!workflowJson || renderItems.length === 0) return false
    const imageNameMap: Record<string, string> = {}
    const imageUploads: Record<string, Record<string, string>> = {}
    for (const m of nodeMappings) {
      if (m.sourceType === "image" && m.imageValue) {
        imageNameMap[`${m.nodeId}.${m.inputKey}`] = m.imageValue
        // __upload__ 마커에서 hash 추출
        const match = m.imageValue.match(/^__upload__([a-f0-9]{64})\.\w+$/)
        if (match && match[1]) {
          imageUploads[match[1]] = { name: m.imageValue }
        }
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
      imageUploads,
      workerType: "comfyui",
    }))
    try {
      const res = await fetch(`${backendUrl}${API.jobs.root}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
      return true
    } catch (error) {
      console.error("Failed to submit jobs:", error)
      toast.error("작업 제출에 실패했습니다.")
      return false
    }
  }, [backendUrl, workflowJson, nodeMappings, cegTemplate])

  const axisFilteredItems = useMemo(
    () => applyAxisFilters(fakeJobQueue, axisValueFilter),
    [fakeJobQueue, axisValueFilter]
  )

  const handleRun = useCallback(async () => {
    if (!workflowJson || !isAliveBackend) return
    const parserResult = await callParser()
    if (!parserResult) return
    const items = applyAxisFilters(parserResult.items, axisValueFilter)
    const repeated =
      repeatCount > 1
        ? Array.from({ length: repeatCount }, () => items).flat()
        : items
    const ok = await submitJobs(repeated)
    if (!ok) toast.error("작업 실행에 실패했습니다.")
  }, [workflowJson, isAliveBackend, callParser, axisValueFilter, repeatCount, submitJobs])

  const handleRandomRun = useCallback(async (count: number = 1) => {
    if (!workflowJson || !isAliveBackend || axisFilteredItems.length === 0)
      return
    const selected = randomSelect(axisFilteredItems, count)
    const ok = await submitJobs(selected)
    if (!ok) toast.error("랜덤 실행에 실패했습니다.")
  }, [workflowJson, isAliveBackend, axisFilteredItems, submitJobs])

  const handleRunSelected = useCallback(async () => {
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
    const ok = await submitJobs(repeated)
    if (!ok) toast.error("선택 작업 실행에 실패했습니다.")
    return ok
  }, [workflowJson, isAliveBackend, callParser, uncheckedItems, repeatCount, submitJobs])

  const toggleItemCheck = useCallback((key: string) => {
    setUncheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const checkAllItems = useCallback(() => setUncheckedItems(new Set()), [])
  
  const uncheckAllItems = useCallback(() =>
    setUncheckedItems(new Set(fakeJobQueue.map(itemKey))), [fakeJobQueue])

  const toggleAxisCollapse = useCallback((axis: string) =>
    setCollapsedAxes((prev) => {
      const next = new Set(prev)
      if (next.has(axis)) next.delete(axis)
      else next.add(axis)
      return next
    }), [])

  const estimatedRunCount = useMemo(
    () =>
      fakeJobQueue.length > 0
        ? applyAxisFilters(fakeJobQueue, axisValueFilter).length
        : null,
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

  const hasActiveFilter = useMemo(
    () =>
      Object.values(axisValueFilter).some((vals) =>
        Object.values(vals).some((v) => !v)
      ),
    [axisValueFilter]
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
    renderResponse,
    parserError,
    axisValueFilter,
    setAxisValueFilter,
    collapsedAxes,
    uncheckedItems,
    repeatCount,
    setRepeatCount,
    randomRunCount,
    setRandomRunCount,
    handleRun,
    handleRunSelected,
    handleRandomRun,
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
    isAliveBackend,
    backendUrl,
  }
}
