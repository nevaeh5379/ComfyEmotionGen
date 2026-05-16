import { useEffect, useMemo, useState } from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import CodeEditor from "@/components/CodeEditor"

import { useBackend } from "./comfyui/useBackend"
import { CegTemplatePanel } from "./comfyui/CegTemplatePanel"
import { SavedItemsManager } from "./comfyui/SavedItemsManager"
import { SavedImagesGallery } from "./comfyui/SavedImagesGallery"
import { CombinationPicker } from "./comfyui/CombinationPicker"
import { useSavedTemplates } from "./comfyui/useSavedTemplates"
import {
  useSavedWorkflows,
  type SavedWorkflow,
} from "./comfyui/useSavedWorkflows"
import { WorkflowGraphViewer } from "./comfyui/WorkflowGraphViewer"
import { JobManagerPanel } from "./comfyui/JobManagerPanel"
import { SettingsPanel } from "./comfyui/SettingsPanel"
import { useSettings } from "./comfyui/useSettings"
import { useLocalStorage } from "./comfyui/useLocalStorage"
import { useJobRunner } from "./comfyui/useJobRunner"
import { ServerStatus, WorkerStatus } from "./comfyui/StatusIndicators"
import { ParserPreviewDialog } from "./comfyui/ParserPreviewDialog"
import { AxisFilterSheet } from "./comfyui/AxisFilterSheet"
import { SelectionSheet } from "./comfyui/SelectionSheet"
import { NameConflictDialog } from "./comfyui/NameConflictDialog"
import { PresetSelectionDialog } from "./comfyui/PresetSelectionDialog"
import { NodeMappingSection } from "./comfyui/NodeMappingSection"
import type { ObjectInfo } from "./comfyui/renderTypes"
import {
  ComfyWorkflowSchema,
  type NodeMapping,
} from "./lib/workflow"
import { buildAutoMappings } from "./lib/workflowUtils"
import {
  DEFAULT_BACKEND_URL,
  IS_PACKAGE_MODE,
  PACKAGE_BACKEND_URL,
} from "./lib/runtime"
import { useRenderLog, useWatchValues } from "./lib/renderLogger"

const HEALTH_CHECK_INTERVAL_MS = 5000

const STORAGE_KEYS = {
  workflow: "workflow",
  cegTemplate: "cegTemplate",
  backendUrl: "backendUrl",
  nodeMappings: "nodeMappings",
  activeTemplateId: "activeTemplateId",
  activeWorkflowId: "activeWorkflowId",
  activeNodeMappingPresetId: "activeNodeMappingPresetId",
} as const

const NAV_TABS = [
  { id: "jobs", label: "잡" },
  { id: "gallery", label: "갤러리" },
  { id: "curation", label: "큐레이션" },
  { id: "settings", label: "설정" },
] as const

type TabId = (typeof NAV_TABS)[number]["id"]

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App() {
  useRenderLog("App")
  const [storedBackendUrl, setStoredBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  const backendUrl = IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl
  const setBackendUrl = IS_PACKAGE_MODE ? (_: string) => {} : setStoredBackendUrl

  const [workflowJson, setWorkflowJson] = useLocalStorage(
    STORAGE_KEYS.workflow,
    ""
  )
  const [cegTemplate, setCegTemplate] = useLocalStorage(
    STORAGE_KEYS.cegTemplate,
    ""
  )
  const [nodeMappings, setNodeMappings] = useLocalStorage<NodeMapping[]>(
    STORAGE_KEYS.nodeMappings,
    []
  )

  const { isConnected: backendAlive, jobs, workers, paused } = useBackend()
  const { settings, updateSetting } = useSettings()

  const [activeTab, setActiveTab] = useState<TabId>("jobs")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isAxisFilterOpen, setIsAxisFilterOpen] = useState(false)
  const [isSelectionOpen, setIsSelectionOpen] = useState(false)
  const [isAliveBackend, setIsAliveBackend] = useState(false)
  const [objectInfo, setObjectInfo] = useState<ObjectInfo | null>(null)
  const [imageUploads, setImageUploads] = useState<
    Record<
      string,
      { uploadedName: string | null; error: string | null; uploading: boolean }
    >
  >({})
  const [previewFilter, setPreviewFilter] = useState("")
  const [templateResetKey, setTemplateResetKey] = useState(0)
  const {
    templates: savedTemplates,
    saveTemplate,
    deleteTemplate,
  } = useSavedTemplates()
  const {
    workflows: savedWorkflows,
    saveWorkflow,
    deleteWorkflow,
    saveMappingPreset,
    deleteMappingPreset,
  } = useSavedWorkflows()
  const [workflowResetKey, setWorkflowResetKey] = useState(0)

  const [activeWorkflowId, setActiveWorkflowId] = useLocalStorage<
    string | null
  >(STORAGE_KEYS.activeWorkflowId, null)
  const activeWorkflow = useMemo(
    () => savedWorkflows.find((w) => w.id === activeWorkflowId) ?? null,
    [savedWorkflows, activeWorkflowId]
  )
  const savedNodeMappings = useMemo(
    () => activeWorkflow?.mappingPresets ?? [],
    [activeWorkflow]
  )
  const [nodeMappingResetKey, setNodeMappingResetKey] = useState(0)

  const [pendingSave, setPendingSave] = useState<{
    name: string
    type: "template" | "workflow" | "nodeMapping"
  } | null>(null)
  const [activeTemplateId, setActiveTemplateId] = useLocalStorage<
    string | null
  >(STORAGE_KEYS.activeTemplateId, null)
  const [activeNodeMappingPresetId, setActiveNodeMappingPresetId] =
    useLocalStorage<string | null>(STORAGE_KEYS.activeNodeMappingPresetId, null)
  const [pendingPresetSelection, setPendingPresetSelection] =
    useState<SavedWorkflow | null>(null)

  const activeTemplate = useMemo(
    () => savedTemplates.find((t) => t.id === activeTemplateId) ?? null,
    [savedTemplates, activeTemplateId]
  )
  const activeNodeMappingPreset = useMemo(
    () =>
      savedNodeMappings.find((m) => m.id === activeNodeMappingPresetId) ?? null,
    [savedNodeMappings, activeNodeMappingPresetId]
  )

  const nextFreeName = (name: string, items: { name: string }[]): string => {
    if (!items.some((x) => x.name === name)) return name
    let n = 2
    while (items.some((x) => x.name === `${name} (${n})`)) n++
    return `${name} (${n})`
  }

  const parsedWorkflow = useMemo(() => {
    if (!workflowJson) return undefined
    try {
      return ComfyWorkflowSchema.safeParse(JSON.parse(workflowJson))
    } catch (error) {
      console.error("Workflow parsing error:", error)
      return undefined
    }
  }, [workflowJson])

  // 워크플로우 로드 시 nodeMappings 자동 감지 (비어있을 때만)
  useEffect(() => {
    if (!parsedWorkflow?.success || nodeMappings.length > 0) return
    const auto = buildAutoMappings(parsedWorkflow.data)
    if (auto.length > 0) setNodeMappings(auto)
  }, [parsedWorkflow, nodeMappings, setNodeMappings])

  const handleAutoMap = () => {
    if (!parsedWorkflow?.success) return
    setNodeMappings(buildAutoMappings(parsedWorkflow.data))
  }

  const availableNodeOptions = useMemo(() => {
    if (!parsedWorkflow?.success) return []
    const inUse = new Set(nodeMappings.map((m) => `${m.nodeId}.${m.inputKey}`))
    const opts: {
      nodeId: string
      title: string
      inputKey: string
      isNumeric: boolean
      isLoadImage: boolean
    }[] = []
    Object.entries(parsedWorkflow.data).forEach(([nodeId, node]) => {
      Object.entries(node.inputs).forEach(([inputKey, value]) => {
        if (
          !inUse.has(`${nodeId}.${inputKey}`) &&
          (typeof value === "string" || typeof value === "number")
        ) {
          opts.push({
            nodeId,
            title: node._meta?.title || node.class_type,
            inputKey,
            isNumeric: typeof value === "number",
            isLoadImage:
              node.class_type === "LoadImage" && inputKey === "image",
          })
        }
      })
    })
    return opts
  }, [parsedWorkflow, nodeMappings])

  const handleImageUpload = async (
    file: File,
    nodeId: string,
    inputKey: string
  ) => {
    const key = `${nodeId}.${inputKey}`
    setImageUploads((prev) => ({
      ...prev,
      [key]: { uploadedName: null, error: null, uploading: true },
    }))
    const workerUrl = workers.find((w) => w.alive)?.url
    if (!workerUrl) {
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: "업로드 가능한 ComfyUI 워커가 없습니다.",
          uploading: false,
        },
      }))
      return
    }
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await fetch(`${workerUrl}/upload/image`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setImageUploads((prev) => ({
        ...prev,
        [key]: { uploadedName: data.name, error: null, uploading: false },
      }))
    } catch (err) {
      setImageUploads((prev) => ({
        ...prev,
        [key]: {
          uploadedName: null,
          error: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`,
          uploading: false,
        },
      }))
    }
  }

  const updateMapping = (id: string, patch: Partial<NodeMapping>) =>
    setNodeMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )

  const loadWorkflowItem = (w: SavedWorkflow) => {
    setWorkflowJson(w.workflow)
    setActiveWorkflowId(w.id)
    setActiveNodeMappingPresetId(null)
    if (!w.mappingPresets || w.mappingPresets.length === 0) {
      setNodeMappings([])
    } else if (w.mappingPresets.length === 1) {
      setNodeMappings(w.mappingPresets[0]!.mappings)
      setActiveNodeMappingPresetId(w.mappingPresets[0]!.id)
    } else {
      setPendingPresetSelection(w)
    }
  }

  const {
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
  } = useJobRunner({
    cegTemplate,
    workflowJson,
    nodeMappings,
    imageUploads,
    backendUrl,
    isAliveBackend,
  })

  const filteredPreview = useMemo(() => {
    const needle = previewFilter.trim().toLowerCase()
    if (!needle) return fakeJobQueue
    return fakeJobQueue.filter(
      (it) =>
        it.filename.toLowerCase().includes(needle) ||
        it.prompt.toLowerCase().includes(needle)
    )
  }, [fakeJobQueue, previewFilter])

  useWatchValues("App", {
    backendAlive,
    jobs,
    workers,
    paused,
    activeTab,
    fakeJobQueue,
    isSheetOpen,
    isGraphOpen,
    isAxisFilterOpen,
    isSelectionOpen,
    isAliveBackend,
    objectInfo,
    previewFilter,
    parserError,
    axisValueFilter,
    templateResetKey,
    workflowResetKey,
    pendingSave,
    cegTemplate,
    workflowJson,
    nodeMappings,
  })

  // 백엔드 헬스 체크
  useEffect(() => {
    let cancelled = false

    const checkHealth = async () => {
      try {
        const response = await fetch(`${backendUrl}/health`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        return data["backend"] === "ok"
      } catch (error) {
        console.error("Error occurred during backend health check:", error)
        return false
      }
    }

    const tick = async () => {
      const ok = await checkHealth()
      if (!cancelled) setIsAliveBackend(ok)
    }

    tick()
    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [backendUrl])

  useEffect(() => {
    if (!isAliveBackend) return
    fetch(`${backendUrl}/object_info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setObjectInfo(data)
      })
      .catch(() => {})
  }, [backendUrl, isAliveBackend])

  const canRun = Boolean(workflowJson) && isAliveBackend && backendAlive

  // 이름 충돌 다이얼로그 핸들러
  const pendingSaveItems =
    pendingSave?.type === "template"
      ? savedTemplates
      : pendingSave?.type === "workflow"
        ? savedWorkflows
        : savedNodeMappings

  const handleNameConflictSaveNew = () => {
    if (!pendingSave) return
    const newName = nextFreeName(pendingSave.name, pendingSaveItems)
    if (pendingSave.type === "template") {
      saveTemplate(newName, cegTemplate)
      setTemplateResetKey((k) => k + 1)
    } else if (pendingSave.type === "workflow") {
      const w = saveWorkflow(newName, workflowJson)
      setActiveWorkflowId(w.id)
      setWorkflowResetKey((k) => k + 1)
    } else {
      if (activeWorkflowId) {
        saveMappingPreset(activeWorkflowId, newName, nodeMappings)
        setNodeMappingResetKey((k) => k + 1)
      }
    }
    setPendingSave(null)
  }

  const handleNameConflictOverwrite = () => {
    if (!pendingSave) return
    if (pendingSave.type === "template") {
      saveTemplate(pendingSave.name, cegTemplate)
      setTemplateResetKey((k) => k + 1)
    } else if (pendingSave.type === "workflow") {
      const w = saveWorkflow(pendingSave.name, workflowJson)
      setActiveWorkflowId(w.id)
      setWorkflowResetKey((k) => k + 1)
    } else {
      if (activeWorkflowId) {
        saveMappingPreset(activeWorkflowId, pendingSave.name, nodeMappings)
        setNodeMappingResetKey((k) => k + 1)
      }
    }
    setPendingSave(null)
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <NavigationMenu>
            <NavigationMenuList>
              {NAV_TABS.map((tab) => (
                <NavigationMenuItem key={tab.id}>
                  <NavigationMenuLink
                    className={activeTab === tab.id ? "font-semibold" : ""}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex items-center gap-1">
            <ServerStatus
              name="백엔드 서버"
              isConnected={isAliveBackend && backendAlive}
              okHint="백엔드와 연결되어 있습니다."
              failHint="백엔드 서버 상태를 확인해주세요."
            />
            <WorkerStatus workers={workers} backendAlive={isAliveBackend} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl p-6">
        {activeTab === "gallery" && (
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">에셋 갤러리</h2>
            <SavedImagesGallery
              backendUrl={backendUrl}
              enableHover={settings.enableHover}
              imagePageSize={settings.imagePageSize}
              imageLazyLoad={settings.imageLazyLoad}
            />
          </section>
        )}
        {activeTab === "curation" && (
          <section className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">조합별 에셋 선택</h2>
            <CombinationPicker
              backendUrl={backendUrl}
              cegTemplate={cegTemplate}
              savedTemplates={savedTemplates}
              enableHover={settings.enableHover}
              autoApplyReject={settings.autoApplyReject}
              savedWorkflows={savedWorkflows}
            />
          </section>
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            settings={settings}
            updateSetting={updateSetting}
            backendUrl={backendUrl}
            onBackendUrlChange={setBackendUrl}
            workers={workers}
          />
        )}
        {activeTab === "jobs" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex min-h-0 flex-col space-y-6">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex h-10 items-stretch overflow-hidden rounded-md border bg-background">
                  <input
                    type="number"
                    className="h-full w-16 bg-transparent px-3 outline-none"
                    min={1}
                    value={repeatCount}
                    onChange={(e) =>
                      setRepeatCount(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                  <div className="flex w-8 flex-col border-l">
                    <Button
                      variant="ghost"
                      className="flex-1"
                      aria-label="Increase"
                      onClick={() => setRepeatCount((c) => c + 1)}
                    >
                      <PlusIcon className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1"
                      aria-label="Decrease"
                      onClick={() => setRepeatCount((c) => Math.max(1, c - 1))}
                    >
                      <MinusIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="default"
                  className="h-10"
                  onClick={handleRun}
                  disabled={!canRun}
                >
                  실행
                  {estimatedRunCount !== null
                    ? ` (${estimatedRunCount}${repeatCount > 1 ? ` × ${repeatCount}` : ""})`
                    : ""}
                </Button>
                <Button
                  variant="secondary"
                  className="h-10"
                  onClick={() => setIsSelectionOpen(true)}
                  disabled={!canRun}
                >
                  선택 실행
                </Button>
                {parserError && (
                  <span className="text-sm text-destructive">{parserError}</span>
                )}
                {Object.keys(axisValueFilter).length > 0 && (
                  <Button
                    variant={hasActiveFilter ? "secondary" : "outline"}
                    className="h-10"
                    onClick={() => setIsAxisFilterOpen(true)}
                  >
                    축 필터
                    {hasActiveFilter ? ` (${estimatedRunCount})` : ""}
                  </Button>
                )}
                {parsedWorkflow?.success && (
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => setIsGraphOpen(true)}
                  >
                    그래프 보기
                  </Button>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-6 shadow-sm">
                <Tabs
                  defaultValue="ceg"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <TabsList>
                      <TabsTrigger value="ceg">CEG 탬플릿</TabsTrigger>
                      <TabsTrigger value="workflow">
                        ComfyUI 워크플로우
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent
                    value="ceg"
                    className="mt-0 flex-1 overflow-y-auto data-[state=active]:block data-[state=inactive]:hidden"
                  >
                    <CegTemplatePanel
                      cegTemplate={cegTemplate}
                      setCegTemplate={setCegTemplate}
                      previewCount={fakeJobQueue.length}
                      onPreviewOpen={() => setIsSheetOpen(true)}
                      templateResetKey={templateResetKey}
                      savedTemplates={savedTemplates}
                      activeTemplateId={activeTemplateId}
                      onSaveTemplate={(name) => {
                        const trimmed = name.trim()
                        if (savedTemplates.some((t) => t.name === trimmed)) {
                          setPendingSave({ name: trimmed, type: "template" })
                          return false
                        }
                        const saved = saveTemplate(trimmed, cegTemplate)
                        setActiveTemplateId(saved.id)
                        return true
                      }}
                      onLoadTemplate={(t) => {
                        setCegTemplate(t.template)
                        setActiveTemplateId(t.id)
                      }}
                      onDeleteTemplate={(id) => {
                        if (activeTemplateId === id) setActiveTemplateId(null)
                        deleteTemplate(id)
                      }}
                      onUpdateTemplate={
                        activeTemplate
                          ? () => saveTemplate(activeTemplate.name, cegTemplate)
                          : undefined
                      }
                    />
                  </TabsContent>

                  <TabsContent
                    value="workflow"
                    className="mt-0 flex-1 space-y-6 overflow-y-auto data-[state=active]:block data-[state=inactive]:hidden"
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel>ComfyUI API 워크플로우</FieldLabel>
                        <SavedItemsManager
                          key={workflowResetKey}
                          items={savedWorkflows}
                          onSave={(name) => {
                            const trimmed = name.trim()
                            if (
                              savedWorkflows.some((w) => w.name === trimmed)
                            ) {
                              setPendingSave({
                                name: trimmed,
                                type: "workflow",
                              })
                              return false
                            }
                            const w = saveWorkflow(trimmed, workflowJson)
                            setActiveWorkflowId(w.id)
                            return true
                          }}
                          onLoad={loadWorkflowItem}
                          onDelete={(id) => {
                            if (activeWorkflowId === id)
                              setActiveWorkflowId(null)
                            deleteWorkflow(id)
                          }}
                          placeholder="워크플로우 이름"
                          saveDisabled={!workflowJson.trim()}
                          activeItemId={activeWorkflowId ?? undefined}
                          onUpdate={() => {
                            if (activeWorkflow)
                              saveWorkflow(activeWorkflow.name, workflowJson)
                          }}
                        />
                        <CodeEditor
                          language="json"
                          placeholder="ComfyUI API 워크플로우 입력 칸"
                          value={workflowJson}
                          onChange={setWorkflowJson}
                          minHeight="100px"
                        />
                      </Field>
                    </FieldGroup>

                    {parsedWorkflow && !parsedWorkflow.success && (
                      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                        workflow 파싱 오류: {parsedWorkflow.error.message}
                      </div>
                    )}

                    {parsedWorkflow?.success && (
                      <NodeMappingSection
                        nodeMappings={nodeMappings}
                        setNodeMappings={setNodeMappings}
                        updateMapping={updateMapping}
                        handleAutoMap={handleAutoMap}
                        handleImageUpload={handleImageUpload}
                        imageUploads={imageUploads}
                        availableNodeOptions={availableNodeOptions}
                        parsedWorkflowData={parsedWorkflow.data}
                        objectInfo={objectInfo}
                        activeWorkflowId={activeWorkflowId}
                        savedNodeMappings={savedNodeMappings}
                        activeNodeMappingPresetId={activeNodeMappingPresetId}
                        nodeMappingResetKey={nodeMappingResetKey}
                        savedWorkflows={savedWorkflows}
                        pendingSaveType={
                          pendingSave?.type === "nodeMapping"
                            ? "nodeMapping"
                            : null
                        }
                        onSaveNodeMapping={(name) => {
                          const trimmed = name.trim()
                          if (
                            savedNodeMappings.some((m) => m.name === trimmed)
                          ) {
                            setPendingSave({
                              name: trimmed,
                              type: "nodeMapping",
                            })
                            return false
                          }
                          if (activeWorkflowId)
                            saveMappingPreset(
                              activeWorkflowId,
                              trimmed,
                              nodeMappings
                            )
                          return true
                        }}
                        onLoadNodeMapping={(m) => {
                          setNodeMappings(m.mappings)
                          setActiveNodeMappingPresetId(m.id)
                        }}
                        onDeleteNodeMapping={(presetId) => {
                          if (activeNodeMappingPresetId === presetId)
                            setActiveNodeMappingPresetId(null)
                          if (activeWorkflowId)
                            deleteMappingPreset(activeWorkflowId, presetId)
                        }}
                        onUpdateNodeMapping={() => {
                          if (activeNodeMappingPreset && activeWorkflowId)
                            saveMappingPreset(
                              activeWorkflowId,
                              activeNodeMappingPreset.name,
                              nodeMappings
                            )
                        }}
                        onPendingNameConflict={(name) =>
                          setPendingSave({ name, type: "nodeMapping" })
                        }
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </section>
            <div className="relative">
              <section className="absolute inset-0 flex flex-col rounded-lg border bg-card p-6 shadow-sm">
                <h2 className="mb-4 shrink-0 text-lg font-semibold">결과</h2>
                <div className="min-h-0 flex-1 pr-2">
                  <JobManagerPanel
                    jobs={jobs}
                    paused={paused}
                    backendUrl={backendUrl}
                    isAliveBackend={isAliveBackend}
                  />
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <ParserPreviewDialog
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        fakeJobQueue={fakeJobQueue}
        previewFilter={previewFilter}
        onPreviewFilterChange={setPreviewFilter}
        filteredPreview={filteredPreview}
        filteredByAxisSet={filteredByAxisSet}
      />

      <AxisFilterSheet
        open={isAxisFilterOpen}
        onOpenChange={setIsAxisFilterOpen}
        axisValueFilter={axisValueFilter}
        setAxisValueFilter={setAxisValueFilter}
        collapsedAxes={collapsedAxes}
        toggleAxisCollapse={toggleAxisCollapse}
        estimatedRunCount={estimatedRunCount}
        fakeJobQueue={fakeJobQueue}
        axisFilteredItems={axisFilteredItems}
        axisExcludedItems={axisExcludedItems}
        uncheckedItems={uncheckedItems}
        toggleItemCheck={toggleItemCheck}
      />

      <SelectionSheet
        open={isSelectionOpen}
        onOpenChange={setIsSelectionOpen}
        fakeJobQueue={fakeJobQueue}
        filteredPreview={filteredPreview}
        previewFilter={previewFilter}
        onPreviewFilterChange={setPreviewFilter}
        uncheckedItems={uncheckedItems}
        selectedCount={selectedCount}
        canRun={canRun}
        checkAllItems={checkAllItems}
        uncheckAllItems={uncheckAllItems}
        toggleItemCheck={toggleItemCheck}
        onRunSelected={async () => {
          const ok = await handleRunSelected()
          if (ok) setIsSelectionOpen(false)
        }}
      />

      {parsedWorkflow?.success && (
        <WorkflowGraphViewer
          workflow={parsedWorkflow.data}
          isOpen={isGraphOpen}
          onClose={() => setIsGraphOpen(false)}
          backendUrl={backendUrl}
        />
      )}

      <NameConflictDialog
        pendingSave={pendingSave}
        onClose={() => setPendingSave(null)}
        newName={nextFreeName(
          pendingSave?.name ?? "",
          pendingSaveItems
        )}
        onSaveNew={handleNameConflictSaveNew}
        onOverwrite={handleNameConflictOverwrite}
      />

      <PresetSelectionDialog
        pendingWorkflow={pendingPresetSelection}
        onClose={() => setPendingPresetSelection(null)}
        onSelectPreset={(mappings, presetId) => {
          setNodeMappings(mappings)
          setActiveNodeMappingPresetId(presetId)
          setPendingPresetSelection(null)
        }}
        onStartWithoutMapping={() => {
          setNodeMappings([])
          setActiveNodeMappingPresetId(null)
          setPendingPresetSelection(null)
        }}
      />
    </div>
  )
}

export default App
