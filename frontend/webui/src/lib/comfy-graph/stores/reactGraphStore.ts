/**
 * React Graph Store (Zustand)
 * 리액트 기반 노드 에디터의 코어 상태와 액션을 관리하는 스토어
 */

import { create } from "zustand"
import type {
  ComfyWorkflowJSON,
  ComfyWorkflowNode,
  ComfyWorkflowLink,
  ComfyNodeInput,
  ComfyNodeOutput
} from "@/lib/comfy-graph/types/workflow"
import type { ComfyNodeDef } from "@/lib/comfy-graph/types/nodeDef"

interface ReactGraphState {
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  zoom: number
  pan: [number, number]
  selectedNodeIds: Set<number>

  // Undo/Redo stacks
  undoStack: Array<{ nodes: ComfyWorkflowNode[]; links: ComfyWorkflowLink[] }>
  redoStack: Array<{ nodes: ComfyWorkflowNode[]; links: ComfyWorkflowLink[] }>

  // Actions
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
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  selectNode: (id: number, accumulate?: boolean) => void
  deselectAll: () => void
  clearGraph: () => void

  // Undo/Redo Actions
  takeSnapshot: () => void
  undo: () => void
  redo: () => void
}

export const useReactGraphStore = create<ReactGraphState>((set, get) => ({
  nodes: [],
  links: [],
  zoom: 1.0,
  pan: [0, 0],
  selectedNodeIds: new Set<number>(),
  undoStack: [],
  redoStack: [],

  setGraph: (workflow) => {
    const currentNodes = get().nodes
    const currentLinks = get().links
    const nodesEqual = JSON.stringify(currentNodes) === JSON.stringify(workflow.nodes || [])
    const linksEqual = JSON.stringify(currentLinks) === JSON.stringify(workflow.links || [])
    if (nodesEqual && linksEqual) return

    set({
      nodes: workflow.nodes || [],
      links: workflow.links || [],
      selectedNodeIds: new Set<number>(),
    })
  },

  addNode: (type, pos, def) => {
    get().takeSnapshot()
    const { nodes } = get()
    const maxId = nodes.reduce((max, n) => Math.max(max, n.id), 0)
    const newId = maxId + 1

    const inputs: ComfyNodeInput[] = []
    const outputs: ComfyNodeOutput[] = []
    const widgetsValues: unknown[] = []
    const widgetNames: string[] = []

    if (def) {
      // 1. Inputs & Widgets 구분하여 초기화
      const req = def.input?.required ?? {}
      const opt = def.input?.optional ?? {}

      const allInputs = { ...req, ...opt }

      for (const [name, spec] of Object.entries(allInputs)) {
        const typeSpec = spec[0]
        const isWidget =
          Array.isArray(typeSpec) ||
          ["INT", "FLOAT", "STRING", "BOOLEAN", "combo"].includes(
            String(typeSpec).toUpperCase()
          )

        if (isWidget) {
          widgetNames.push(name)
          // 기본값 지정
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
          widgetsValues.push(defaultVal)
        } else {
          inputs.push({
            name,
            type: String(typeSpec),
          })
        }
      }

      // 2. Outputs 초기화
      if (def.output && def.output_name) {
        for (let i = 0; i < def.output.length; i++) {
          outputs.push({
            name: def.output_name[i] || def.output[i] || `out_${i}`,
            type: def.output[i] || "*",
          })
        }
      }
    }

    const newNode: ComfyWorkflowNode = {
      id: newId,
      type,
      pos,
      size: [240, 56 + Math.max(inputs.length, outputs.length) * 24 + widgetsValues.length * 30],
      inputs: inputs.length > 0 ? inputs : undefined,
      outputs: outputs.length > 0 ? outputs : undefined,
      widgets_values: widgetsValues.length > 0 ? widgetsValues : undefined,
      properties: widgetNames.length > 0 ? { widget_names: widgetNames } : undefined,
    }

    set({ nodes: [...nodes, newNode] })
  },

  removeNodes: (ids) => {
    if (ids.length === 0) return
    get().takeSnapshot()

    const { nodes, links, selectedNodeIds } = get()
    const idSet = new Set(ids)

    // 해당 노드들 및 그 노드들과 연결된 연결선 모두 제거
    const filteredNodes = nodes.filter((n) => !idSet.has(n.id))
    const filteredLinks = links.filter(
      (l) => !idSet.has(l.origin_id) && !idSet.has(l.target_id)
    )

    const nextSelected = new Set(selectedNodeIds)
    ids.forEach((id) => nextSelected.delete(id))

    // 남은 노드들의 inputs, outputs 내부의 link ID 정리
    const cleanedNodes = filteredNodes.map((node) => {
      let inputsChanged = false
      let outputsChanged = false

      const nextInputs = node.inputs?.map((input) => {
        if (input.link && filteredLinks.every((l) => l.id !== input.link)) {
          inputsChanged = true
          return { ...input, link: undefined }
        }
        return input
      })

      const nextOutputs = node.outputs?.map((output) => {
        if (output.links) {
          const validLinks = output.links.filter((linkId) =>
            filteredLinks.some((l) => l.id === linkId)
          )
          if (validLinks.length !== output.links.length) {
            outputsChanged = true
            return {
              ...output,
              links: validLinks.length > 0 ? validLinks : undefined,
            }
          }
        }
        return output
      })

      if (inputsChanged || outputsChanged) {
        return {
          ...node,
          inputs: nextInputs,
          outputs: nextOutputs,
        }
      }
      return node
    })

    set({
      nodes: cleanedNodes,
      links: filteredLinks,
      selectedNodeIds: nextSelected,
    })
  },

  removeNode: (id) => {
    get().removeNodes([id])
  },

  updateNodePos: (id, pos) => {
    const { nodes } = get()
    set({
      nodes: nodes.map((n) => (n.id === id ? { ...n, pos } : n)),
    })
  },

  updateNodeSize: (id, size) => {
    const { nodes } = get()
    set({
      nodes: nodes.map((n) => (n.id === id ? { ...n, size } : n)),
    })
  },

  connect: (originNodeId, originSlotIdx, targetNodeId, targetSlotIdx, type) => {
    const { nodes, links } = get()

    // Find origin (output) and target (input) nodes
    const originNode = nodes.find((n) => n.id === originNodeId)
    const targetNode = nodes.find((n) => n.id === targetNodeId)

    if (!originNode || !targetNode) return

    const originOutput = originNode.outputs?.[originSlotIdx]
    const targetInput = targetNode.inputs?.[targetSlotIdx]

    if (!originOutput || !targetInput) return

    // Type validation logic helper (supports wildcard "*" or empty, matching types, and comma-separated lists)
    const isValidConnection = (typeA: string | number | undefined, typeB: string | number | undefined): boolean => {
      if (!typeA || typeA === "" || typeA === "*") return true
      if (!typeB || typeB === "" || typeB === "*") return true

      const aStr = String(typeA).toLowerCase()
      const bStr = String(typeB).toLowerCase()

      if (aStr === bStr) return true

      const typesA = aStr.split(",")
      const typesB = bStr.split(",")
      for (const ta of typesA) {
        for (const tb of typesB) {
          const cleanA = ta.trim()
          const cleanB = tb.trim()
          if (!cleanA || cleanA === "*" || !cleanB || cleanB === "*") return true
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

    // 1. 기존 타겟 인풋에 연결되어 있던 연결선이 있다면 끊기 (1:1 인풋 매핑 보장)
    let nextLinks = currentLinks.filter(
      (l) => !(l.target_id === targetNodeId && l.target_slot === targetSlotIdx)
    )

    // 2. 새 연결선 ID 계산
    const maxLinkId = nextLinks.reduce((max, l) => Math.max(max, l.id), 0)
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

    // 3. 노드들의 inputs 및 outputs에 link 정보 업데이트
    const nextNodes = currentNodes.map((node) => {
      if (node.id === targetNodeId && node.inputs) {
        const nextInputs = [...node.inputs]
        if (nextInputs[targetSlotIdx]) {
          nextInputs[targetSlotIdx] = {
            ...nextInputs[targetSlotIdx],
            link: newLinkId,
          }
        }
        return { ...node, inputs: nextInputs }
      }

      if (node.id === originNodeId && node.outputs) {
        const nextOutputs = [...node.outputs]
        if (nextOutputs[originSlotIdx]) {
          const linksArr = nextOutputs[originSlotIdx].links || []
          nextOutputs[originSlotIdx] = {
            ...nextOutputs[originSlotIdx],
            links: [...linksArr, newLinkId],
          }
        }
        return { ...node, outputs: nextOutputs }
      }

      return node
    })

    set({ nodes: nextNodes, links: nextLinks })
  },

  disconnect: (linkId) => {
    get().takeSnapshot()
    const { nodes, links } = get()
    const nextLinks = links.filter((l) => l.id !== linkId)

    const nextNodes = nodes.map((node) => {
      let inputsChanged = false
      let outputsChanged = false

      const nextInputs = node.inputs?.map((input) => {
        if (input.link === linkId) {
          inputsChanged = true
          return { ...input, link: undefined }
        }
        return input
      })

      const nextOutputs = node.outputs?.map((output) => {
        if (output.links?.includes(linkId)) {
          outputsChanged = true
          const valid = output.links.filter((id) => id !== linkId)
          return {
            ...output,
            links: valid.length > 0 ? valid : undefined,
          }
        }
        return output
      })

      if (inputsChanged || outputsChanged) {
        return {
          ...node,
          inputs: nextInputs,
          outputs: nextOutputs,
        }
      }
      return node
    })

    set({ nodes: nextNodes, links: nextLinks })
  },

  updateWidgetValue: (nodeId, widgetName, value) => {
    get().takeSnapshot()
    const { nodes } = get()
    set({
      nodes: nodes.map((node) => {
        if (node.id !== nodeId) return node

        // widget_names 배열을 통해 해당 위젯의 인덱스 검색
        const widgetNames = (node.properties?.widget_names as string[]) || []
        const idx = widgetNames.indexOf(widgetName)
        if (idx === -1) return node

        const nextValues = [...(node.widgets_values || [])]
        nextValues[idx] = value

        return {
          ...node,
          widgets_values: nextValues,
        }
      }),
    })
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(zoom, 3.0)) }),
  setPan: (pan) => set({ pan }),

  selectNode: (id, accumulate) => {
    set((state) => {
      const nextSelected = accumulate ? new Set(state.selectedNodeIds) : new Set<number>()
      if (nextSelected.has(id) && accumulate) {
        nextSelected.delete(id)
      } else {
        nextSelected.add(id)
      }
      return { selectedNodeIds: nextSelected }
    })
  },

  deselectAll: () => set({ selectedNodeIds: new Set<number>() }),

  clearGraph: () => {
    get().takeSnapshot()
    set({
      nodes: [],
      links: [],
      selectedNodeIds: new Set<number>(),
      zoom: 1.0,
      pan: [0, 0],
    })
  },

  takeSnapshot: () => {
    const { nodes, links, undoStack } = get()
    const nextUndo = [...undoStack, {
      nodes: JSON.parse(JSON.stringify(nodes)),
      links: JSON.parse(JSON.stringify(links))
    }].slice(-50) // Limit to 50 items

    set({
      undoStack: nextUndo,
      redoStack: []
    })
  },

  undo: () => {
    const { nodes, links, undoStack, redoStack } = get()
    if (undoStack.length === 0) return

    const previous = undoStack[undoStack.length - 1]
    const nextUndo = undoStack.slice(0, -1)
    const nextRedo = [
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        links: JSON.parse(JSON.stringify(links))
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

  redo: () => {
    const { nodes, links, undoStack, redoStack } = get()
    if (redoStack.length === 0) return

    const next = redoStack[0]
    const nextRedo = redoStack.slice(1)
    const nextUndo = [
      ...undoStack,
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        links: JSON.parse(JSON.stringify(links))
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
