import { useCallback, useEffect, useMemo, useState } from "react"
import { useLatestRef } from "./useLatestRef"
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
import type { SavedImage } from "../types/Message"
import { useTemplateContext } from "../contexts/useTemplateContext"
import { useWorkflowContext } from "../contexts/WorkflowContext"
import { useNodeMappingContext } from "../contexts/NodeMappingContext"
import { useBackendUrl } from "./useBackendUrl"
import { useBackendHealth } from "./useBackendHealth"

export function useJobRunner() {
  const backendUrl = useBackendUrl()
  const { isAliveBackend } = useBackendHealth()
  const { cegTemplate, activeTemplateId } = useTemplateContext()
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
  const [targetWorkerId, setTargetWorkerId] = useState<string | null>(null)

  const [renderResponse, setRenderResponse] = useState<RenderItemsResponse | null>(null)

  // Load uncheckedItems from localStorage when activeTemplateId changes
  useEffect(() => {
    const key = `ceg_unchecked_items_${activeTemplateId || "default"}`
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const arr = JSON.parse(saved) as string[]
        setUncheckedItems(new Set(arr))
      } else {
        setUncheckedItems(new Set())
      }
    } catch (e) {
      console.warn("Failed to load unchecked items", e)
      setUncheckedItems(new Set())
    }
  }, [activeTemplateId])

  // Save uncheckedItems to localStorage when it changes
  useEffect(() => {
    const key = `ceg_unchecked_items_${activeTemplateId || "default"}`
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(uncheckedItems)))
    } catch (e) {
      console.warn("Failed to save unchecked items", e)
    }
  }, [uncheckedItems, activeTemplateId])

  // CEG 템플릿 변경 시 자동 파싱 (debounce)
  useEffect(() => {
    if (!isAliveBackend || !cegTemplate.trim()) {
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

  // ── Refs for latest values (used by sync callbacks) ─────────────
  const backendUrlRef = useLatestRef(backendUrl)
  const cegTemplateRef = useLatestRef(cegTemplate)
  const workflowJsonRef = useLatestRef(workflowJson)
  const nodeMappingsRef = useLatestRef(nodeMappings)
  const targetWorkerIdRef = useLatestRef(targetWorkerId)
  const isAliveBackendRef = useLatestRef(isAliveBackend)
  const axisValueFilterRef = useLatestRef(axisValueFilter)
  const repeatCountRef = useLatestRef(repeatCount)
  const uncheckedItemsRef = useLatestRef(uncheckedItems)
  // axisFilteredItems is derived (not a ref) — computed inside callbacks

  // ── Async operations (called by sync callbacks) ─────────────────
  const callParserInternal = useCallback(async (): Promise<RenderItemsResponse | undefined> => {
    try {
      const response = await fetch(`${backendUrlRef.current}${API.render}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ template: cegTemplateRef.current || "" }),
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
  }, [])

  const submitJobsInternal = useCallback(async (items: RenderItem[]): Promise<boolean> => {
    if (!workflowJsonRef.current || items.length === 0) return false
    const imageNameMap: Record<string, string> = {}
    const imageUploads: Record<string, Record<string, string>> = {}
    for (const m of nodeMappingsRef.current) {
      if (m.sourceType === "image" && m.imageValue) {
        imageNameMap[`${m.nodeId}.${m.inputKey}`] = m.imageValue
        const match = m.imageValue.match(/^__upload__([a-f0-9]{64})\.\w+$/)
        if (match && match[1]) {
          imageUploads[match[1]] = { name: m.imageValue }
        }
      }
    }
    const payload = items.map((item) => ({
      filename: item.filename,
      prompt: item.prompt,
      workflow: buildWorkflowForItem(
        workflowJsonRef.current,
        item,
        nodeMappingsRef.current,
        imageNameMap
      ),
      meta: item.meta,
      cegTemplate: cegTemplateRef.current,
      imageUploads,
      workerType: "comfyui",
      workerId: targetWorkerIdRef.current || undefined,
    }))
    try {
      const res = await fetch(`${backendUrlRef.current}${API.jobs.root}`, {
        method: "POST",
        headers: HEADERS.json,
        body: JSON.stringify({ items: payload }),
      })
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
      return true
    } catch (error) {
      console.error("Failed to submit jobs:", error)
      toast.error("작업 제출에 실패했습니다.")
      return false
    }
  }, [])

  const fetchApprovedFilenamesInternal = useCallback(async (): Promise<Set<string>> => {
    try {
      const res = await fetch(`${backendUrlRef.current}/saved-images?limit=5000`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { items: SavedImage[] }
      const approved = data.items.filter(
        (img) => img.status === "approved"
      )
      return new Set(approved.map((img) => img.originalFilename))
    } catch (err) {
      console.error("Failed to fetch approved filenames:", err)
      return new Set<string>()
    }
  }, [])

  // ── Sync callbacks (useCallback + async internal) ───────────────
  const callParser = useCallback(
    (): Promise<RenderItemsResponse | undefined> => callParserInternal(),
    [callParserInternal]
  )

  const submitJobs = useCallback(
    (items: RenderItem[]): Promise<boolean> => submitJobsInternal(items),
    [submitJobsInternal]
  )

  const fetchApprovedFilenames = useCallback(
    (): Promise<Set<string>> => fetchApprovedFilenamesInternal(),
    [fetchApprovedFilenamesInternal]
  )

  const canUseParsedTemplate = isAliveBackend && cegTemplate.trim()
  const activeFakeJobQueue = useMemo(
    () => (canUseParsedTemplate ? fakeJobQueue : []),
    [canUseParsedTemplate, fakeJobQueue]
  )
  const activeRenderResponse = canUseParsedTemplate ? renderResponse : null

  const axisFilteredItems = useMemo(
    () => applyAxisFilters(activeFakeJobQueue, axisValueFilter),
    [activeFakeJobQueue, axisValueFilter]
  )

  const handleRun = useCallback(async () => {
    if (!workflowJsonRef.current || !isAliveBackendRef.current) return
    const parserResult = await callParser()
    if (!parserResult) return
    const items = applyAxisFilters(parserResult.items, axisValueFilterRef.current)
    const repeated =
      repeatCountRef.current > 1
        ? Array.from({ length: repeatCountRef.current }, () => items).flat()
        : items
    const ok = await submitJobs(repeated)
    if (!ok) toast.error("작업 실행에 실패했습니다.")
  }, [callParser, submitJobs])

  const handleRandomRun = useCallback(async (count: number = 1) => {
    const af = applyAxisFilters(activeFakeJobQueue, axisValueFilterRef.current)
    if (!workflowJsonRef.current || !isAliveBackendRef.current || af.length === 0)
      return
    const selected = randomSelect(af, count)
    const ok = await submitJobs(selected)
    if (!ok) toast.error("랜덤 실행에 실패했습니다.")
  }, [submitJobs, activeFakeJobQueue])

  const handleRunSelected = useCallback(async () => {
    if (!workflowJsonRef.current || !isAliveBackendRef.current) return false
    const parserResult = await callParser()
    if (!parserResult) return false
    const selected = parserResult.items.filter(
      (item) => !uncheckedItemsRef.current.has(itemKey(item))
    )
    const repeated =
      repeatCountRef.current > 1
        ? Array.from({ length: repeatCountRef.current }, () => selected).flat()
        : selected
    const ok = await submitJobs(repeated)
    if (!ok) toast.error("선택 작업 실행에 실패했습니다.")
    return ok
  }, [callParser, submitJobs])

  const handleRunSingle = useCallback(async (item: RenderItem) => {
    if (!workflowJsonRef.current || !isAliveBackendRef.current) return false
    const ok = await submitJobs([item])
    if (!ok) toast.error("테스트 실행에 실패했습니다.")
    else toast.success("테스트가 큐에 추가되었습니다.")
    return ok
  }, [submitJobs])

  const handleRunUnapproved = useCallback(async () => {
    if (!workflowJsonRef.current || !isAliveBackendRef.current) return
    const parserResult = await callParser()
    if (!parserResult) return

    const approvedSet = await fetchApprovedFilenames()
    const filtered = parserResult.items.filter(
      (item) => !approvedSet.has(item.filename)
    )

    if (filtered.length === 0) {
      toast.info("실행할 미완료(미선택) 항목이 없습니다.")
      return
    }

    toast.info(`축 필터를 제외한 전체 미완료 작업 ${filtered.length}개를 실행합니다.`)

    const repeated =
      repeatCountRef.current > 1
        ? Array.from({ length: repeatCountRef.current }, () => filtered).flat()
        : filtered
    const ok = await submitJobs(repeated)
    if (!ok) toast.error("미완료 항목 실행에 실패했습니다.")
  }, [callParser, fetchApprovedFilenames, submitJobs])

  const selectOnlyUnapprovedItems = useCallback(async () => {
    const approvedSet = await fetchApprovedFilenames()
    let count = 0
    const nextUnchecked = new Set(uncheckedItemsRef.current)
    activeFakeJobQueue.forEach((item) => {
      const key = itemKey(item)
      if (approvedSet.has(item.filename)) {
        if (!nextUnchecked.has(key)) {
          nextUnchecked.add(key)
          count++
        }
      }
    })
    setUncheckedItems(nextUnchecked)
    if (count > 0) {
      toast.success(`큐레이션 통과 항목 ${count}개가 선택 해제되었습니다.`)
    } else {
      toast.info("선택 해제할 큐레이션 통과 항목이 없습니다.")
    }
  }, [fetchApprovedFilenames])

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
    setUncheckedItems(new Set(activeFakeJobQueue.map(itemKey))), [activeFakeJobQueue])

  const toggleAxisCollapse = useCallback((axis: string) =>
    setCollapsedAxes((prev) => {
      const next = new Set(prev)
      if (next.has(axis)) next.delete(axis)
      else next.add(axis)
      return next
    }), [])

  const estimatedRunCount = useMemo(
    () =>
      activeFakeJobQueue.length > 0
        ? applyAxisFilters(activeFakeJobQueue, axisValueFilter).length
        : null,
    [activeFakeJobQueue, axisValueFilter]
  )

  const axisExcludedItems = useMemo(() => {
    const includedSet = new Set(axisFilteredItems.map(itemKey))
    return activeFakeJobQueue.filter((item) => !includedSet.has(itemKey(item)))
  }, [activeFakeJobQueue, axisFilteredItems])

  const filteredByAxisSet = useMemo(() => {
    if (Object.keys(axisValueFilter).length === 0) return null
    return new Set(applyAxisFilters(activeFakeJobQueue, axisValueFilter).map(itemKey))
  }, [activeFakeJobQueue, axisValueFilter])

  const hasActiveFilter = useMemo(
    () =>
      Object.values(axisValueFilter).some((vals) =>
        Object.values(vals).some((v) => !v)
      ),
    [axisValueFilter]
  )

  const selectedCount = useMemo(
    () =>
      activeFakeJobQueue.length > 0
        ? activeFakeJobQueue.filter((item) => !uncheckedItems.has(itemKey(item)))
            .length
        : null,
    [activeFakeJobQueue, uncheckedItems]
  )

  return {
    fakeJobQueue: activeFakeJobQueue,
    renderResponse: activeRenderResponse,
    parserError,
    axisValueFilter,
    setAxisValueFilter,
    collapsedAxes,
    uncheckedItems,
    repeatCount,
    setRepeatCount,
    randomRunCount,
    setRandomRunCount,
    targetWorkerId,
    setTargetWorkerId,
    handleRun,
    handleRunSelected,
    handleRandomRun,
    handleRunUnapproved,
    selectOnlyUnapprovedItems,
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
    handleRunSingle,
  }
}
