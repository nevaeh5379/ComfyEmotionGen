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
  ComfyNodeOutput
} from "../types/workflow"
import type { ComfyNodeDef } from "../types/nodeDef"
import { useNodeDefStore } from "./nodeDefStore"
import { widgetStore } from "./widgetStore"
import { useExtensionStore } from "./extensionStore"

interface SnapshotEntry {
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
}

interface ReactGraphState {
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  zoom: number
  pan: [number, number]
  selectedNodeIds: Set<number>

  undoStack: SnapshotEntry[]
  redoStack: SnapshotEntry[]

  setGraph: (workflow: ComfyWorkflowJSON) => void
  addNode: (type: string, pos: [number, number], def: ComfyNodeDef | undefined) => void
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
  updateWidgetValue: (nodeId: number, widgetName: string, value: unknown) => void
  changeNodeMode: (nodeId: number, mode: number) => void
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  selectNode: (id: number, accumulate?: boolean) => void
  deselectAll: () => void
  clearGraph: () => void
  takeSnapshot: () => void
  undo: () => void
  redo: () => void
}

export const useReactGraphStore = create<ReactGraphState>((set, get): ReactGraphState => ({
  nodes: [],
  links: [],
  zoom: 1.0,
  pan: [0, 0],
  selectedNodeIds: new Set<number>(),
  undoStack: [],
  redoStack: [],

  setGraph: (workflow: ComfyWorkflowJSON): void => {
    const currentNodes = get().nodes
    const currentLinks = get().links

    const normalizedLinks: ComfyWorkflowLink[] = (workflow.links).map((l: unknown): ComfyWorkflowLink => {
      if (Array.isArray(l)) {
        const linkData = l as [number, number, number, number, number, string | undefined]
        return { id: linkData[0], origin_id: linkData[1], origin_slot: linkData[2], target_id: linkData[3], target_slot: linkData[4], type: linkData[5] ?? "*" }
      }
      return l as ComfyWorkflowLink
    })

    const nodesEqual = JSON.stringify(currentNodes) === JSON.stringify(workflow.nodes)
    const linksEqual = JSON.stringify(currentLinks) === JSON.stringify(normalizedLinks)
    if (nodesEqual && linksEqual) return

    const existingMap = new Map(currentNodes.map((n: ComfyWorkflowNode): [number, ComfyWorkflowNode] => [n.id, n]))
    const mergedNodes = (workflow.nodes).map((node: ComfyWorkflowNode): ComfyWorkflowNode => {
      const existing = existingMap.get(node.id)
      if (existing !== undefined) {
        return {
          ...node,
          pos: existing.pos,
          size: existing.size,
          widgets_values: existing.widgets_values,
          properties: existing.properties,
        }
      }
      return node
    })

    set({
      nodes: mergedNodes,
      links: normalizedLinks,
      selectedNodeIds: new Set<number>(),
    })
  },

  addNode: (type: string, pos: [number, number], def: ComfyNodeDef | undefined): void => {
    get().takeSnapshot()
    const { nodes } = get()
    const maxId = nodes.reduce((max: number, n: ComfyWorkflowNode): number => Math.max(max, n.id), 0)
    const newId = maxId + 1

    const inputs: ComfyNodeInput[] = []
    const outputs: ComfyNodeOutput[] = []
    const widgetsValues: unknown[] = []
    const widgetNames: string[] = []

    if (def !== undefined) {
      const req = def.input?.required ?? {}
      const opt = def.input?.optional ?? {}

      const allInputs = { ...req, ...opt }

      for (const [name, spec] of Object.entries(allInputs)) {
        const typeSpec = spec[0]
        const isWidget = widgetStore.isWidgetType(typeSpec)

        let defaultVal: unknown = ""
        if (Array.isArray(typeSpec)) {
          defaultVal = typeSpec[0] ?? ""
        } else if (spec[1]?.default !== undefined) {
          defaultVal = spec[1].default
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
      size: [240, 28 + Math.max(inputs.length, outputs.length) * 20 + widgetNames.length * 40 + 8],
      inputs: inputs.length > 0 ? inputs : undefined,
      outputs: outputs.length > 0 ? outputs : undefined,
      widgets_values: widgetsValues.length > 0 ? widgetsValues : undefined,
      properties: widgetNames.length > 0 ? { widget_names: widgetNames } : undefined,
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
        { createNode?: (type: string, pos?: [number, number], options?: { id?: number }) => unknown } | undefined
      if (typeof appService?.createNode === "function") {
        console.log(`[CEG] addNode: creating hidden graph node for "${type}" id=${String(newId)} via appService.createNode`)
        const liveNode = appService.createNode(type, pos, { id: newId })
        if (liveNode !== null && liveNode !== undefined) {
          const ln = liveNode as { id?: number | string; onNodeCreated?: () => void; widgets?: { name: string; value: unknown; element?: HTMLElement | null }[] }
          console.log(`[CEG] addNode: has onNodeCreated=${String(typeof ln.onNodeCreated)}`)
          const lnWidgets = ln.widgets
          console.log(`[CEG] addNode: hidden node created, id=${String(newId)} widgets=${String(lnWidgets?.length ?? 0)}`)
          if (lnWidgets && lnWidgets.length > 0) {
            for (const w2 of lnWidgets) {
              console.log(`[CEG] addNode: widget name="${w2.name}" hasElement=${String(w2.element !== null && w2.element !== undefined)}`)
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
              console.log(`[CEG] addNode: merged ${String(allNames.length - widgetNames.length)} extension widgets into store`)
              set({
                nodes: get().nodes.map((n: ComfyWorkflowNode): ComfyWorkflowNode =>
                  n.id === newId
                    ? { ...n, widgets_values: allValues, properties: { ...n.properties, widget_names: allNames } }
                    : n
                )
              })
            }
          } else {
            console.log(`[CEG] addNode: no widgets on live node`)
          }
        }
      } else {
        console.log(`[CEG] addNode: no appService.createNode available, skipping hidden graph sync`)
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

    const filteredNodes = nodes.filter((n: ComfyWorkflowNode): boolean => !idSet.has(n.id))
    const filteredLinks = links.filter(
      (l: ComfyWorkflowLink): boolean => !idSet.has(l.origin_id) && !idSet.has(l.target_id)
    )

    const nextSelected = new Set(selectedNodeIds)
    ids.forEach((id: number): void => { nextSelected.delete(id); })

    const cleanedNodes = filteredNodes.map((node: ComfyWorkflowNode): ComfyWorkflowNode => {
      const nextInputs = node.inputs?.map((input: ComfyNodeInput): ComfyNodeInput => {
        if (input.link !== undefined && filteredLinks.every((l: ComfyWorkflowLink): boolean => l.id !== input.link)) {
          return { ...input, link: undefined }
        }
        return input
      })

      const nextOutputs = node.outputs?.map((output: ComfyNodeOutput): ComfyNodeOutput => {
        if (output.links !== undefined) {
          const validLinks = output.links.filter((linkId: number): boolean =>
            filteredLinks.some((l: ComfyWorkflowLink): boolean => l.id === linkId)
          )
          if (validLinks.length !== output.links.length) {
            return {
              ...output,
              links: validLinks.length > 0 ? validLinks : undefined,
            }
          }
        }
        return output
      })

      return {
        ...node,
        inputs: nextInputs,
        outputs: nextOutputs,
      }
    })

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
      nodes: nodes.map((n: ComfyWorkflowNode): ComfyWorkflowNode => (n.id === id ? { ...n, pos } : n)),
    })
  },

  updateNodeSize: (id: number, size: [number, number]): void => {
    const { nodes } = get()
    set({
      nodes: nodes.map((n: ComfyWorkflowNode): ComfyWorkflowNode => (n.id === id ? { ...n, size } : n)),
    })
  },

  connect: (originNodeId: number, originSlotIdx: number, targetNodeId: number, targetSlotIdx: number, type: string): void => {
    const { nodes } = get()

    const originNode = nodes.find((n: ComfyWorkflowNode): boolean => n.id === originNodeId)
    const targetNode = nodes.find((n: ComfyWorkflowNode): boolean => n.id === targetNodeId)

    if (originNode === undefined || targetNode === undefined) return

    const originOutput = originNode.outputs?.[originSlotIdx]
    const targetInput = targetNode.inputs?.[targetSlotIdx]

    if (originOutput === undefined || targetInput === undefined) return

    const isValidConnection = (typeA: string | number | undefined, typeB: string | number | undefined): boolean => {
      if (typeA === undefined || typeA === "" || typeA === "*") return true
      if (typeB === undefined || typeB === "" || typeB === "*") return true

      const aStr = String(typeA).toLowerCase()
      const bStr = String(typeB).toLowerCase()

      if (aStr === bStr) return true

      const typesA = aStr.split(",")
      const typesB = bStr.split(",")
      for (const ta of typesA) {
        for (const tb of typesB) {
          const cleanA = ta.trim()
          const cleanB = tb.trim()
          if (cleanA === "" || cleanA === "*" || cleanB === "" || cleanB === "*") return true
          if (cleanA === cleanB) return true
        }
      }

      return false
    }

    if (!isValidConnection(originOutput.type, targetInput.type)) {
      console.warn(
        `Incompatible connection: Output type "${originOutput.type}" cannot be connected to Input type "${targetInput.type}"`
      )
      return
    }

    get().takeSnapshot()
    const { links: currentLinks, nodes: currentNodes } = get()

    let nextLinks = currentLinks.filter(
      (l: ComfyWorkflowLink): boolean => !(l.target_id === targetNodeId && l.target_slot === targetSlotIdx)
    )

    const maxLinkId = nextLinks.reduce((max: number, l: ComfyWorkflowLink): number => Math.max(max, l.id), 0)
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

    const nextNodes = currentNodes.map((node: ComfyWorkflowNode): ComfyWorkflowNode => {
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
    })

    set({ nodes: nextNodes, links: nextLinks })
  },

  disconnect: (linkId: number): void => {
    get().takeSnapshot()

    const { nodes, links } = get()
    const nextLinks = links.filter((l: ComfyWorkflowLink): boolean => l.id !== linkId)

    const nextNodes = nodes.map((node: ComfyWorkflowNode): ComfyWorkflowNode => {
      const nextInputs = node.inputs?.map((input: ComfyNodeInput): ComfyNodeInput => {
        if (input.link === linkId) {
          return { ...input, link: undefined }
        }
        return input
      })

      const nextOutputs = node.outputs?.map((output: ComfyNodeOutput): ComfyNodeOutput => {
        if (output.links?.includes(linkId) === true) {
          const valid = output.links.filter((id: number): boolean => id !== linkId)
          return {
            ...output,
            links: valid.length > 0 ? valid : undefined,
          }
        }
        return output
      })

      return {
        ...node,
        inputs: nextInputs,
        outputs: nextOutputs,
      }
    })

    set({ nodes: nextNodes, links: nextLinks })
  },

  updateWidgetValue: (nodeId: number, widgetName: string, value: unknown): void => {
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

        const nextValues = [...(node.widgets_values ?? new Array(widgetNames.length).fill(undefined))]
        while (nextValues.length < widgetNames.length) nextValues.push(undefined)
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
      nodes: nodes.map((node: ComfyWorkflowNode): ComfyWorkflowNode =>
        node.id === nodeId ? { ...node, mode } : node
      ),
    })
  },

  setZoom: (zoom: number): void => { set({ zoom: Math.max(0.1, Math.min(zoom, 3.0)) }); },
  setPan: (pan: [number, number]): void => { set({ pan }); },

  selectNode: (id: number, accumulate?: boolean): void => {
    set((state: ReactGraphState): Partial<ReactGraphState> => {
      const nextSelected = accumulate === true ? new Set(state.selectedNodeIds) : new Set<number>()
      if (nextSelected.has(id) && accumulate === true) {
        nextSelected.delete(id)
      } else {
        nextSelected.add(id)
      }
      return { selectedNodeIds: nextSelected }
    })
  },

  deselectAll: (): void => { set({ selectedNodeIds: new Set<number>() }); },

  clearGraph: (): void => {
    get().takeSnapshot()
    set({
      nodes: [],
      links: [],
      selectedNodeIds: new Set<number>(),
      zoom: 1.0,
      pan: [0, 0],
    })
  },

  takeSnapshot: (): void => {
    const { nodes, links, undoStack } = get()
    const nextUndo = [...undoStack, {
      nodes: JSON.parse(JSON.stringify(nodes)) as ComfyWorkflowNode[],
      links: JSON.parse(JSON.stringify(links)) as ComfyWorkflowLink[]
    }].slice(-50)

    set({
      undoStack: nextUndo,
      redoStack: []
    })
  },

  undo: (): void => {
    const { nodes, links, undoStack, redoStack } = get()
    if (undoStack.length === 0) return

    const previous = undoStack[undoStack.length - 1]
    if (previous === undefined) return
    const nextUndo = undoStack.slice(0, -1)
    const nextRedo = [
      {
        nodes: JSON.parse(JSON.stringify(nodes)) as ComfyWorkflowNode[],
        links: JSON.parse(JSON.stringify(links)) as ComfyWorkflowLink[]
      },
      ...redoStack
    ].slice(0, 50)

    set({
      nodes: previous.nodes,
      links: previous.links,
      undoStack: nextUndo,
      redoStack: nextRedo
    })
  },

  redo: (): void => {
    const { nodes, links, undoStack, redoStack } = get()
    if (redoStack.length === 0) return

    const next = redoStack[0]
    if (next === undefined) return
    const nextRedo = redoStack.slice(1)
    const nextUndo = [
      ...undoStack,
      {
        nodes: JSON.parse(JSON.stringify(nodes)) as ComfyWorkflowNode[],
        links: JSON.parse(JSON.stringify(links)) as ComfyWorkflowLink[]
      }
    ].slice(-50)

    set({
      nodes: next.nodes,
      links: next.links,
      undoStack: nextUndo,
      redoStack: nextRedo
    })
  },
}))
