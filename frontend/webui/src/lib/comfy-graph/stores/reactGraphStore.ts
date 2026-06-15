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
import { useNodeDefStore } from "./nodeDefStore"
import { LiteGraph, LGraphNode } from "@/lib/comfy-graph/core/litegraph"

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
  changeNodeMode: (nodeId: number, mode: number) => void
  setZoom: (zoom: number) => void
  setPan: (pan: [number, number]) => void
  selectNode: (id: number, accumulate?: boolean) => void
  deselectAll: () => void
  clearGraph: () => void
  syncNodeFromLive: (
    id: number,
    widgetsValues: unknown[],
    inputs: ComfyNodeInput[],
    outputs: ComfyNodeOutput[],
    properties?: Record<string, StrictJSONValue>
  ) => void
  syncGraphFromLive: () => void

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

    // 링크 정규화: 배열 [id, origin_id, origin_slot, target_id, target_slot, type] → 객체
    const normalizedLinks: ComfyWorkflowLink[] = (workflow.links || []).map((l: unknown) => {
      if (Array.isArray(l)) {
        return { id: l[0], origin_id: l[1], origin_slot: l[2], target_id: l[3], target_slot: l[4], type: l[5] ?? "*" }
      }
      return l as ComfyWorkflowLink
    })

    const nodesEqual = JSON.stringify(currentNodes) === JSON.stringify(workflow.nodes || [])
    const linksEqual = JSON.stringify(currentLinks) === JSON.stringify(normalizedLinks)
    if (nodesEqual && linksEqual) return

    // 라이브 그래프가 존재하고 extension이 완전히 로드되었으면 loadGraphData로 노드 재구축
    // (중간 syncGraph 호출을 억제하여 불완전한 상태가 store에 반영되지 않도록 함)
    const app = window.app
    if (app?.graph && app.extensionsLoaded) {
      const service = window.__comfyAppService
      if (service) {
        const origSyncGraph = app.syncGraph
        app.syncGraph = () => {}
        try {
          const workflowToLoad: ComfyWorkflowJSON = {
            nodes: workflow.nodes,
            links: normalizedLinks,
          }
          service.loadGraphData(workflowToLoad)
        } finally {
          app.syncGraph = origSyncGraph
        }
        get().syncGraphFromLive()
        set({ selectedNodeIds: new Set<number>() })
        return
      }
    }

    // fallback: 라이브 그래프가 없으면 직접 store 갱신 (모드 전환 등)
    // 기존 노드의 위치/크기/위젯값은 보존, inputs/outputs는 새 워크플로우 기준으로 교체
    const existingMap = new Map(currentNodes.map((n) => [n.id, n]))
    const mergedNodes = (workflow.nodes || []).map((node) => {
      const existing = existingMap.get(node.id)
      if (existing) {
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

  addNode: (type, pos, def) => {
    get().takeSnapshot()
    if (window.app?.graph) {
      const liveNode = LiteGraph.createNode(type)
      if (liveNode) {
        liveNode.pos = pos
        const isLora = type.toLowerCase().includes("lora");

        // Add default inputs, outputs, and widgets from nodeDef
        if (def) {
          if (def.input?.required) {
            for (const [name, spec] of Object.entries(def.input.required)) {
              const typeStr = Array.isArray((spec as [string | string[], Record<string, unknown>])[0]) ? "COMBO" : ((spec as [string | string[], Record<string, unknown>])[0] as string)
              liveNode.addInput(name, typeStr)
            }
          }
          if (def.input?.optional) {
            for (const [name, spec] of Object.entries(def.input.optional)) {
              const typeStr = Array.isArray((spec as [string | string[], Record<string, unknown>])[0]) ? "COMBO" : ((spec as [string | string[], Record<string, unknown>])[0] as string)
              liveNode.addInput(name, typeStr)
            }
          }
          for (let i = 0; i < def.output.length; i++) {
            liveNode.addOutput(def.output_name[i] || def.output[i], def.output[i])
          }
          // Add default widgets from required inputs
          if (def.input?.required) {
            for (const [name, spec] of Object.entries(def.input.required)) {
              const [typeVal, config = {}] = spec as [string | string[], Record<string, unknown>]
              if (Array.isArray(typeVal)) {
                liveNode.addWidget("combo", name, typeVal[0], () => {}, { values: typeVal })
              } else if (typeVal === "INT" || typeVal === "FLOAT") {
                const defaultVal = (config.default as number) ?? (typeVal === "INT" ? 0 : 0.0)
                const min = (config.min as number) ?? 0
                const max = (config.max as number) ?? (typeVal === "INT" ? 0x7fffffff : 1e38)
                const step = (config.step as number) ?? 1
                liveNode.addWidget(typeVal === "INT" ? "number" : "number", name, defaultVal, () => {}, { min, max, step, precision: typeVal === "INT" ? 0 : 2 })
              } else if (typeVal === "STRING" || (typeof typeVal === "string" && typeVal.startsWith("AUTOCOMPLETE_"))) {
                liveNode.addWidget("text", name, (config.default as string) ?? "", () => {}, config)
              } else if (typeVal === "BOOLEAN") {
                liveNode.addWidget("toggle", name, (config.default as boolean) ?? false, () => {})
              } else {
                liveNode.addWidget("text", name, (config.default as string) ?? "", () => {}, config)
              }
            }
          }
        }

        // Call prototype's onNodeCreated (patched by beforeRegisterNodeDef hooks)
        if (typeof liveNode.onNodeCreated === "function") {
          if (isLora) console.log("[CEG:DEBUG addNode(Live)] calling onNodeCreated, widgets before:", liveNode.widgets?.length || 0)
          liveNode.onNodeCreated()
          if (isLora) console.log("[CEG:DEBUG addNode(Live)] after onNodeCreated, widgets:", liveNode.widgets?.length || 0,
            liveNode.widgets?.map((w) => ({ name: w.name, type: w.type, hasElement: !!w.element })))
        }

        for (const ext of window.app.extensions || []) {
          if (ext.nodeCreated) {
            try {
              if (isLora) console.log("[CEG:DEBUG addNode(Live)] Calling nodeCreated for", ext.name, "on node", type);
              ext.nodeCreated(liveNode, window.app)
              if (isLora) console.log("[CEG:DEBUG addNode(Live)] After nodeCreated", ext.name, "widgets=" + (liveNode.widgets?.length || 0));
            } catch (err) {
              console.error("Extension nodeCreated failed:", err)
            }
          }
        }
        window.app.graph.add(liveNode)
        get().syncGraphFromLive()
        if (isLora) console.log("[CEG:DEBUG addNode(Live)] Done, liveNode.widgets=" + (liveNode.widgets?.length || 0));
        return
      }
    }

    const { nodes } = get()
    const maxId = nodes.reduce((max, n) => Math.max(max, n.id), 0)
    const newId = maxId + 1

    const inputs: ComfyNodeInput[] = []
    const outputs: ComfyNodeOutput[] = []
    const widgetsValues: unknown[] = []
    const widgetNames: string[] = []

    if (def) {
      // 1. Inputs & Widgets 초기화
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

          // 위젯도 inputs에 추가하되, widget 속성을 붙여 소켓으로 노출
          inputs.push({
            name,
            type: String(typeSpec),
            widget: { name, config: spec[1] || {} },
          })
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
      size: [240, 28 + Math.max(inputs.length, outputs.length) * 20 + widgetNames.length * 40 + 8],
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

    if (window.app?.graph) {
      for (const id of ids) {
        const liveNode = window.app.graph.getNodeById(id)
        if (liveNode) {
          window.app.graph.remove(liveNode)
        }
      }
      get().syncGraphFromLive()
      return
    }

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
    if (window.app?.graph) {
      const liveNode = window.app.graph.getNodeById(id)
      if (liveNode) {
        liveNode.pos = pos
      }
    }
    const { nodes } = get()
    set({
      nodes: nodes.map((n) => (n.id === id ? { ...n, pos } : n)),
    })
  },

  updateNodeSize: (id, size) => {
    if (window.app?.graph) {
      const liveNode = window.app.graph.getNodeById(id)
      if (liveNode) {
        liveNode.size = size
      }
    }
    const { nodes } = get()
    set({
      nodes: nodes.map((n) => (n.id === id ? { ...n, size } : n)),
    })
  },

  connect: (originNodeId, originSlotIdx, targetNodeId, targetSlotIdx, type) => {
    if (window.app?.graph) {
      const originNode = window.app.graph.getNodeById(originNodeId)
      const targetNode = window.app.graph.getNodeById(targetNodeId)
      if (originNode && targetNode) {
        originNode.connect(originSlotIdx, targetNode, targetSlotIdx)
        get().syncGraphFromLive()
        return
      }
    }

    const { nodes } = get()

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

    if (window.app?.graph) {
      const link = window.app.graph.links.get(linkId)
      if (link) {
        const targetNode = window.app.graph.getNodeById(link.target_id)
        if (targetNode) {
          targetNode.disconnectInput(link.target_slot)
          get().syncGraphFromLive()
          return
        }
      }
    }

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

    if (window.app?.graph) {
      const liveNode = window.app.graph.getNodeById(nodeId)
      if (liveNode && liveNode.widgets) {
        const widget = liveNode.widgets.find((w) => w.name === widgetName)
        if (widget) {
          widget.value = value as never
          if (widget.callback) {
            try {
              widget.callback(value as StrictJSONValue)
            } catch (err) {
              console.error("Widget callback failed:", err)
            }
          }
          liveNode.setDirtyCanvas(true, true)
          get().syncGraphFromLive()
          return
        }
      }
    }

    const { nodes } = get()
    set({
      nodes: nodes.map((node) => {
        if (node.id !== nodeId) return node

        // widget_names 배열을 통해 해당 위젯의 인덱스 검색
        const widgetNames = (node.properties?.widget_names as string[]) || []

        // nodeDef fallback: widget_names가 없으면 nodeDef에서 유추
        if (widgetNames.length === 0) {
          const def = useNodeDefStore.getState().getNodeDef(node.type)
          if (def) {
            const req = def.input?.required ?? {}
            const opt = def.input?.optional ?? {}
            for (const [name, spec] of Object.entries({ ...req, ...opt })) {
              const typeSpec = spec[0]
              const isWidget =
                Array.isArray(typeSpec) ||
                ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(
                  String(typeSpec).toUpperCase()
                )
              if (isWidget) widgetNames.push(name)
            }
          }
        }

        const idx = widgetNames.indexOf(widgetName)
        if (idx === -1) return node

        const nextValues = [...(node.widgets_values || [])]
        nextValues[idx] = value

        return {
          ...node,
          widgets_values: nextValues,
          properties: {
            ...(node.properties || {}),
            widget_names: widgetNames,
          },
        }
      }),
    })
  },

  changeNodeMode: (nodeId, mode) => {
    get().takeSnapshot()
    if (window.app?.graph) {
      const liveNode = window.app.graph.getNodeById(nodeId)
      if (liveNode) {
        liveNode.mode = mode
      }
      window.app.syncGraph?.()
      return
    }

    const { nodes } = get()
    set({
      nodes: nodes.map((node) =>
        node.id === nodeId ? { ...node, mode } : node
      ),
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
    if (window.app?.graph) {
      window.app.graph.clear()
      window.app.syncGraph?.()
    }
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

    if (window.app?.graph) {
      window.app.graph.clear()
      const origSync = window.app.syncGraph
      window.app.syncGraph = () => {}
      if (window.app.canvas && window.app.graph) {
        window.app.canvas.graph = window.app.graph
      }

      const last_node_id = Math.max(0, ...previous.nodes.map(n => n.id))
      const last_link_id = Math.max(0, ...previous.links.map(l => l.id))
      const workflow = {
        last_node_id,
        last_link_id,
        nodes: previous.nodes,
        links: previous.links,
        version: 0.4,
      }
      const service = window.app.canvas?.graph?._canvas?.app || window.app
      if (service && typeof service.loadGraphData === "function") {
        service.loadGraphData(workflow)
      }

      window.app.syncGraph = origSync
      window.app.syncGraph?.()
    }

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

    if (window.app?.graph) {
      const origSync = window.app.syncGraph
      window.app.syncGraph = () => {}

      const last_node_id = Math.max(0, ...next.nodes.map(n => n.id))
      const last_link_id = Math.max(0, ...next.links.map(l => l.id))
      const workflow = {
        last_node_id,
        last_link_id,
        nodes: next.nodes,
        links: next.links,
        version: 0.4,
      }
      const service = window.app.canvas?.graph?._canvas?.app || window.app
      if (service && typeof service.loadGraphData === "function") {
        service.loadGraphData(workflow)
      }

      window.app.syncGraph = origSync
      window.app.syncGraph?.()
    }

    set({
      nodes: next.nodes,
      links: next.links,
      undoStack: nextUndo,
      redoStack: nextRedo
    })
  },

  syncNodeFromLive: (id, widgetsValues, inputs, outputs, properties) => {
    const state = get()
    const nodeIdx = state.nodes.findIndex((n) => n.id === id)
    if (nodeIdx === -1) return

    const oldNode = state.nodes[nodeIdx]
    const mergedProperties = {
      ...(oldNode.properties || {}),
      ...(properties || {}),
    }

    const widgetsEqual = JSON.stringify(oldNode.widgets_values) === JSON.stringify(widgetsValues)
    const inputsEqual = JSON.stringify(oldNode.inputs) === JSON.stringify(inputs)
    const outputsEqual = JSON.stringify(oldNode.outputs) === JSON.stringify(outputs)
    const propsEqual = JSON.stringify(oldNode.properties) === JSON.stringify(mergedProperties)

    if (widgetsEqual && inputsEqual && outputsEqual && propsEqual) {
      return
    }

    const updatedNode = {
      ...oldNode,
      widgets_values: widgetsValues,
      inputs: inputs.length > 0 ? inputs : undefined,
      outputs: outputs.length > 0 ? outputs : undefined,
      properties: mergedProperties,
    }

    const nextNodes = [...state.nodes]
    nextNodes[nodeIdx] = updatedNode

    set({ nodes: nextNodes })
  },

  syncGraphFromLive: () => {
    if (!window.app?.graph) return
    const graph = window.app.graph
    const currentNodes = get().nodes
    const currentLinks = get().links

    // Serialize links
    const links: ComfyWorkflowLink[] = []
    for (const [, link] of graph.links) {
      links.push({
        id: link.id,
        origin_id: Number(link.origin_id),
        origin_slot: link.origin_slot,
        target_id: Number(link.target_id),
        target_slot: link.target_slot,
        type: link.type as string,
      })
    }

    // Serialize nodes
    const mergedNodes = graph.nodes.map((liveNode: LGraphNode) => {
      const existing = currentNodes.find((n) => n.id === liveNode.id)
      const widgetsValues = liveNode.widgets?.map((w) => w.value) || []
      const inputs = liveNode.inputs?.map((input) => ({
        name: input.name,
        type: String(input.type),
        link: input.link ?? undefined,
      })) || []
      const outputs = liveNode.outputs?.map((output, i: number) => ({
        name: output.name,
        type: String(output.type),
        links: output.links ?? undefined,
        slot_index: i,
      })) || []

      return {
        id: Number(liveNode.id),
        type: liveNode.type || existing?.type || "",
        pos: liveNode.pos,
        size: liveNode.size,
        widgets_values: widgetsValues.length > 0 ? widgetsValues : undefined,
        inputs: inputs.length > 0 ? inputs : undefined,
        outputs: outputs.length > 0 ? outputs : undefined,
        properties: {
          ...(existing?.properties || {}),
          ...(liveNode.properties || {}),
          widget_names: liveNode.widgets?.map((w) => w.name) || [],
        },
        mode: liveNode.mode !== undefined ? liveNode.mode : existing?.mode,
      }
    })

    const nodesEqual = JSON.stringify(currentNodes) === JSON.stringify(mergedNodes)
    const linksEqual = JSON.stringify(currentLinks) === JSON.stringify(links)

    if (!nodesEqual || !linksEqual) {
      set({ nodes: mergedNodes, links })
    }
  },
}))
