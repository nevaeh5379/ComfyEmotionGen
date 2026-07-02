/**
 * React Graph Store (Zustand)
 * 리액트 기반 노드 에디터의 코어 상태와 액션을 관리하는 스토어
 * Single source of truth - 모든 그래프 변경은 이 store를 경유합니다.
 */

import { create } from "zustand"
import type {
  ComfyWorkflowJSON,
  ComfyWorkflowNode,
  ComfyWorkflowLink,
  ComfyNodeInput,
  ComfyNodeOutput,
  ComfyWorkflowGroup,
} from "../types/workflow"
import type { ComfyNodeDef } from "../types/nodeDef"
import type { WidgetValue } from "./widgetStore"
import { useNodeDefStore } from "./nodeDefStore"
import { widgetStore } from "./widgetStore"
import { createSubgraphModel } from "../subgraph/SubgraphModel"
import type { SubgraphModelRuntime } from "../subgraph/SubgraphModel"
import type { SubgraphDefinition, GraphId } from "../types/subgraph"
import type { SubgraphId } from "../constants"
import {
  SUBGRAPH_INPUT_ID,
  SUBGRAPH_OUTPUT_ID,
  createSubgraphId,
} from "../constants"
import {
  getBoundaryLinks,
  mapSubgraphInputsAndLinks,
  mapSubgraphOutputsAndLinks,
  createBounds,
} from "../subgraph/subgraphUtils"
import {
  isRootGraphId,
  isValidSlotConnection,
  normalizeWorkflowForEditor,
} from "../utils/workflowGraphModel"

interface SnapshotEntry {
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  groups: ComfyWorkflowGroup[]
  subgraphs: readonly (readonly [SubgraphId, SubgraphDefinition])[]
  activeGraphId: GraphId
  navigationStack: SubgraphId[]
}

interface ReactGraphState {
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  zoom: number
  pan: [number, number]
  selectedNodeIds: Set<number>

  // Subgraph state
  /** 블루프린트 레지스트리 (루트 그래프 소유) */
  subgraphs: Map<SubgraphId, SubgraphModelRuntime>
  /** 현재 편집 중인 그래프 ID (null=루트, UUID=서브그래프) */
  activeGraphId: GraphId
  /** 브레드크럼: 루트부터 현재까지의 subgraph ID 경로 */
  navigationStack: SubgraphId[]
  /** 그래프별 뷰포트(pan/zoom) 캐시 - 진입/이탈 시 복원 */
  viewportCache: Map<string, { pan: [number, number]; zoom: number }>

  // Execution State
  executionStatus: "idle" | "running" | "success" | "error" | "interrupted"
  executingPromptId: string | null
  executingNodeId: number | null
  executedNodeIds: Set<number>
  overallProgress: { value: number; max: number } | null

  undoStack: SnapshotEntry[]
  redoStack: SnapshotEntry[]

  setGraph: (workflow: ComfyWorkflowJSON) => void
  addNode: (
    type: string,
    pos: [number, number],
    def: ComfyNodeDef | undefined
  ) => void
  removeNode: (id: number) => void
  removeNodes: (ids: number[]) => void
  updateNodePos: (id: number, pos: [number, number]) => void
  updateNodeSize: (id: number, size: [number, number]) => void
  connect: (
    originNodeId: number,
    originSlotIdx: number,
    targetNodeId: number,
    targetSlotIdx: number,
    type: string
  ) => void
  disconnect: (linkId: number) => void
  updateWidgetValue: (
    nodeId: number,
    widgetName: string,
    value: WidgetValue
  ) => void
  changeNodeMode: (nodeId: number, mode: number) => void
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  selectNode: (id: number, accumulate?: boolean) => void
  deselectAll: () => void
  clearGraph: () => void
  takeSnapshot: () => void
  undo: () => void
  redo: () => void

  // Subgraph actions
  convertToSubgraph: (
    selectedNodeIds: number[]
  ) => { subgraphId: SubgraphId; nodeId: number } | null
  unpackSubgraph: (subgraphNodeId: number) => void
  enterSubgraph: (subgraphId: SubgraphId) => void
  exitSubgraph: () => void
  /** 현재 활성 그래프에 속한 노드만 반환 */
  getActiveNodes: () => ComfyWorkflowNode[]
  /** 현재 활성 그래프에 속한 링크만 반환 */
  getActiveLinks: () => ComfyWorkflowLink[]

  // Group state & actions
  groups: ComfyWorkflowGroup[]
  addGroup: (
    title: string,
    bounding: [number, number, number, number],
    color?: string
  ) => void
  removeGroup: (id: number) => void
  updateGroupBounding: (
    id: number,
    bounding: [number, number, number, number]
  ) => void
  updateGroupTitle: (id: number, title: string) => void
  updateGroupColor: (id: number, color: string) => void
  toggleGroupLock: (id: number) => void
  /** 현재 활성 그래프에 속한 그룹만 반환 */
  getActiveGroups: () => ComfyWorkflowGroup[]
}

export const useReactGraphStore = create<ReactGraphState>(
  (set, get): ReactGraphState => ({
    nodes: [],
    links: [],
    groups: [],
    zoom: 1.0,
    pan: [0, 0],
    selectedNodeIds: new Set<number>(),

    // Initial Subgraph state
    subgraphs: new Map<SubgraphId, SubgraphModelRuntime>(),
    activeGraphId: null,
    navigationStack: [],
    viewportCache: new Map<string, { pan: [number, number]; zoom: number }>(),

    // Initial Execution State
    executionStatus: "idle",
    executingPromptId: null,
    executingNodeId: null,
    executedNodeIds: new Set<number>(),
    overallProgress: null,

    undoStack: [],
    redoStack: [],

    setGraph: (workflow: ComfyWorkflowJSON): void => {
      const normalized = normalizeWorkflowForEditor(workflow)

      // 동일 체크 (전체 머지된 상태 기준)
      const currentNodes = get().nodes
      const currentLinks = get().links
      const currentGroups = get().groups
      const nodesEqual =
        JSON.stringify(currentNodes) === JSON.stringify(normalized.nodes)
      const linksEqual =
        JSON.stringify(currentLinks) === JSON.stringify(normalized.links)
      const groupsEqual =
        JSON.stringify(currentGroups) === JSON.stringify(normalized.groups)
      if (nodesEqual && linksEqual && groupsEqual) return

      set({
        nodes: normalized.nodes,
        links: normalized.links,
        groups: normalized.groups,
        selectedNodeIds: new Set<number>(),
        subgraphs: normalized.subgraphs,
        activeGraphId: null,
        navigationStack: [],
      })
    },

    addNode: (
      type: string,
      pos: [number, number],
      def: ComfyNodeDef | undefined
    ): void => {
      if (def === undefined) {
        throw new Error(
          `[reactGraphStore] addNode failed: no node definition found for "${type}". inputs/outputs/widgets cannot be constructed.`
        )
      }
      get().takeSnapshot()
      const { nodes } = get()
      const maxId = nodes.reduce(
        (max: number, n: ComfyWorkflowNode): number => Math.max(max, n.id),
        0
      )
      const newId = maxId + 1

      const inputs: ComfyNodeInput[] = []
      const outputs: ComfyNodeOutput[] = []
      const widgetsValues: WidgetValue[] = []
      const widgetNames: string[] = []

      {
        const req = def.input?.required ?? {}
        const opt = def.input?.optional ?? {}

        const allInputs = { ...req, ...opt }

        for (const [name, spec] of Object.entries(allInputs)) {
          const typeSpec = spec[0]
          const isWidget = widgetStore.isWidgetType(typeSpec)

          let defaultVal: WidgetValue = ""
          if (Array.isArray(typeSpec)) {
            defaultVal = typeSpec[0] ?? ""
          } else if (spec[1]) {
            const rawDefault = spec[1].default
            if (
              typeof rawDefault === "string" ||
              typeof rawDefault === "number" ||
              typeof rawDefault === "boolean"
            ) {
              defaultVal = rawDefault
            }
          } else if (typeSpec === "INT" || typeSpec === "FLOAT") {
            defaultVal = 0
          } else if (typeSpec === "BOOLEAN") {
            defaultVal = false
          }

          if (isWidget) {
            widgetNames.push(name)
            widgetsValues.push(defaultVal)

            inputs.push({
              name,
              type: String(typeSpec),
              widget: { name, config: spec[1] ?? {} },
            })
          } else {
            inputs.push({
              name,
              type: Array.isArray(typeSpec) ? "COMBO" : typeSpec,
            })
          }
        }

        for (let i = 0; i < def.output.length; i++) {
          outputs.push({
            name: def.output_name[i] ?? def.output[i] ?? `out_${String(i)}`,
            type: def.output[i] ?? "*",
          })
        }
      }

      const newNode: ComfyWorkflowNode = {
        id: newId,
        type,
        pos,
        size: [
          240,
          28 +
            Math.max(inputs.length, outputs.length) * 20 +
            widgetNames.length * 40 +
            8,
        ],
        inputs: inputs.length > 0 ? inputs : undefined,
        outputs: outputs.length > 0 ? outputs : undefined,
        widgets_values: widgetsValues.length > 0 ? widgetsValues : undefined,
        properties:
          widgetNames.length > 0 ? { widget_names: widgetNames } : undefined,
        // 활성 그래프에 소속시킴 (루트면 null, 서브그래프면 해당 UUID)
        graphId: get().activeGraphId,
      }

      set({ nodes: [...nodes, newNode] })

      // 백그라운드 LiteGraph 노드 생성 → extension hook 실행
      // appService.createNode에 위임하여:
      //  - 노드 타입이 LiteGraph에 등록되어 있지 않으면 동적으로 등록
      //  - beforeRegisterNodeDef 확장이 패치한 onNodeCreated(prototype)가 호출되도록 보장
      //  - extension의 nodeCreated 훅 실행
      //  - store가 할당한 id를 LiteGraph 노드 id로 직접 전달 (사후 덮어쓰기 방지)
      try {
        const w = window as unknown as Record<string, unknown>
        const appService = w.__comfyAppService as
          | {
              createNode?: (
                type: string,
                pos?: [number, number],
                options?: { id?: number }
              ) => unknown
            }
          | undefined
        if (typeof appService?.createNode === "function") {
          console.log(
            `[CEG] addNode: creating hidden graph node for "${type}" id=${String(newId)} via appService.createNode`
          )
          const liveNode = appService.createNode(type, pos, { id: newId })
          if (liveNode !== null && liveNode !== undefined) {
            const ln = liveNode as {
              id?: number | string
              onNodeCreated?: () => void
              widgets?: {
                name: string
                value: WidgetValue
                element?: HTMLElement | null
              }[]
            }
            console.log(
              `[CEG] addNode: has onNodeCreated=${typeof ln.onNodeCreated}`
            )
            const lnWidgets = ln.widgets
            console.log(
              `[CEG] addNode: hidden node created, id=${String(newId)} widgets=${String(lnWidgets?.length ?? 0)}`
            )
            if (lnWidgets && lnWidgets.length > 0) {
              for (const w2 of lnWidgets) {
                console.log(
                  `[CEG] addNode: widget name="${w2.name}" hasElement=${String(w2.element !== null && w2.element !== undefined)}`
                )
              }
              const allNames = [...widgetNames]
              const allValues = [...widgetsValues]
              for (const w2 of lnWidgets) {
                if (!allNames.includes(w2.name)) {
                  allNames.push(w2.name)
                  allValues.push(w2.value)
                }
              }
              if (allNames.length !== widgetNames.length) {
                console.log(
                  `[CEG] addNode: merged ${String(allNames.length - widgetNames.length)} extension widgets into store`
                )
                set({
                  nodes: get().nodes.map(
                    (n: ComfyWorkflowNode): ComfyWorkflowNode =>
                      n.id === newId
                        ? {
                            ...n,
                            widgets_values: allValues,
                            properties: {
                              ...n.properties,
                              widget_names: allNames,
                            },
                          }
                        : n
                  ),
                })
              }
            } else {
              console.log(`[CEG] addNode: no widgets on live node`)
            }
          }
        } else {
          console.log(
            `[CEG] addNode: no appService.createNode available, skipping hidden graph sync`
          )
        }
      } catch (err) {
        console.warn(`[CEG] addNode: hidden graph sync failed:`, err)
      }
    },

    removeNodes: (ids: number[]): void => {
      if (ids.length === 0) return
      get().takeSnapshot()

      const { nodes, links, selectedNodeIds } = get()
      const idSet = new Set(ids)

      const filteredNodes = nodes.filter(
        (n: ComfyWorkflowNode): boolean => !idSet.has(n.id)
      )
      const filteredLinks = links.filter(
        (l: ComfyWorkflowLink): boolean =>
          !idSet.has(l.origin_id) && !idSet.has(l.target_id)
      )

      const nextSelected = new Set(selectedNodeIds)
      ids.forEach((id: number): void => {
        nextSelected.delete(id)
      })

      const cleanedNodes = filteredNodes.map(
        (node: ComfyWorkflowNode): ComfyWorkflowNode => {
          const nextInputs = node.inputs?.map(
            (input: ComfyNodeInput): ComfyNodeInput => {
              if (
                input.link !== undefined &&
                filteredLinks.every(
                  (l: ComfyWorkflowLink): boolean => l.id !== input.link
                )
              ) {
                return { ...input, link: undefined }
              }
              return input
            }
          )

          const nextOutputs = node.outputs?.map(
            (output: ComfyNodeOutput): ComfyNodeOutput => {
              if (output.links !== undefined) {
                const validLinks = output.links.filter(
                  (linkId: number): boolean =>
                    filteredLinks.some(
                      (l: ComfyWorkflowLink): boolean => l.id === linkId
                    )
                )
                if (validLinks.length !== output.links.length) {
                  return {
                    ...output,
                    links: validLinks.length > 0 ? validLinks : undefined,
                  }
                }
              }
              return output
            }
          )

          return {
            ...node,
            inputs: nextInputs,
            outputs: nextOutputs,
          }
        }
      )

      set({
        nodes: cleanedNodes,
        links: filteredLinks,
        selectedNodeIds: nextSelected,
      })
    },

    removeNode: (id: number): void => {
      get().removeNodes([id])
    },

    updateNodePos: (id: number, pos: [number, number]): void => {
      const { nodes } = get()
      set({
        nodes: nodes.map(
          (n: ComfyWorkflowNode): ComfyWorkflowNode =>
            n.id === id ? { ...n, pos } : n
        ),
      })
    },

    updateNodeSize: (id: number, size: [number, number]): void => {
      const { nodes } = get()
      set({
        nodes: nodes.map(
          (n: ComfyWorkflowNode): ComfyWorkflowNode =>
            n.id === id ? { ...n, size } : n
        ),
      })
    },

    connect: (
      originNodeId: number,
      originSlotIdx: number,
      targetNodeId: number,
      targetSlotIdx: number,
      type: string
    ): void => {
      const { nodes } = get()

      const originNode = nodes.find(
        (n: ComfyWorkflowNode): boolean => n.id === originNodeId
      )
      const targetNode = nodes.find(
        (n: ComfyWorkflowNode): boolean => n.id === targetNodeId
      )

      if (originNode === undefined || targetNode === undefined) return

      const originOutput = originNode.outputs?.[originSlotIdx]
      const targetInput = targetNode.inputs?.[targetSlotIdx]

      if (originOutput === undefined || targetInput === undefined) return

      if (!isValidSlotConnection(originOutput.type, targetInput.type)) {
        console.warn(
          `Incompatible connection: Output type "${originOutput.type}" cannot be connected to Input type "${targetInput.type}"`
        )
        return
      }

      get().takeSnapshot()
      const { links: currentLinks, nodes: currentNodes } = get()

      let nextLinks = currentLinks.filter(
        (l: ComfyWorkflowLink): boolean =>
          !(l.target_id === targetNodeId && l.target_slot === targetSlotIdx)
      )

      const maxLinkId = nextLinks.reduce(
        (max: number, l: ComfyWorkflowLink): number => Math.max(max, l.id),
        0
      )
      const newLinkId = maxLinkId + 1

      const newLink: ComfyWorkflowLink = {
        id: newLinkId,
        origin_id: originNodeId,
        origin_slot: originSlotIdx,
        target_id: targetNodeId,
        target_slot: targetSlotIdx,
        type,
      }

      nextLinks = [...nextLinks, newLink]

      const nextNodes = currentNodes.map(
        (node: ComfyWorkflowNode): ComfyWorkflowNode => {
          if (node.id === targetNodeId && node.inputs) {
            const nextInputs = [...node.inputs]
            const targetInputSlot = nextInputs[targetSlotIdx]
            if (targetInputSlot !== undefined) {
              nextInputs[targetSlotIdx] = {
                ...targetInputSlot,
                link: newLinkId,
              }
            }
            return { ...node, inputs: nextInputs }
          }

          if (node.id === originNodeId && node.outputs) {
            const nextOutputs = [...node.outputs]
            const originOutputSlot = nextOutputs[originSlotIdx]
            if (originOutputSlot !== undefined) {
              const linksArr = originOutputSlot.links ?? []
              nextOutputs[originSlotIdx] = {
                ...originOutputSlot,
                links: [...linksArr, newLinkId],
              }
            }
            return { ...node, outputs: nextOutputs }
          }

          return node
        }
      )

      set({ nodes: nextNodes, links: nextLinks })
    },

    disconnect: (linkId: number): void => {
      get().takeSnapshot()

      const { nodes, links } = get()
      const nextLinks = links.filter(
        (l: ComfyWorkflowLink): boolean => l.id !== linkId
      )

      const nextNodes = nodes.map(
        (node: ComfyWorkflowNode): ComfyWorkflowNode => {
          const nextInputs = node.inputs?.map(
            (input: ComfyNodeInput): ComfyNodeInput => {
              if (input.link === linkId) {
                return { ...input, link: undefined }
              }
              return input
            }
          )

          const nextOutputs = node.outputs?.map(
            (output: ComfyNodeOutput): ComfyNodeOutput => {
              if (output.links?.includes(linkId) === true) {
                const valid = output.links.filter(
                  (id: number): boolean => id !== linkId
                )
                return {
                  ...output,
                  links: valid.length > 0 ? valid : undefined,
                }
              }
              return output
            }
          )

          return {
            ...node,
            inputs: nextInputs,
            outputs: nextOutputs,
          }
        }
      )

      set({ nodes: nextNodes, links: nextLinks })
    },

    updateWidgetValue: (
      nodeId: number,
      widgetName: string,
      value: WidgetValue
    ): void => {
      get().takeSnapshot()

      const { nodes } = get()
      set({
        nodes: nodes.map((node: ComfyWorkflowNode): ComfyWorkflowNode => {
          if (node.id !== nodeId) return node

          const widgetNames = (node.properties?.widget_names ?? []) as string[]

          if (widgetNames.length === 0) {
            const def = useNodeDefStore.getState().getNodeDef(node.type)
            if (def !== undefined) {
              const req = def.input?.required ?? {}
              const opt = def.input?.optional ?? {}
              for (const [name, spec] of Object.entries({ ...req, ...opt })) {
                const typeSpec = spec[0]
                const isWidget = widgetStore.isWidgetType(typeSpec)
                if (isWidget) widgetNames.push(name)
              }
            }
          }

          const idx = widgetNames.indexOf(widgetName)
          if (idx === -1) return node

          const defaultValues: WidgetValue[] = new Array<WidgetValue>(
            widgetNames.length
          ).fill("")
          const nextValues = [...(node.widgets_values ?? defaultValues)]
          while (nextValues.length < widgetNames.length) nextValues.push("")
          nextValues[idx] = value

          return {
            ...node,
            widgets_values: nextValues,
            properties: {
              ...(node.properties ?? {}),
              widget_names: widgetNames,
            },
          }
        }),
      })
    },

    changeNodeMode: (nodeId: number, mode: number): void => {
      get().takeSnapshot()
      const { nodes } = get()
      set({
        nodes: nodes.map(
          (node: ComfyWorkflowNode): ComfyWorkflowNode =>
            node.id === nodeId ? { ...node, mode } : node
        ),
      })
    },

    setZoom: (zoom: number): void => {
      set({ zoom: Math.max(0.1, Math.min(zoom, 3.0)) })
    },
    setPan: (pan: [number, number]): void => {
      set({ pan })
    },

    selectNode: (id: number, accumulate?: boolean): void => {
      set((state: ReactGraphState): Partial<ReactGraphState> => {
        const nextSelected =
          accumulate === true
            ? new Set(state.selectedNodeIds)
            : new Set<number>()
        if (nextSelected.has(id) && accumulate === true) {
          nextSelected.delete(id)
        } else {
          nextSelected.add(id)
        }
        return { selectedNodeIds: nextSelected }
      })
    },

    deselectAll: (): void => {
      set({ selectedNodeIds: new Set<number>() })
    },

    clearGraph: (): void => {
      get().takeSnapshot()
      set({
        nodes: [],
        links: [],
        groups: [],
        selectedNodeIds: new Set<number>(),
        zoom: 1.0,
        pan: [0, 0],
        subgraphs: new Map<SubgraphId, SubgraphModelRuntime>(),
        activeGraphId: null,
        navigationStack: [],
      })
    },

    takeSnapshot: (): void => {
      const {
        nodes,
        links,
        groups,
        subgraphs,
        activeGraphId,
        navigationStack,
        undoStack,
      } = get()
      const nextUndo = [
        ...undoStack,
        {
          nodes: JSON.parse(JSON.stringify(nodes)) as ComfyWorkflowNode[],
          links: JSON.parse(JSON.stringify(links)) as ComfyWorkflowLink[],
          groups: JSON.parse(JSON.stringify(groups)) as ComfyWorkflowGroup[],
          subgraphs: Array.from(subgraphs.entries()).map(
            ([id, m]) =>
              [id, m.asSerialisable([], [])] as readonly [
                SubgraphId,
                SubgraphDefinition,
              ]
          ),
          activeGraphId,
          navigationStack: [...navigationStack],
        },
      ].slice(-50)

      set({
        undoStack: nextUndo,
        redoStack: [],
      })
    },

    undo: (): void => {
      const {
        nodes,
        links,
        groups,
        subgraphs,
        activeGraphId,
        navigationStack,
        undoStack,
        redoStack,
      } = get()
      if (undoStack.length === 0) return

      const previous = undoStack[undoStack.length - 1]
      if (previous === undefined) return
      const nextUndo = undoStack.slice(0, -1)
      const nextRedo = [
        {
          nodes: JSON.parse(JSON.stringify(nodes)) as ComfyWorkflowNode[],
          links: JSON.parse(JSON.stringify(links)) as ComfyWorkflowLink[],
          groups: JSON.parse(JSON.stringify(groups)) as ComfyWorkflowGroup[],
          subgraphs: Array.from(subgraphs.entries()).map(
            ([id, m]) =>
              [id, m.asSerialisable([], [])] as readonly [
                SubgraphId,
                SubgraphDefinition,
              ]
          ),
          activeGraphId,
          navigationStack: [...navigationStack],
        },
        ...redoStack,
      ].slice(0, 50)

      const restoredSubgraphs = new Map<SubgraphId, SubgraphModelRuntime>()
      for (const [id, def] of previous.subgraphs) {
        restoredSubgraphs.set(id, createSubgraphModel(def))
      }

      set({
        nodes: previous.nodes,
        links: previous.links,
        groups: previous.groups,
        subgraphs: restoredSubgraphs,
        activeGraphId: previous.activeGraphId,
        navigationStack: [...previous.navigationStack],
        undoStack: nextUndo,
        redoStack: nextRedo,
      })
    },

    redo: (): void => {
      const {
        nodes,
        links,
        groups,
        subgraphs,
        activeGraphId,
        navigationStack,
        undoStack,
        redoStack,
      } = get()
      if (redoStack.length === 0) return

      const next = redoStack[0]
      if (next === undefined) return
      const nextRedo = redoStack.slice(1)
      const nextUndo = [
        ...undoStack,
        {
          nodes: JSON.parse(JSON.stringify(nodes)) as ComfyWorkflowNode[],
          links: JSON.parse(JSON.stringify(links)) as ComfyWorkflowLink[],
          groups: JSON.parse(JSON.stringify(groups)) as ComfyWorkflowGroup[],
          subgraphs: Array.from(subgraphs.entries()).map(
            ([id, m]) =>
              [id, m.asSerialisable([], [])] as readonly [
                SubgraphId,
                SubgraphDefinition,
              ]
          ),
          activeGraphId,
          navigationStack: [...navigationStack],
        },
      ].slice(-50)

      const restoredSubgraphs = new Map<SubgraphId, SubgraphModelRuntime>()
      for (const [id, def] of next.subgraphs) {
        restoredSubgraphs.set(id, createSubgraphModel(def))
      }

      set({
        nodes: next.nodes,
        links: next.links,
        groups: next.groups,
        subgraphs: restoredSubgraphs,
        activeGraphId: next.activeGraphId,
        navigationStack: [...next.navigationStack],
        undoStack: nextUndo,
        redoStack: nextRedo,
      })
    },

    // ── Subgraph actions ──────────────────────────────────────────────

    convertToSubgraph: (
      selectedIds: number[]
    ): { subgraphId: SubgraphId; nodeId: number } | null => {
      if (selectedIds.length === 0) return null
      get().takeSnapshot()

      const { nodes, links } = get()
      const idSet = new Set(selectedIds)
      const selectedNodes = nodes.filter((n) => idSet.has(n.id))
      if (selectedNodes.length === 0) return null

      // 1. 경계 링크 분할
      const boundary = getBoundaryLinks(nodes, links, idSet)

      // 2. 경계 링크를 IO 노드 엔드포인트로 재작성 + 슬롯 생성
      const { rewrittenLinks: rewrittenInputLinks, inputs: inputDtos } =
        mapSubgraphInputsAndLinks(boundary.boundaryInputLinks)
      const { rewrittenLinks: rewrittenOutputLinks, outputs: outputDtos } =
        mapSubgraphOutputsAndLinks(boundary.boundaryOutputLinks)

      // 3. bounding 계산
      const bounds = createBounds(selectedNodes)

      // 4. SubgraphDefinition 구성
      const subgraphId = createSubgraphId()
      const internalNodes = selectedNodes.map((n) => ({
        ...n,
        graphId: subgraphId,
      }))
      const internalLinks = [
        ...boundary.internalLinks.map((l) => ({ ...l })),
        ...rewrittenInputLinks.map((l) => ({ ...l })),
        ...rewrittenOutputLinks.map((l) => ({ ...l })),
      ]
      // IO 노드 bounding (좌/우 고정)
      const ioWidth = 120
      const ioHeight = 200
      const def: SubgraphDefinition = {
        id: subgraphId,
        name: "New Subgraph",
        inputNode: {
          id: SUBGRAPH_INPUT_ID,
          bounding: [bounds[0] - ioWidth - 20, bounds[1], ioWidth, ioHeight],
        },
        outputNode: {
          id: SUBGRAPH_OUTPUT_ID,
          bounding: [bounds[2] + 20, bounds[1], ioWidth, ioHeight],
        },
        inputs: inputDtos,
        outputs: outputDtos,
        nodes: internalNodes,
        links: internalLinks,
      }

      // 5. SubgraphModelRuntime 생성 & 등록
      const model = createSubgraphModel(def)
      const nextSubgraphs = new Map(get().subgraphs)
      nextSubgraphs.set(subgraphId, model)

      // 6. 루트 그래프에서 선택 노드와 경계 링크 제거, SubgraphNode 인스턴스 추가
      const removedLinkIds = new Set<number>([
        ...boundary.boundaryInputLinks.map((l) => l.id),
        ...boundary.boundaryOutputLinks.map((l) => l.id),
        ...boundary.internalLinks.map((l) => l.id),
      ])
      const remainingNodes = nodes.filter((n) => !idSet.has(n.id))
      // 기존 노드의 inputs/outputs에서 제거된 링크 정리
      const cleanedRemainingNodes = remainingNodes.map((node) => {
        const nextInputs = node.inputs?.map((input) =>
          input.link !== undefined && removedLinkIds.has(input.link)
            ? { ...input, link: undefined }
            : input
        )
        const nextOutputs = node.outputs?.map((output) => {
          if (output.links) {
            const valid = output.links.filter((lid) => !removedLinkIds.has(lid))
            if (valid.length !== output.links.length) {
              return { ...output, links: valid.length > 0 ? valid : undefined }
            }
          }
          return output
        })
        return { ...node, inputs: nextInputs, outputs: nextOutputs }
      })

      // SubgraphNode 인스턴스 노드 생성
      const maxNodeId = cleanedRemainingNodes.reduce(
        (max, n) => Math.max(max, n.id),
        0
      )
      const newNodeId = maxNodeId + 1
      const subgraphNodeInstance: ComfyWorkflowNode = {
        id: newNodeId,
        type: subgraphId,
        pos: [
          (bounds[0] + bounds[2]) / 2 - 120,
          (bounds[1] + bounds[3]) / 2 - 30,
        ],
        size: [240, 60 + inputDtos.length * 20 + outputDtos.length * 20],
        inputs: inputDtos.map((dto) => ({
          name: dto.name,
          type: dto.type,
          link: undefined,
        })),
        outputs: outputDtos.map((dto) => ({
          name: dto.name,
          type: dto.type,
          links: undefined,
        })),
        graphId: null,
      }

      // 7. 상태 갱신
      set({
        nodes: [...cleanedRemainingNodes, subgraphNodeInstance],
        links: links.filter((l) => !removedLinkIds.has(l.id)),
        subgraphs: nextSubgraphs,
        selectedNodeIds: new Set<number>([newNodeId]),
      })

      return { subgraphId, nodeId: newNodeId }
    },

    unpackSubgraph: (subgraphNodeId: number): void => {
      const { nodes, subgraphs } = get()
      const subgraphNode = nodes.find((n) => n.id === subgraphNodeId)
      if (!subgraphNode) return
      const subgraphId = subgraphNode.type
      const model = subgraphs.get(subgraphId)
      if (!model) return

      get().takeSnapshot()

      // 내부 노드/링크를 루트로 꺼내기 (graphId = null)
      // 실제 구현은 Phase 4에서 보강 - 여기서는 기본 골격만
      const innerNodes = nodes
        .filter((n) => n.graphId === subgraphId)
        .map((n) => ({ ...n, graphId: null }))
      const remainingNodes = nodes.filter(
        (n) => n.id !== subgraphNodeId && n.graphId !== subgraphId
      )
      const nextSubgraphs = new Map(subgraphs)
      nextSubgraphs.delete(subgraphId)

      set({
        nodes: [...remainingNodes, ...innerNodes],
        subgraphs: nextSubgraphs,
        selectedNodeIds: new Set<number>(),
      })
    },

    enterSubgraph: (subgraphId: SubgraphId): void => {
      const {
        subgraphs,
        activeGraphId,
        navigationStack,
        pan,
        zoom,
        viewportCache,
      } = get()
      if (!subgraphs.has(subgraphId)) return

      // 현재 뷰포트 캐시에 저장
      const cacheKey = activeGraphId ?? "__root__"
      const nextViewportCache = new Map(viewportCache)
      nextViewportCache.set(cacheKey, {
        pan: [...pan] as [number, number],
        zoom,
      })

      const nextStack =
        activeGraphId !== null
          ? [...navigationStack, activeGraphId]
          : [...navigationStack]
      set({
        activeGraphId: subgraphId,
        navigationStack: nextStack,
        viewportCache: nextViewportCache,
        selectedNodeIds: new Set<number>(),
        pan: [0, 0],
        zoom: 1.0,
      })
    },

    exitSubgraph: (): void => {
      const { navigationStack, pan, zoom, activeGraphId, viewportCache } = get()
      if (navigationStack.length === 0) {
        set({ activeGraphId: null, navigationStack: [] })
        return
      }

      // 현재 뷰포트 캐시에 저장
      const cacheKey = activeGraphId ?? "__root__"
      const nextViewportCache = new Map(viewportCache)
      nextViewportCache.set(cacheKey, {
        pan: [...pan] as [number, number],
        zoom,
      })

      const prevId: GraphId =
        navigationStack[navigationStack.length - 1] ?? null
      const nextStack = navigationStack.slice(0, -1)
      const restored = nextViewportCache.get(prevId ?? "__root__")

      set({
        activeGraphId: prevId,
        navigationStack: nextStack,
        viewportCache: nextViewportCache,
        selectedNodeIds: new Set<number>(),
        pan: restored ? restored.pan : [0, 0],
        zoom: restored ? restored.zoom : 1.0,
      })
    },

    getActiveNodes: (): ComfyWorkflowNode[] => {
      const { nodes, activeGraphId } = get()
      if (activeGraphId === null) {
        // 루트: graphId가 null 또는 undefined인 노드
        return nodes.filter((n) => isRootGraphId(n.graphId))
      }
      // 서브그래프: graphId가 해당 subgraphId인 노드
      return nodes.filter((n) => n.graphId === activeGraphId)
    },

    getActiveLinks: (): ComfyWorkflowLink[] => {
      const { links, activeGraphId } = get()
      if (activeGraphId === null) {
        // 루트: 양 끝점이 모두 루트 노드이거나 SubgraphNode 인스턴스인 링크
        // IO 노드(-10/-20)가 origin/target인 링크는 서브그래프 내부 링크이므로 제외
        return links.filter(
          (l) =>
            l.origin_id !== SUBGRAPH_INPUT_ID &&
            l.target_id !== SUBGRAPH_OUTPUT_ID
        )
      }
      // 서브그래프 내부 링크:
      // (a) 양 끝점이 해당 서브그래프 내부 노드, 또는
      // (b) origin이 SubgraphInputNode(-10), 또는
      // (c) target이 SubgraphOutputNode(-20)
      return links.filter((l) => {
        const originIsIo = l.origin_id === SUBGRAPH_INPUT_ID
        const targetIsIo = l.target_id === SUBGRAPH_OUTPUT_ID
        if (originIsIo || targetIsIo) return true
        // 일반 내부 링크: 양 끝점이 같은 서브그래프 소속
        const originNode = get().nodes.find((n) => n.id === l.origin_id)
        const targetNode = get().nodes.find((n) => n.id === l.target_id)
        return (
          originNode?.graphId === activeGraphId &&
          targetNode?.graphId === activeGraphId
        )
      })
    },

    addGroup: (
      title: string,
      bounding: [number, number, number, number],
      color?: string
    ): void => {
      get().takeSnapshot()
      const { groups, activeGraphId } = get()
      const maxId = groups.reduce((max, g) => Math.max(max, g.id), 0)
      const newId = maxId + 1
      const newGroup: ComfyWorkflowGroup = {
        id: newId,
        title,
        bounding,
        color: color ?? "#335",
        graphId: activeGraphId,
      }
      set({ groups: [...groups, newGroup] })
    },

    removeGroup: (id: number): void => {
      get().takeSnapshot()
      const { groups } = get()
      set({ groups: groups.filter((g) => g.id !== id) })
    },

    updateGroupBounding: (
      id: number,
      bounding: [number, number, number, number]
    ): void => {
      const { groups } = get()
      set({
        groups: groups.map((g) => (g.id === id ? { ...g, bounding } : g)),
      })
    },

    updateGroupTitle: (id: number, title: string): void => {
      get().takeSnapshot()
      const { groups } = get()
      set({
        groups: groups.map((g) => (g.id === id ? { ...g, title } : g)),
      })
    },

    updateGroupColor: (id: number, color: string): void => {
      get().takeSnapshot()
      const { groups } = get()
      set({
        groups: groups.map((g) => (g.id === id ? { ...g, color } : g)),
      })
    },

    toggleGroupLock: (id: number): void => {
      get().takeSnapshot()
      const { groups } = get()
      set({
        groups: groups.map((g) =>
          g.id === id ? { ...g, locked: !g.locked } : g
        ),
      })
    },

    getActiveGroups: (): ComfyWorkflowGroup[] => {
      const { groups, activeGraphId } = get()
      return groups.filter((g) =>
        activeGraphId === null
          ? isRootGraphId(g.graphId)
          : g.graphId === activeGraphId
      )
    },
  })
)
