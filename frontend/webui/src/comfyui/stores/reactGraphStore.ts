/**
 * React Graph Store (Zustand)
 * 리액트 기반 노드 에디터의 코어 상태와 액션을 관리하는 스토어
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

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
// import { LiteGraph } from "comfy-litegraph"
const LiteGraph = (window as any).LiteGraph

interface LiveWidget {
  name: string;
  value: unknown;
  type?: string;
  element?: unknown;
  callback?: (value: unknown) => void;
}

interface LiveNodeSlotInput {
  name: string;
  type: string;
  link?: number | null;
}

interface LiveNodeSlotOutput {
  name: string;
  type: string;
  links?: number[] | null;
}

interface LiveNode {
  id: number;
  type?: string;
  pos: [number, number];
  size: [number, number];
  mode?: number;
  properties?: Record<string, unknown>;
  widgets?: LiveWidget[];
  inputs?: LiveNodeSlotInput[];
  outputs?: LiveNodeSlotOutput[];
  onNodeCreated?: () => void;
  addInput(name: string, type: string): void;
  addOutput(name: string, type: string): void;
  addWidget(type: string, name: string, value: unknown, callback: () => void, options?: Record<string, unknown>): void;
  connect(slotIdx: number, targetNode: LiveNode, targetSlot: number): boolean | undefined;
  disconnectInput(slot: number): void;
  setDirtyCanvas(width: boolean, height: boolean): void;
}

interface LiveGraphLink {
  id: number;
  origin_id: number;
  origin_slot: number;
  target_id: number;
  target_slot: number;
  type: string;
}

interface LiveGraph {
  add(node: LiveNode): void;
  remove(node: LiveNode): void;
  getNodeById(id: number): LiveNode | undefined;
  clear(): void;
  links: Map<number, LiveGraphLink>;
  nodes: LiveNode[];
}

interface Extension {
  name?: string;
  nodeCreated?: (node: LiveNode, app: LiveApp) => void;
}

interface LiveApp {
  graph?: LiveGraph;
  syncGraph: () => void;
  extensionsLoaded: boolean;
  extensions: Extension[];
  canvas?: {
    graph?: LiveGraph & {
      _canvas?: {
        app?: LiveApp;
      };
    };
  };
  loadGraphData?: (workflow: unknown) => void;
}

interface ComfyAppService {
  loadGraphData(workflow: unknown): void;
}

interface WindowWithComfy {
  app?: LiveApp;
  __comfyAppService?: ComfyAppService;
}

interface SnapshotEntry {
  nodes: ComfyWorkflowNode[];
  links: ComfyWorkflowLink[];
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
  syncNodeFromLive: (
    id: number,
    widgetsValues: unknown[],
    inputs: unknown[],
    outputs: unknown[],
    properties?: unknown
  ) => void
  syncGraphFromLive: () => void
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

    const win = window as unknown as WindowWithComfy
    const app = win.app
    if (app?.graph !== undefined && app.extensionsLoaded) {
      const service = win.__comfyAppService
      if (service !== undefined) {
        const origSyncGraph = app.syncGraph
        app.syncGraph = (): void => undefined
        try {
          const workflowToLoad: ComfyWorkflowJSON = {
            ...workflow,
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
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const liveNode = LiteGraph.createNode(type) as LiveNode | null
      if (liveNode !== null) {
        liveNode.pos = pos
        const isLora = type.toLowerCase().includes("lora");

        if (def !== undefined) {
          if (def.input?.required) {
            for (const [name, spec] of Object.entries(def.input.required)) {
              const typeStr = Array.isArray(spec[0]) ? "COMBO" : spec[0]
              liveNode.addInput(name, typeStr)
            }
          }
          if (def.input?.optional) {
            for (const [name, spec] of Object.entries(def.input.optional)) {
              const typeStr = Array.isArray(spec[0]) ? "COMBO" : spec[0]
              liveNode.addInput(name, typeStr)
            }
          }
          for (let i = 0; i < def.output.length; i++) {
            const outType = def.output[i] ?? "*"
            const outName = (def.output_name ? def.output_name[i] : null) ?? outType
            liveNode.addOutput(outName, outType)
          }
          if (def.input?.required) {
            for (const [name, spec] of Object.entries(def.input.required)) {
              const [typeVal, config] = spec as [string | string[], Record<string, unknown>]
              if (Array.isArray(typeVal)) {
                liveNode.addWidget("combo", name, typeVal[0] ?? "", (): void => undefined, { values: typeVal })
              } else if (typeVal === "INT" || typeVal === "FLOAT") {
                const rawDefault = config.default
                const defaultVal = rawDefault !== undefined ? rawDefault : (typeVal === "INT" ? 0 : 0.0)
                const rawMin = config.min
                const rawMax = config.max
                const rawStep = config.step
                const min = rawMin !== undefined ? rawMin : 0
                const max = rawMax !== undefined ? rawMax : (typeVal === "INT" ? 0x7fffffff : 1e38)
                const step = rawStep !== undefined ? rawStep : 1
                liveNode.addWidget("number", name, defaultVal, (): void => undefined, { min, max, step, precision: typeVal === "INT" ? 0 : 2 })
              } else if (typeVal === "STRING" || (typeof typeVal === "string" && typeVal.startsWith("AUTOCOMPLETE_"))) {
                liveNode.addWidget("text", name, config.default ?? "", (): void => undefined, config)
              } else if (typeVal === "BOOLEAN") {
                liveNode.addWidget("toggle", name, config.default ?? false, (): void => undefined)
              } else {
                liveNode.addWidget("text", name, config.default ?? "", (): void => undefined, config)
              }
            }
          }
        }

        if (typeof liveNode.onNodeCreated === "function") {
          if (isLora) {
            console.log("[CEG:DEBUG addNode(Live)] calling onNodeCreated, widgets before:", liveNode.widgets?.length ?? 0)
          }
          liveNode.onNodeCreated()
          if (isLora) {
            console.log("[CEG:DEBUG addNode(Live)] after onNodeCreated, widgets:", liveNode.widgets?.length ?? 0,
              liveNode.widgets?.map((w: LiveWidget): Record<string, unknown> => ({ name: w.name, type: w.type, hasElement: w.element !== undefined })))
          }
        }

        const extensions = win.app.extensions
        for (const ext of extensions) {
          if (ext.nodeCreated !== undefined) {
            try {
              if (isLora) {
                console.log("[CEG:DEBUG addNode(Live)] Calling nodeCreated for", ext.name, "on node", type);
              }
              ext.nodeCreated(liveNode, win.app)
              if (isLora) {
                console.log("[CEG:DEBUG addNode(Live)] After nodeCreated", ext.name, "widgets=" + String(liveNode.widgets?.length ?? 0));
              }
            } catch (err) {
              console.error("Extension nodeCreated failed:", err)
            }
          }
        }
        win.app.graph.add(liveNode)
        get().syncGraphFromLive()
        if (isLora) {
          console.log(`[CEG:DEBUG addNode(Live)] Done, liveNode.widgets=${String(liveNode.widgets?.length ?? 0)}`);
        }
        return
      }
    }

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
        const typeSpecStr = Array.isArray(typeSpec) ? "COMBO" : typeSpec
        const isWidget =
          ["INT", "FLOAT", "STRING", "BOOLEAN", "combo"].includes(typeSpecStr.toUpperCase())

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
  },

  removeNodes: (ids: number[]): void => {
    if (ids.length === 0) return
    get().takeSnapshot()

    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      for (const id of ids) {
        const liveNode = win.app.graph.getNodeById(id)
        if (liveNode !== undefined) {
          win.app.graph.remove(liveNode)
        }
      }
      get().syncGraphFromLive()
      return
    }

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
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const liveNode = win.app.graph.getNodeById(id)
      if (liveNode !== undefined) {
        liveNode.pos = pos
      }
    }
    const { nodes } = get()
    set({
      nodes: nodes.map((n: ComfyWorkflowNode): ComfyWorkflowNode => (n.id === id ? { ...n, pos } : n)),
    })
  },

  updateNodeSize: (id: number, size: [number, number]): void => {
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const liveNode = win.app.graph.getNodeById(id)
      if (liveNode !== undefined) {
        liveNode.size = size
      }
    }
    const { nodes } = get()
    set({
      nodes: nodes.map((n: ComfyWorkflowNode): ComfyWorkflowNode => (n.id === id ? { ...n, size } : n)),
    })
  },

  connect: (originNodeId: number, originSlotIdx: number, targetNodeId: number, targetSlotIdx: number, type: string): void => {
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const originNode = win.app.graph.getNodeById(originNodeId)
      const targetNode = win.app.graph.getNodeById(targetNodeId)
      if (originNode !== undefined && targetNode !== undefined) {
        originNode.connect(originSlotIdx, targetNode, targetSlotIdx)
        get().syncGraphFromLive()
        return
      }
    }

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

    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const link = win.app.graph.links.get(linkId)
      if (link !== undefined) {
        const targetNode = win.app.graph.getNodeById(link.target_id)
        if (targetNode !== undefined) {
          targetNode.disconnectInput(link.target_slot)
          get().syncGraphFromLive()
          return
        }
      }
    }

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

    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const liveNode = win.app.graph.getNodeById(nodeId)
      if (liveNode?.widgets !== undefined) {
        const widget = liveNode.widgets.find((w: LiveWidget): boolean => w.name === widgetName)
        if (widget !== undefined) {
          widget.value = value
          if (widget.callback !== undefined) {
            try {
              widget.callback(value)
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
              const typeSpecStr = Array.isArray(typeSpec) ? "COMBO" : typeSpec
              const isWidget =
                ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(typeSpecStr.toUpperCase())
              if (isWidget) widgetNames.push(name)
            }
          }
        }

        const idx = widgetNames.indexOf(widgetName)
        if (idx === -1) return node

        const nextValues = [...(node.widgets_values ?? [])]
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
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const liveNode = win.app.graph.getNodeById(nodeId)
      if (liveNode !== undefined) {
        liveNode.mode = mode
        win.app.syncGraph()
        return
      }
    }

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
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      win.app.graph.clear()
      win.app.syncGraph()
    }
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

    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      win.app.graph.clear()
      const origSync = win.app.syncGraph
      win.app.syncGraph = (): void => undefined
      if (win.app.canvas?.graph !== undefined) {
        const canvasGraph = win.app.canvas.graph
        canvasGraph._canvas = {
          ...canvasGraph._canvas,
          app: win.app
        }
      }

      const last_node_id = Math.max(0, ...previous.nodes.map((n: ComfyWorkflowNode): number => n.id))
      const last_link_id = Math.max(0, ...previous.links.map((l: ComfyWorkflowLink): number => l.id))
      const workflow = {
        last_node_id,
        last_link_id,
        nodes: previous.nodes,
        links: previous.links,
        version: 0.4,
      }
      if (typeof win.app.loadGraphData === "function") {
        win.app.loadGraphData(workflow)
      }

      win.app.syncGraph = origSync
      win.app.syncGraph()
    }

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

    const win = window as unknown as WindowWithComfy
    if (win.app?.graph !== undefined) {
      const origSync = win.app.syncGraph
      win.app.syncGraph = (): void => undefined

      const last_node_id = Math.max(0, ...next.nodes.map((n: ComfyWorkflowNode): number => n.id))
      const last_link_id = Math.max(0, ...next.links.map((l: ComfyWorkflowLink): number => l.id))
      const workflow = {
        last_node_id,
        last_link_id,
        nodes: next.nodes,
        links: next.links,
        version: 0.4,
      }
      if (typeof win.app.loadGraphData === "function") {
        win.app.loadGraphData(workflow)
      }

      win.app.syncGraph = origSync
      win.app.syncGraph()
    }

    set({
      nodes: next.nodes,
      links: next.links,
      undoStack: nextUndo,
      redoStack: nextRedo
    })
  },

  syncNodeFromLive: (id: number, widgetsValues: unknown[], inputs: unknown[], outputs: unknown[], properties?: unknown): void => {
    const state = get()
    const nodeIdx = state.nodes.findIndex((n: ComfyWorkflowNode): boolean => n.id === id)
    if (nodeIdx === -1) return

    const oldNode = state.nodes[nodeIdx]
    if (oldNode === undefined) return
    const mergedProperties: Record<string, unknown> = {
      ...(oldNode.properties ?? {}),
      ...(properties !== undefined ? properties as Record<string, unknown> : {}),
    }

    const widgetsEqual = JSON.stringify(oldNode.widgets_values) === JSON.stringify(widgetsValues)
    const inputsEqual = JSON.stringify(oldNode.inputs) === JSON.stringify(inputs)
    const outputsEqual = JSON.stringify(oldNode.outputs) === JSON.stringify(outputs)
    const propsEqual = JSON.stringify(oldNode.properties) === JSON.stringify(mergedProperties)

    if (widgetsEqual && inputsEqual && outputsEqual && propsEqual) {
      return
    }

    const updatedNode: ComfyWorkflowNode = {
      ...oldNode,
      widgets_values: widgetsValues,
      inputs: inputs.length > 0 ? inputs as ComfyNodeInput[] : undefined,
      outputs: outputs.length > 0 ? outputs as ComfyNodeOutput[] : undefined,
      properties: mergedProperties,
    }

    const nextNodes = [...state.nodes]
    nextNodes[nodeIdx] = updatedNode

    set({ nodes: nextNodes })
  },

  syncGraphFromLive: (): void => {
    const win = window as unknown as WindowWithComfy
    if (win.app?.graph === undefined) return
    const graph = win.app.graph
    const currentNodes = get().nodes
    const currentLinks = get().links

    const links: ComfyWorkflowLink[] = []
    for (const [, link] of graph.links) {
      links.push({
        id: link.id,
        origin_id: link.origin_id,
        origin_slot: link.origin_slot,
        target_id: link.target_id,
        target_slot: link.target_slot,
        type: link.type,
      })
    }

    const mergedNodes = graph.nodes.map((liveNode: unknown): ComfyWorkflowNode => {
      const node = liveNode as LiveNode
      const existing = currentNodes.find((n: ComfyWorkflowNode): boolean => n.id === node.id)
      const widgetsValues = node.widgets?.map((w: LiveWidget): unknown => w.value) ?? []
      const inputs: ComfyNodeInput[] = node.inputs?.map((input: LiveNodeSlotInput): ComfyNodeInput => ({
        name: input.name,
        type: input.type,
        link: input.link ?? undefined,
      })) ?? []
      const outputs: ComfyNodeOutput[] = node.outputs?.map((output: LiveNodeSlotOutput, i: number): ComfyNodeOutput => ({
        name: output.name,
        type: output.type,
        links: output.links ?? undefined,
        slot_index: i,
      })) ?? []

      return {
        id: node.id,
        type: node.type ?? existing?.type ?? "",
        pos: node.pos,
        size: node.size,
        widgets_values: widgetsValues.length > 0 ? widgetsValues : undefined,
        inputs: inputs.length > 0 ? inputs : undefined,
        outputs: outputs.length > 0 ? outputs : undefined,
        properties: {
          ...(existing?.properties ?? {}),
          ...(node.properties ?? {}),
          widget_names: node.widgets?.map((w: LiveWidget): string => w.name) ?? [],
        },
        mode: node.mode ?? existing?.mode,
      }
    })

    const nodesEqual = JSON.stringify(currentNodes) === JSON.stringify(mergedNodes)
    const linksEqual = JSON.stringify(currentLinks) === JSON.stringify(links)

    if (!nodesEqual || !linksEqual) {
      set({ nodes: mergedNodes, links })
    }
  },
}))
