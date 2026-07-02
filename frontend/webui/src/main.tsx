import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { useNodeDefStore } from "@/comfyui/stores/nodeDefStore"

import "./index.css"

window.comfyExtensions ??= []

// LocalStorage 오염 복구 가드 및 런타임 후킹
try {
  const key = "Comfy.Settings.Comfy.CustomColorPalettes"

  const raw: string | null = window.localStorage.getItem(key)
  if (raw === null || raw === "" || raw === "undefined" || raw === "null") {
    window.localStorage.setItem(key, "{}")
  } else {
    try {
      let parsed: unknown = JSON.parse(raw)
      while (typeof parsed === "string") {
        parsed = JSON.parse(parsed)
      }
      if (typeof parsed !== "object" || parsed === null) {
        window.localStorage.setItem(key, "{}")
      } else {
        window.localStorage.setItem(key, JSON.stringify(parsed))
      }
    } catch {
      window.localStorage.setItem(key, "{}")
    }
  }

  const originalGetItem: (key: string) => string | null =
    localStorage.getItem.bind(localStorage)
  const originalSetItem: (key: string, value: string) => void =
    localStorage.setItem.bind(localStorage)

  localStorage.getItem = function (k: string): string | null {
    const val: string | null = originalGetItem(k)
    if (k === key) {
      try {
        if (
          val === null ||
          val === "" ||
          val === "undefined" ||
          val === "null"
        ) {
          return "{}"
        }
        let parsed: unknown = JSON.parse(val)
        while (typeof parsed === "string") {
          parsed = JSON.parse(parsed)
        }
        if (typeof parsed !== "object" || parsed === null) {
          return "{}"
        }
        return JSON.stringify(parsed)
      } catch {
        return "{}"
      }
    }
    return val
  }

  localStorage.setItem = function (k: string, val: string): void {
    if (k === key) {
      try {
        if (val === "undefined" || val === "null") {
          originalSetItem(key, "{}")
          return
        }
        let parsed: unknown = JSON.parse(val)
        while (typeof parsed === "string") {
          parsed = JSON.parse(parsed)
        }
        if (typeof parsed !== "object" || parsed === null) {
          originalSetItem(key, "{}")
          return
        }
        originalSetItem(key, JSON.stringify(parsed))
        return
      } catch {
        originalSetItem(key, "{}")
        return
      }
    }
    originalSetItem(k, val)
  }
} catch {
  console.error("Failed to install localStorage hooks")
}

// ── LiteGraph globals (extension API contract) ────────────────────
// Extensions reference LiteGraph, LGraph, LGraphNode, LGraphCanvas at runtime.
// These are real constructors that extensions can extend and instantiate.
{
  const _nodeTypes: Record<string, new (...args: unknown[]) => unknown> = {}
  const normalizeSlotType = (type: unknown): string =>
    Array.isArray(type) ? type.join(",") : String(type ?? "*")
  const isWildcardType = (type: unknown): boolean => {
    const normalized = normalizeSlotType(type).toUpperCase()
    return (
      normalized === "*" ||
      normalized === "" ||
      normalized === "0" ||
      normalized === "ANY" ||
      normalized === "COMBO"
    )
  }
  const isValidConnection = (a: unknown, b: unknown): boolean => {
    if (isWildcardType(a) || isWildcardType(b)) return true
    const left = normalizeSlotType(a).toUpperCase().split(",")
    const right = normalizeSlotType(b).toUpperCase().split(",")
    return left.some((type) => right.includes(type))
  }
  const clonePlain = <T,>(value: T): T => {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value)
      } catch {
        // Fall through to JSON clone for plain data.
      }
    }
    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      return value
    }
  }
  window.LiteGraph ??= {} as unknown as typeof window.LiteGraph
  const lg = window.LiteGraph as unknown as Record<string, unknown>
  lg.Nodes ??= {}
  lg.registered_node_types ??= _nodeTypes
  lg.registerNodeType ??= (
    type: string,
    cls: new (...args: unknown[]) => unknown
  ): void => {
    const classRecord = cls as unknown as Record<string, unknown>
    classRecord.type ??= type
    classRecord.title ??= type.split("/").pop() ?? type
    _nodeTypes[type] = cls
    ;(lg.registered_node_types as Record<string, unknown>)[type] = cls
    ;(lg.Nodes as Record<string, unknown>)[type] = cls
    ;(
      lg as {
        onNodeTypeRegistered?: (type: string, cls: unknown) => void
      }
    ).onNodeTypeRegistered?.(type, cls)

    try {
      const store = useNodeDefStore.getState()
      if (store.getNodeDef(type) === undefined) {
        const category = (cls as unknown as { category?: string }).category ?? "Other"
        const displayName = (cls as unknown as { title?: string }).title ?? type
        store.registerNodeDef({
          name: type,
          display_name: displayName,
          category: category,
          input: {},
          output: [],
          output_name: [],
        })
      }
    } catch (err) {
      console.error("[CEG] Failed to register virtual node def in store:", err)
    }
  }
  lg.getNodeType ??= (type: string): unknown =>
    (lg.registered_node_types as Record<string, unknown>)[type]
  lg.unregisterNodeType ??= (type: string): void => {
    delete _nodeTypes[type]
    delete (lg.registered_node_types as Record<string, unknown>)[type]
    delete (lg.Nodes as Record<string, unknown>)[type]
  }
  lg.wrapFunction ??= (
    obj: Record<string, unknown> | null | undefined,
    name: string,
    fn: (...args: unknown[]) => unknown
  ): void => {
    if (obj === null || obj === undefined) return
    const old = obj[name]
    obj[name] = function (this: unknown, ...args: unknown[]): unknown {
      return fn.call(this, old, ...args)
    }
  }
  lg.createNode ??= (
    type: string,
    title?: string,
    options?: Record<string, unknown>
  ): unknown => {
    const Cls = _nodeTypes[type]
    if (Cls === undefined) return null
    const node = new Cls() as Record<string, unknown> & {
      onNodeCreated?: () => void
    }
    node.type ??= type
    node.title ??= title ?? (Cls as unknown as { title?: string }).title ?? type
    node.properties ??= {}
    node.flags ??= {}
    if (Array.isArray(node.pos) === false) node.pos = [0, 0]
    if (Array.isArray(node.size) === false) {
      node.size = [lg.NODE_DEFAULT_WIDTH ?? 200, lg.NODE_DEFAULT_HEIGHT ?? 80]
    }
    if (options !== undefined) Object.assign(node, options)
    return node
  }
  lg.NODE_DEFAULT_WIDTH ??= 200
  lg.NODE_DEFAULT_HEIGHT ??= 80
  lg.NODE_WIDTH ??= 140
  lg.NODE_TITLE_HEIGHT ??= 24
  lg.NODE_SLOT_HEIGHT ??= 20
  lg.NODE_WIDGET_HEIGHT ??= 20
  lg.NODE_TEXT_SIZE ??= 14
  lg.WIDGET_BGCOLOR ??= "#222"
  lg.LINK_COLOR ??= "#9A9"
  lg.EVENT_LINK_COLOR ??= "#A86"
  lg.NORMAL_TITLE ??= 0
  lg.NO_TITLE ??= 1
  lg.TRANSPARENT_TITLE ??= 2
  lg.AUTOHIDE_TITLE ??= 3
  lg.ALWAYS ??= 0
  lg.NEVER ??= 2
  lg.BYPASS ??= 4
  lg.ACTION ??= -1
  lg.EVENT ??= -1
  lg.INPUT ??= 1
  lg.OUTPUT ??= 2
  lg.HIDDEN_LINK ??= 0
  lg.STRAIGHT_LINK ??= 0
  lg.LINEAR_LINK ??= 1
  lg.SPLINE_LINK ??= 2
  lg.VALID_SHAPES ??= ["default", "box", "round", "card", "circle"]
  lg.NODE_MODES ??= ["Always", "On Event", "Never", "On Trigger", "Bypass"]
  lg.NODE_MODES_COLORS ??= ["#666", "#422", "#333", "#224", "#886"]
  lg.LGraphEventMode ??= { ALWAYS: 0, NEVER: 2, BYPASS: 4 }
  lg.registered_slot_in_types ??= {}
  lg.registered_slot_out_types ??= {}
  lg.slot_types_in ??= lg.registered_slot_in_types
  lg.slot_types_out ??= lg.registered_slot_out_types
  lg.slot_types_default_in ??= {}
  lg.slot_types_default_out ??= {}
  lg.getAtomicGraphClasses ??= (): Record<string, unknown> => ({})
  lg.isValidConnection ??= isValidConnection
  lg.cloneObject ??= clonePlain
  lg.getTime ??= (): number => performance.now()
  lg.uuidv4 ??= (): string =>
    crypto.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === "x" ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  lg.getParameterNames ??= (fn: (...args: unknown[]) => unknown): string[] => {
    const source = fn.toString().replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    const match = source.match(/^[^(]*\(([^)]*)\)/)
    return (
      match?.[1]
        ?.split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? []
    )
  }
  lg.colorToString ??= (color: unknown): string =>
    Array.isArray(color)
      ? `rgb(${color.slice(0, 3).join(",")})`
      : String(color ?? "")
  lg.hex2num ??= (hex: string): number[] => {
    const clean = hex.replace("#", "")
    const num = Number.parseInt(clean, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  }
  lg.num2hex ??= (triplet: number[]): string =>
    `#${triplet
      .slice(0, 3)
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
      .join("")}`
  lg.pointerListenerAdd ??= (
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ): void => target.addEventListener(type, listener, options)
  lg.pointerListenerRemove ??= (
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions
  ): void => target.removeEventListener(type, listener, options)
  lg.closeAllContextMenus ??= (): void => {
    document.querySelectorAll(".litecontextmenu").forEach((el) => el.remove())
  }
  lg.extendClass ??= (target: { prototype?: object }, origin: { prototype?: object }): void => {
    if (target.prototype === undefined || origin.prototype === undefined) return
    for (const name of Object.getOwnPropertyNames(origin.prototype)) {
      if (name === "constructor") continue
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) continue
      const descriptor = Object.getOwnPropertyDescriptor(origin.prototype, name)
      if (descriptor !== undefined) {
        Object.defineProperty(target.prototype, name, descriptor)
      }
    }
  }
  lg.registerNodeAndSlotType ??= (
    type: string,
    cls: new (...args: unknown[]) => unknown
  ): void => {
    ;(lg.registerNodeType as (type: string, cls: new (...args: unknown[]) => unknown) => void)(type, cls)
    ;(lg.registered_slot_in_types as Record<string, unknown>)[type] = true
    ;(lg.registered_slot_out_types as Record<string, unknown>)[type] = true
  }
  lg.clearRegisteredTypes ??= (): void => {
    for (const key of Object.keys(_nodeTypes)) delete _nodeTypes[key]
    for (const key of Object.keys(lg.registered_node_types as Record<string, unknown>)) {
      delete (lg.registered_node_types as Record<string, unknown>)[key]
    }
    lg.Nodes = {}
  }
  lg.getNodeTypesCategories ??= (filter?: string): string[] => {
    const categories = new Set<string>()
    for (const [type, cls] of Object.entries(
      lg.registered_node_types as Record<string, { category?: string }>
    )) {
      if (filter !== undefined && !type.includes(filter)) continue
      categories.add(cls.category ?? type.split("/").slice(0, -1).join("/") ?? "")
    }
    return [...categories].filter(Boolean).sort()
  }
  lg.getNodeTypesInCategory ??= (category: string, filter?: string): unknown[] =>
    Object.entries(lg.registered_node_types as Record<string, { category?: string }>)
      .filter(([type, cls]) => {
        const nodeCategory = cls.category ?? type.split("/").slice(0, -1).join("/")
        return (
          nodeCategory === category &&
          (filter === undefined || type.toLowerCase().includes(filter.toLowerCase()))
        )
      })
      .map(([, cls]) => cls)
  lg.ContextMenu ??= class ContextMenu {
    readonly values?: unknown[]
    readonly options?: Record<string, unknown>
    constructor(values?: unknown[], options?: Record<string, unknown>) {
      if (values !== undefined) this.values = values
      if (options !== undefined) this.options = options
    }
  }
  ;(lg as { node_menu_options?: unknown[] }).node_menu_options ??= []
  ;(lg as { canvas_menu_options?: unknown[] }).canvas_menu_options ??= []

  // LGraphNode — base class for all node types
  if (
    typeof (window as unknown as Record<string, unknown>).LGraphNode ===
    "undefined"
  ) {
    let _nextNodeId = 1
    class LGraphNodeImpl {
      id = _nextNodeId++
      type?: string
      color?: string
      bgcolor?: string
      pos: [number, number] = [0, 0]
      size: [number, number] = [0, 0]
      private _inputs: {
        name: string
        type: string
        link: number | null
        localized_name: string
      }[] = []
      private _outputs: {
        name: string
        type: string
        links: number[] | null
        localized_name: string
      }[] = []
      widgets?: unknown[] = []
      graph: LGraph | null = null
      mode = 0
      order = 0
      properties?: Record<string, unknown> = {}
      properties_info?: Record<string, Record<string, unknown>> = {}
      flags?: Record<string, unknown> = {}
      title?: string
      title_buttons?: unknown[]
      _output_data?: Record<number, unknown> = {}
      constructor(type?: string) {
        if (type !== undefined) this.type = type
        if (type !== undefined) this.title = type
      }
      get inputs(): {
        name: string
        type: string
        link: number | null
        localized_name: string
      }[] {
        return this._inputs
      }
      set inputs(value: unknown) {
        if (Array.isArray(value)) {
          this._inputs = value as typeof this._inputs
        }
      }
      get outputs(): {
        name: string
        type: string
        links: number[] | null
        localized_name: string
      }[] {
        return this._outputs
      }
      set outputs(value: unknown) {
        if (Array.isArray(value)) {
          this._outputs = value as typeof this._outputs
        }
      }
      addInput(name: string, type: string): void {
        this.inputs.push({ name, type, link: null, localized_name: name })
      }
      addOutput(name: string, type: string): void {
        this.outputs.push({ name, type, links: null, localized_name: name })
      }
      connect(slot: number, node: unknown, inputSlot: number | string): boolean | null {
        const target = node as {
          id?: number
          inputs?: { name?: string; link: number | null; type?: string }[]
          graph?: unknown
        }
        const inputIndex =
          typeof inputSlot === "string"
            ? target.inputs?.findIndex((input) => input.name === inputSlot) ?? -1
            : inputSlot
        if (target.inputs === undefined || inputIndex < 0) return false
        const output = this.outputs[slot]
        const input = target.inputs[inputIndex]
        if (output === undefined || input === undefined) return false
        if (!isValidConnection(output.type, input.type)) return false
        const graph = (this.graph ?? target.graph) as {
          links?: Map<number, unknown> | Record<number, unknown>
          state?: { lastLinkId?: number }
        } | null
        const nextId = (graph?.state?.lastLinkId ?? 0) + 1
        if (graph?.state !== undefined) graph.state.lastLinkId = nextId
        const link = {
          id: nextId,
          origin_id: this.id,
          origin_slot: slot,
          target_id: target.id ?? 0,
          target_slot: inputIndex,
          type: output.type,
        }
        if (graph?.links instanceof Map) graph.links.set(nextId, link)
        else if (graph?.links !== undefined) graph.links[nextId] = link
        input.link = nextId
        output.links ??= []
        output.links.push(nextId)
        return true
      }
      disconnectInput(slot: number): void {
        const linkId = this.inputs[slot]?.link
        if (linkId == null) return
        const input = this.inputs[slot]
        if (input !== undefined) input.link = null
        const graph = this.graph as { links?: Map<number, unknown> | Record<number, unknown> } | null
        if (graph?.links instanceof Map) graph.links.delete(linkId)
        else if (graph?.links !== undefined) delete graph.links[linkId]
      }
      disconnectOutput(slot: number): void {
        const links = this.outputs[slot]?.links
        if (!Array.isArray(links)) return
        const graph = this.graph as { links?: Map<number, unknown> | Record<number, unknown> } | null
        for (const linkId of links) {
          if (graph?.links instanceof Map) graph.links.delete(linkId)
          else if (graph?.links !== undefined) delete graph.links[linkId]
        }
        const output = this.outputs[slot]
        if (output !== undefined) output.links = []
      }
      configure(data?: Record<string, unknown>): void {
        if (data === undefined) return
        if (typeof data.id === "number") this.id = data.id
        if (typeof data.type === "string") this.type = data.type
        if (typeof data.title === "string") this.title = data.title
        if (Array.isArray(data.pos)) this.pos = data.pos as [number, number]
        if (Array.isArray(data.size)) this.size = data.size as [number, number]
        if (typeof data.mode === "number") this.mode = data.mode
        if (typeof data.order === "number") this.order = data.order
        if (typeof data.properties === "object" && data.properties !== null) {
          this.properties = data.properties as Record<string, unknown>
        }
        ;(this as { onConfigure?: (data: Record<string, unknown>) => void }).onConfigure?.(data)
      }
      setDirtyCanvas(): void {
        ;(this.graph as { setDirtyCanvas?: (flag?: boolean, history?: boolean) => void } | null)
          ?.setDirtyCanvas?.(true, true)
      }
      setSize(size: [number, number]): void {
        this.size = [size[0], size[1]]
        this.setDirtyCanvas()
      }
      setPos(x: number | [number, number], y?: number): void {
        this.pos = Array.isArray(x) ? [x[0], x[1]] : [x, y ?? this.pos[1]]
        this.setDirtyCanvas()
      }
      move(deltaX: number, deltaY: number): void {
        this.pos = [this.pos[0] + deltaX, this.pos[1] + deltaY]
        this.setDirtyCanvas()
      }
      snapToGrid(): void {
        this.pos = [Math.round(this.pos[0] / 10) * 10, Math.round(this.pos[1] / 10) * 10]
      }
      alignToGrid(): void {
        this.snapToGrid()
      }
      expandToFitContent(): void {
        const [width, height] = this.computeSize(this.size[0] || undefined)
        this.size = [Math.max(this.size[0], width), Math.max(this.size[1], height)]
      }
      addProperty(
        name: string,
        defaultValue: unknown,
        type?: string,
        extraInfo?: Record<string, unknown>
      ): void {
        this.properties ??= {}
        this.properties_info ??= {}
        if (!(name in this.properties)) {
          this.properties[name] = defaultValue
        }
        this.properties_info[name] = {
          name,
          default_value: defaultValue,
          type,
          ...(extraInfo ?? {}),
        }
      }
      setProperty(name: string, value: unknown): void {
        this.properties ??= {}
        this.properties[name] = value
      }
      getProperty(name: string): unknown {
        return this.properties?.[name]
      }
      getPropertyInfo(name: string): Record<string, unknown> | undefined {
        return this.properties_info?.[name]
      }
      removeProperty(name: string): void {
        if (this.properties !== undefined) delete this.properties[name]
        if (this.properties_info !== undefined) delete this.properties_info[name]
      }
      addCustomWidget<TWidget extends Record<string, unknown>>(
        customWidget: TWidget
      ): TWidget {
        this.widgets ??= []
        const widget = customWidget
        const widgetRecord = widget as Record<string, unknown>
        if (widgetRecord.options === undefined) {
          widgetRecord.options = {}
        }
        const options = widgetRecord.options as Record<string, unknown>
        options.hideOnZoom ??= false
        this.widgets.push(widget)
        return widget
      }
      removeWidget(widgetOrSlot: unknown): void {
        if (this.widgets === undefined) return
        const index =
          typeof widgetOrSlot === "number"
            ? widgetOrSlot
            : this.widgets.indexOf(widgetOrSlot)
        if (index >= 0) this.widgets.splice(index, 1)
      }
      ensureWidgetRemoved(widget: unknown): void {
        this.removeWidget(widget)
      }
      findInputSlot(name: string, returnObj?: boolean): unknown {
        const index = this.inputs.findIndex((input) => input.name === name)
        return returnObj === true ? this.inputs[index] : index
      }
      findOutputSlot(name: string, returnObj?: boolean): unknown {
        const index = this.outputs.findIndex((output) => output.name === name)
        return returnObj === true ? this.outputs[index] : index
      }
      getInputInfo(slot: number): unknown {
        return this.inputs[slot] ?? null
      }
      getOutputInfo(slot: number): unknown {
        return this.outputs[slot] ?? null
      }
      isInputConnected(slot: number): boolean {
        return this.inputs[slot]?.link != null
      }
      isOutputConnected(slot: number): boolean {
        const links = this.outputs[slot]?.links
        return Array.isArray(links) && links.length > 0
      }
      isAnyOutputConnected(): boolean {
        return this.outputs.some((_, index) => this.isOutputConnected(index))
      }
      removeInput(slot: number): void {
        this.inputs.splice(slot, 1)
      }
      removeOutput(slot: number): void {
        this.outputs.splice(slot, 1)
      }
      getInputLink(slot: number): unknown {
        const linkId = this.inputs[slot]?.link
        if (linkId == null) return null
        const graph = this.graph as { links?: Map<number, unknown> | Record<number, unknown> } | null
        return graph?.links instanceof Map ? graph.links.get(linkId) : graph?.links?.[linkId] ?? null
      }
      getInputNode(slot: number): unknown {
        const link = this.getInputLink(slot) as { origin_id?: number } | null
        const graph = this.graph as { getNodeById?: (id: number) => unknown } | null
        return link?.origin_id !== undefined ? graph?.getNodeById?.(link.origin_id) ?? null : null
      }
      getOutputNodes(slot: number): unknown[] | null {
        const links = this.outputs[slot]?.links
        if (!Array.isArray(links) || links.length === 0) return null
        const graph = this.graph as {
          links?: Map<number, unknown> | Record<number, unknown>
          getNodeById?: (id: number) => unknown
        } | null
        const nodes: unknown[] = []
        for (const linkId of links) {
          const link = graph?.links instanceof Map ? graph.links.get(linkId) : graph?.links?.[linkId]
          const targetId = (link as { target_id?: number } | undefined)?.target_id
          if (targetId !== undefined) {
            const target = graph?.getNodeById?.(targetId)
            if (target !== undefined && target !== null) nodes.push(target)
          }
        }
        return nodes
      }
      getInputData(_slot?: number, _forceUpdate?: boolean): undefined {
        return undefined
      }
      getInputDataByName(_slotName?: string, _forceUpdate?: boolean): null {
        return null
      }
      setOutputData(slot = 0, data?: unknown): void {
        this._output_data ??= {}
        this._output_data[slot] = data
      }
      getOutputData(slot = 0): unknown {
        return this._output_data?.[slot]
      }
      setOutputDataType(slot: number, type: string): void {
        if (this.outputs[slot] !== undefined) this.outputs[slot].type = type
      }
      getInputDataType(slot: number): string | undefined {
        return this.inputs[slot]?.type
      }
      getInputOrProperty(name: string): unknown {
        const inputIndex = this.findInputSlot(name) as number
        const inputData = inputIndex >= 0 ? this.getInputData(inputIndex) : undefined
        return inputData ?? this.properties?.[name]
      }
      findInputSlotFree(): number {
        return this.inputs.findIndex((input) => input.link == null)
      }
      findOutputSlotFree(): number {
        return this.outputs.findIndex(
          (output) => !Array.isArray(output.links) || output.links.length === 0
        )
      }
      findInputSlotByType(type: string): number {
        return this.inputs.findIndex((input) => isValidConnection(input.type, type))
      }
      findOutputSlotByType(type: string): number {
        return this.outputs.findIndex((output) => isValidConnection(output.type, type))
      }
      findSlotByType(input: boolean, type: string): number {
        return input ? this.findInputSlotByType(type) : this.findOutputSlotByType(type)
      }
      findInputByType(type: string): unknown {
        const index = this.findInputSlotByType(type)
        return index >= 0 ? this.inputs[index] : null
      }
      findOutputByType(type: string): unknown {
        const index = this.findOutputSlotByType(type)
        return index >= 0 ? this.outputs[index] : null
      }
      findConnectByTypeSlot(type: string, isOutput = true): number {
        return isOutput ? this.findOutputSlotByType(type) : this.findInputSlotByType(type)
      }
      canConnectTo(slot: number, targetNode: unknown, targetSlot: number): boolean {
        const target = targetNode as { inputs?: { type?: string }[] }
        return isValidConnection(this.outputs[slot]?.type, target.inputs?.[targetSlot]?.type)
      }
      connectByType(slot: number, targetNode: unknown, targetType: string): boolean | null {
        const target = targetNode as { findInputSlotByType?: (type: string) => number }
        const targetSlot = target.findInputSlotByType?.(targetType) ?? -1
        return targetSlot >= 0 ? this.connect(slot, targetNode, targetSlot) : false
      }
      connectByTypeOutput(targetType: string, targetNode: unknown, targetSlot: number): boolean | null {
        const outputSlot = this.findOutputSlotByType(targetType)
        return outputSlot >= 0 ? this.connect(outputSlot, targetNode, targetSlot) : false
      }
      getSlotFromWidget(widget: unknown): number {
        return this.widgets?.indexOf(widget) ?? -1
      }
      getWidgetFromSlot(slot: number): unknown {
        return this.widgets?.[slot]
      }
      addTitleButton(name: string, label: string, callback?: () => void): unknown {
        this.title_buttons ??= []
        const button = { name, label, callback }
        this.title_buttons.push(button)
        return button
      }
      onTitleButtonClick(name: string): void {
        const button = this.title_buttons?.find(
          (item) => (item as { name?: string }).name === name
        ) as { callback?: () => void } | undefined
        button?.callback?.()
      }
      collapse(force?: boolean): void {
        this.flags ??= {}
        this.flags.collapsed = force ?? !this.flags.collapsed
      }
      toggleAdvanced(): void {
        this.flags ??= {}
        this.flags.advanced = !this.flags.advanced
      }
      pin(): void {
        this.flags ??= {}
        this.flags.pinned = true
      }
      unpin(): void {
        this.flags ??= {}
        this.flags.pinned = false
      }
      loadImage(url: string): HTMLImageElement {
        const img = new Image()
        img.src = url
        return img
      }
      trace(...args: unknown[]): void {
        console.debug("[LGraphNode]", ...args)
      }
      addWidget(
        type: string,
        name: string,
        value: unknown,
        callback?: (v: unknown) => void,
        options?: Record<string, unknown>
      ): unknown {
        const widget = {
          type,
          name,
          value,
          callback,
          options: { hideOnZoom: false, ...(options ?? {}) },
        }
        const added = this.addCustomWidget(widget)
        this.expandToFitContent()
        return added
      }
      addDOMWidget(
        type: string,
        name: string,
        value: unknown,
        callback?: (v: unknown) => void,
        options?: Record<string, unknown>
      ): unknown {
        return this.addWidget(type, name, value, callback, options)
      }
      computeSize(min_width?: number): [number, number] {
        return [min_width ?? 200, 80]
      }
      getTitle(): string {
        return this.title ?? this.type ?? ""
      }
      serialize(): Record<string, unknown> {
        const data = {
          id: this.id,
          type: this.type,
          title: this.title,
          pos: this.pos,
          size: this.size,
          mode: this.mode,
          order: this.order,
          flags: this.flags,
          properties: this.properties,
        }
        ;(this as { onSerialize?: (data: Record<string, unknown>) => void }).onSerialize?.(data)
        return data
      }
      clone(): unknown {
        const ctor = this.constructor as new (...args: unknown[]) => LGraphNodeImpl
        const cloned = new ctor(this.type)
        cloned.configure(clonePlain(this.serialize()))
        cloned.id = 0
        cloned.graph = null
        return cloned
      }
    }
    window.LGraphNode = LGraphNodeImpl as unknown as typeof window.LGraphNode
  }

  // LGraph — graph container
  if (
    typeof (window as unknown as Record<string, unknown>).LGraph === "undefined"
  ) {
    class LGraphImpl {
      _nodes_by_id: Record<string, unknown> = {}
      links: Map<number, unknown> | Record<number, unknown> = new Map()
      groups: unknown[] = []
      _groups: unknown[] = this.groups
      nodes: unknown[] = []
      id = 0
      revision = 0
      status = 0
      state = { lastNodeId: 0, lastLinkId: 0, lastGroupId: 0, lastRerouteId: 0 }
      _canvas?: unknown
      add(node: unknown): void {
        const nodeRecord = node as { id?: number; graph?: unknown; onAdded?: (graph: unknown) => void }
        if (nodeRecord.id === undefined || nodeRecord.id === 0) {
          nodeRecord.id = ++this.state.lastNodeId
        } else {
          this.state.lastNodeId = Math.max(this.state.lastNodeId, nodeRecord.id)
        }
        nodeRecord.graph = this
        this.nodes.push(node)
        this._nodes_by_id[String(nodeRecord.id)] = node
        nodeRecord.onAdded?.(this)
        ;(this as { onNodeAdded?: (node: unknown) => void }).onNodeAdded?.(node)
        this.afterChange(node)
      }
      remove(node: unknown): void {
        const i = this.nodes.indexOf(node)
        if (i !== -1) this.nodes.splice(i, 1)
        const nodeRecord = node as { id?: number; graph?: unknown; onRemoved?: () => void }
        if (nodeRecord.id !== undefined) delete this._nodes_by_id[String(nodeRecord.id)]
        nodeRecord.graph = null
        nodeRecord.onRemoved?.()
        ;(this as { onNodeRemoved?: (node: unknown) => void }).onNodeRemoved?.(node)
        this.afterChange(null)
      }
      clear(): void {
        this.nodes = []
        this._nodes_by_id = {}
        this.links = new Map()
        this.groups = []
        this._groups = this.groups
        this.afterChange(null)
      }
      getNodeById(id: number | string): unknown {
        return this._nodes_by_id[String(id)]
      }
      findNodesByType(type: string): unknown[] {
        return this.nodes.filter((node) => (node as { type?: string }).type === type)
      }
      findNodesByTitle(title: string): unknown[] {
        return this.nodes.filter((node) => (node as { title?: string }).title === title)
      }
      serialize(): Record<string, unknown> {
        const data = {
          id: this.id,
          revision: this.revision,
          nodes: this.nodes.map((node) =>
            typeof (node as { serialize?: () => unknown }).serialize === "function"
              ? (node as { serialize: () => unknown }).serialize()
              : clonePlain(node)
          ),
          links:
            this.links instanceof Map
              ? Array.from(this.links.values())
              : Object.values(this.links),
          groups: this.groups,
        }
        ;(this as { onSerialize?: (data: Record<string, unknown>) => void }).onSerialize?.(data)
        return data
      }
      configure(data?: Record<string, unknown>): void {
        if (data === undefined) return
        this.clear()
        if (Array.isArray(data.nodes)) {
          for (const rawNode of data.nodes as Record<string, unknown>[]) {
            const type = String(rawNode.type ?? "")
            const node = (window.LiteGraph.createNode(type) ??
              new window.LGraphNode(type)) as { configure?: (data: Record<string, unknown>) => void }
            node.configure?.(rawNode)
            this.add(node)
          }
        }
        if (Array.isArray(data.groups)) {
          this.groups = (data.groups as Record<string, unknown>[]).map((rawGroup) => {
            const group = new window.LGraphGroup()
            ;(group as { configure?: (data: Record<string, unknown>) => void }).configure?.(rawGroup)
            return group
          })
          this._groups = this.groups
        }
        ;(this as { onConfigure?: (data: Record<string, unknown>) => void }).onConfigure?.(data)
      }
      beforeChange(info?: unknown): void {
        ;(this as { onBeforeChange?: (graph: unknown, info?: unknown) => void }).onBeforeChange?.(this, info)
      }
      afterChange(info?: unknown): void {
        this.revision++
        ;(this as { onAfterChange?: (graph: unknown, info?: unknown) => void }).onAfterChange?.(this, info)
      }
      change(): void {
        this.afterChange(null)
      }
      incrementVersion(): void {
        this.revision++
      }
      updateExecutionOrder(): void {
        /* noop */
      }
      computeExecutionOrder(): unknown[] {
        return [...this.nodes]
      }
      attachCanvas(canvas: unknown): void {
        this._canvas = canvas
      }
      detachCanvas(canvas?: unknown): void {
        if (canvas === undefined || this._canvas === canvas) this._canvas = undefined
      }
      setDirtyCanvas(flag?: boolean, history?: boolean): void {
        ;(this._canvas as { setDirty?: (flag?: boolean, history?: boolean) => void } | undefined)
          ?.setDirty?.(flag, history)
      }
    }
    window.LGraph = LGraphImpl as unknown as typeof window.LGraph
  }

  // LGraphCanvas — canvas renderer
  if (
    typeof (window as unknown as Record<string, unknown>).LGraphCanvas ===
    "undefined"
  ) {
    class LGraphCanvasImpl {
      state = { readOnly: false }
      ds = { scale: 1, offset: [0, 0] as [number, number] }
      canvas: HTMLCanvasElement | null = null
      graph: unknown = null
      graph_mouse?: [number, number] = [0, 0]
      canvas_mouse?: [number, number] = [0, 0]
      selected_nodes: Record<string, unknown> = {}
      selectedItems: Set<unknown> = new Set()
      visible_nodes: unknown[] = []
      node_over?: unknown
      allow_searchbox = true
      render_canvas_border = false
      constructor(canvas?: HTMLCanvasElement | null, graph?: LGraph) {
        if (canvas !== undefined && canvas !== null) this.canvas = canvas
        if (graph !== undefined) this.setGraph(graph)
      }
      setGraph(graph: LGraph): void {
        this.graph = graph
        ;(graph as { attachCanvas?: (canvas: unknown) => void })?.attachCanvas?.(this)
      }
      resize(): void {
        /* noop */
      }
      setDirty(): void {
        /* noop */
      }
      stopRendering(): void {
        /* noop */
      }
      startRendering(): void {
        /* noop */
      }
      setCanvas(c: HTMLCanvasElement): void {
        this.canvas = c
      }
      showConnectionMenu(optPass?: unknown): unknown {
        return null
      }
      addEventListener(): void {
        /* noop */
      }
      removeEventListener(): void {
        /* noop */
      }
      getCanvasMenuOptions(): unknown[] {
        return []
      }
      getNodeMenuOptions(node?: unknown): unknown[] {
        const options = (node as { getExtraMenuOptions?: () => unknown[] } | undefined)
          ?.getExtraMenuOptions?.()
        return Array.isArray(options) ? options : []
      }
      getGroupMenuOptions(): unknown[] {
        return []
      }
      getContextMenuOptions(): unknown[] {
        return []
      }
      getCurrentGraph(): unknown {
        return this.graph ?? window.app.graph
      }
      draw(): void {
        /* noop */
      }
      processKey(): boolean {
        return false
      }
      processMouseDown(): boolean {
        return false
      }
      processMouseMove(): boolean {
        return false
      }
      processMouseUp(): boolean {
        return false
      }
      processMouseWheel(): boolean {
        return false
      }
      copyToClipboard(items?: unknown): void {
        const payload = items ?? Array.from(this.selectedItems)
        try {
          localStorage.setItem("litegraph_clipboard", JSON.stringify(payload))
        } catch {
          /* noop */
        }
      }
      pasteFromClipboard(): unknown {
        try {
          return JSON.parse(localStorage.getItem("litegraph_clipboard") ?? "null")
        } catch {
          return null
        }
      }
      prompt(
        _title: string,
        value: string,
        callback?: (value: string) => void
      ): HTMLInputElement {
        const input = document.createElement("input")
        input.value = value
        callback?.(value)
        return input
      }
      showSearchBox(): HTMLInputElement {
        return this.prompt("Search", "", undefined)
      }
      showEditPropertyValue(): HTMLInputElement {
        return this.prompt("Value", "", undefined)
      }
      createDialog(): HTMLDivElement {
        return document.createElement("div")
      }
      createPanel(): HTMLDivElement {
        return document.createElement("div")
      }
      closePanels(): void {
        /* noop */
      }
      checkPanels(): void {
        /* noop */
      }
      selectNode(node: unknown): void {
        const id = (node as { id?: number | string }).id
        if (id !== undefined) this.selected_nodes[String(id)] = node
        this.selectedItems.add(node)
      }
      selectNodes(nodes: unknown[] = []): void {
        for (const node of nodes) this.selectNode(node)
      }
      deselectNode(node: unknown): void {
        const id = (node as { id?: number | string }).id
        if (id !== undefined) delete this.selected_nodes[String(id)]
        this.selectedItems.delete(node)
      }
      deselectAll(): void {
        this.selected_nodes = {}
        this.selectedItems.clear()
      }
      deselectAllNodes(): void {
        this.deselectAll()
      }
      deleteSelected(): void {
        for (const node of this.selectedItems) {
          ;(this.graph as { remove?: (node: unknown) => void } | null)?.remove?.(node)
        }
        this.deselectAll()
      }
      deleteSelectedNodes(): void {
        this.deleteSelected()
      }
      centerOnNode(node: unknown): void {
        const pos = (node as { pos?: [number, number] }).pos
        if (pos !== undefined) this.ds.offset = [-pos[0], -pos[1]]
      }
      setZoom(value: number): void {
        this.ds.scale = value
      }
      bringToFront(node: unknown): void {
        const graph = this.graph as { nodes?: unknown[] } | null
        if (!Array.isArray(graph?.nodes)) return
        const index = graph.nodes.indexOf(node)
        if (index >= 0) graph.nodes.push(...graph.nodes.splice(index, 1))
      }
      sendToBack(node: unknown): void {
        const graph = this.graph as { nodes?: unknown[] } | null
        if (!Array.isArray(graph?.nodes)) return
        const index = graph.nodes.indexOf(node)
        if (index >= 0) graph.nodes.unshift(...graph.nodes.splice(index, 1))
      }
      processContextMenu(): unknown {
        return new (window.LiteGraph as unknown as { ContextMenu: new (...args: unknown[]) => unknown }).ContextMenu([])
      }
      convertOffsetToCanvas(pos: [number, number]): [number, number] {
        return [
          (pos[0] - this.ds.offset[0]) / this.ds.scale,
          (pos[1] - this.ds.offset[1]) / this.ds.scale,
        ]
      }
      convertCanvasToOffset(pos: [number, number]): [number, number] {
        return [
          pos[0] * this.ds.scale + this.ds.offset[0],
          pos[1] * this.ds.scale + this.ds.offset[1],
        ]
      }
      convertEventToCanvasOffset(event: MouseEvent): [number, number] {
        return this.convertOffsetToCanvas([event.offsetX, event.offsetY])
      }
      isNodeVisible(): boolean {
        return true
      }
      computeVisibleNodes(): unknown[] {
        const nodes = (this.graph as { nodes?: unknown[] } | null)?.nodes ?? []
        this.visible_nodes = [...nodes]
        return this.visible_nodes
      }
    }
    ;(LGraphCanvasImpl as unknown as Record<string, unknown>).node_menu_options =
      []
    ;(
      LGraphCanvasImpl as unknown as Record<string, unknown>
    ).canvas_menu_options = []
    ;(LGraphCanvasImpl as unknown as Record<string, unknown>).link_type_colors ??=
      {}
    ;(LGraphCanvasImpl as unknown as Record<string, unknown>).node_colors ??= {}
    ;(LGraphCanvasImpl as unknown as Record<string, unknown>).active_canvas ??=
      null
    ;(LGraphCanvasImpl as unknown as Record<string, unknown>).search_limit ??= 100
    window.LGraphCanvas = LGraphCanvasImpl as unknown as typeof window.LGraphCanvas
  }

  // LLink — link between nodes
  if (
    typeof (window as unknown as Record<string, unknown>).LLink === "undefined"
  ) {
    class LLinkImpl {
      id = 0
      origin_id = 0
      origin_slot = 0
      target_id = 0
      target_slot = 0
      type = ""
    }
    window.LLink = LLinkImpl
  }

  // LGraphGroup — group container
  if (
    typeof (window as unknown as Record<string, unknown>).LGraphGroup ===
    "undefined"
  ) {
    class LGraphGroupImpl {
      id = 0
      title = ""
      pos: [number, number] = [0, 0]
      size: [number, number] = [0, 0]
      color?: string
      fontSize?: number
      locked?: boolean
      bounding?: [number, number, number, number]
      configure(data?: Record<string, unknown>): void {
        if (data === undefined) return
        this.id = Number(data.id ?? this.id)
        this.title = String(data.title ?? this.title)
        const bounding = data.bounding
        if (Array.isArray(bounding)) {
          this.bounding = [
            Number(bounding[0] ?? 0),
            Number(bounding[1] ?? 0),
            Number(bounding[2] ?? 0),
            Number(bounding[3] ?? 0),
          ]
          this.pos = [this.bounding[0], this.bounding[1]]
          this.size = [this.bounding[2], this.bounding[3]]
        } else {
          const pos = Array.isArray(data.pos) ? data.pos : this.pos
          const size = Array.isArray(data.size) ? data.size : this.size
          this.pos = [Number(pos[0] ?? 0), Number(pos[1] ?? 0)]
          this.size = [Number(size[0] ?? 0), Number(size[1] ?? 0)]
          this.bounding = [this.pos[0], this.pos[1], this.size[0], this.size[1]]
        }
        if (typeof data.color === "string") this.color = data.color
        if (typeof data.fontSize === "number") this.fontSize = data.fontSize
        if (typeof data.locked === "boolean") this.locked = data.locked
      }
      serialize(): Record<string, unknown> {
        return {
          id: this.id,
          title: this.title,
          bounding: this.bounding ?? [this.pos[0], this.pos[1], this.size[0], this.size[1]],
          color: this.color,
          fontSize: this.fontSize,
          locked: this.locked,
        }
      }
    }
    window.LGraphGroup = LGraphGroupImpl
  }
  ;(window.LiteGraph as unknown as Record<string, unknown>).LGraphNode ??=
    window.LGraphNode
  ;(window.LiteGraph as unknown as Record<string, unknown>).LGraph ??=
    window.LGraph
  ;(window.LiteGraph as unknown as Record<string, unknown>).LGraphCanvas ??=
    window.LGraphCanvas
  ;(window.LiteGraph as unknown as Record<string, unknown>).LLink ??=
    window.LLink
  ;(window.LiteGraph as unknown as Record<string, unknown>).LGraphGroup ??=
    window.LGraphGroup
}

import { DEFAULT_BACKEND_URL } from "@/lib/runtime"
import { api as comfyApiInstance } from "@/comfyui/api"
import type { ComfyApi } from "@/comfyui/api"

// Initialize window.api
{
  const w = window as unknown as { api?: ComfyApi }
  w.api ??= comfyApiInstance
}
const apiObj: ComfyApi = window.api
;(apiObj as unknown as Record<string, unknown>).api_base ??= DEFAULT_BACKEND_URL

// Proxy for settingsLookup
const settingsLookupTarget: SettingsLookup = {
  "Comfy.Locale": {
    onChange(): void {
      /* noop */
    },
  },
}
const settingsLookupProxy = new Proxy<SettingsLookup>(settingsLookupTarget, {
  get(target: SettingsLookup, prop: string | symbol): SettingEntry {
    const key: string = typeof prop === "symbol" ? String(prop) : prop
    const existing: SettingEntry | undefined = target[key]
    if (existing !== undefined) {
      return existing
    }
    const fresh: SettingEntry = {
      onChange(): void {
        /* noop */
      },
    }
    target[key] = fresh
    return fresh
  },
})

// Initialize window.app
function createDefaultApp(): ComfyApp {
  const defaultSettings: AppSettings = {
    addSetting(_setting: unknown): unknown {
      return {}
    },
    getSettingValue(_id: string): unknown {
      return null
    },
    setSettingValue(_id: string, _value: unknown): void {
      /* noop */
    },
    settingsLookup: settingsLookupProxy,
    addEventListener(_type: string, _listener: (e: unknown) => void): void {
      /* noop */
    },
    removeEventListener(_type: string, _listener: (e: unknown) => void): void {
      /* noop */
    },
  }

  const stubGraph: LGraph = Object.assign(
    Object.create(
      (window as unknown as { LGraph?: { prototype: unknown } }).LGraph?.prototype ?? Object.prototype
    ),
    {
      _nodes_by_id: {},
      links: {},
      groups: [],
      nodes: [],
      revision: 0,
      status: 0,
      id: 0,
      add(_node: unknown): void {
        /* noop */
      },
      remove(_node: unknown): void {
        /* noop */
      },
      clear(): void {
        /* noop */
      },
      getNodeById(_id: number | string): undefined {
        return undefined
      },
      setDirtyCanvas(_flag?: boolean, _history?: boolean): void {
        /* noop */
      },
      onAfterChange: undefined,
    }
  ) as unknown as LGraph

  const stubCanvas: LGraphCanvas = Object.assign(
    Object.create(
      (window as unknown as { LGraphCanvas?: { prototype: unknown } }).LGraphCanvas?.prototype ?? Object.prototype
    ),
    {
      state: { readOnly: false },
      graph: stubGraph,
      ds: { scale: 1, offset: [0, 0] },
      resize(_w?: number, _h?: number): void {
        /* noop */
      },
      setDirty(_canvas?: boolean, _history?: boolean): void {
        /* noop */
      },
      stopRendering(): void {
        /* noop */
      },
      startRendering(): void {
        /* noop */
      },
      setCanvas(_canvas: HTMLCanvasElement): void {
        /* noop */
      },
      render_canvas_border: false,
      graph_mouse: [0, 0],
      canvas: null,
    }
  ) as unknown as LGraphCanvas

  const app: ComfyApp = {
    graph: stubGraph,
    canvas: stubCanvas,
    syncGraph(): void {
      // No-op: Zustand store가 single source of truth이므로 sync 필요 없음
    },
    ui: {
      dialogs: {},
      dialog: {
        show(): void {
          /* noop */
        },
      },
      settings: defaultSettings,
      menu: {
        get element(): HTMLElement | null {
          return document.querySelector(".comfy-menu") as HTMLElement | null
        },
      },
      get menuContainer(): HTMLElement | null {
        return document.querySelector(".comfy-menu-container") as HTMLElement | null
      },
    },
    settings: defaultSettings,
    extensions: [],
    widgets: {
      STRING(node: unknown, name: string, inputData: unknown[]): unknown {
        const n = node as { addWidget?: (type: string, name: string, value: unknown, cb: () => void, opts?: unknown) => unknown }
        const cfg = (inputData?.[1] as Record<string, unknown>) ?? {}
        return n.addWidget?.("text", name, (cfg.default as string) ?? "", () => undefined, cfg)
      },
      INT(node: unknown, name: string, inputData: unknown[]): unknown {
        const n = node as { addWidget?: (type: string, name: string, value: unknown, cb: () => void, opts?: unknown) => unknown }
        const cfg = (inputData?.[1] as Record<string, unknown>) ?? {}
        return n.addWidget?.("number", name, (cfg.default as number) ?? 0, () => undefined, cfg)
      },
      FLOAT(node: unknown, name: string, inputData: unknown[]): unknown {
        const n = node as { addWidget?: (type: string, name: string, value: unknown, cb: () => void, opts?: unknown) => unknown }
        const cfg = (inputData?.[1] as Record<string, unknown>) ?? {}
        return n.addWidget?.("number", name, (cfg.default as number) ?? 0, () => undefined, cfg)
      },
      COMBO(node: unknown, name: string, inputData: unknown[]): unknown {
        const n = node as { addWidget?: (type: string, name: string, value: unknown, cb: () => void, opts?: unknown) => unknown }
        const values = Array.isArray(inputData?.[0]) ? (inputData[0] as unknown[]) : []
        const cfg = (inputData?.[1] as Record<string, unknown>) ?? {}
        return n.addWidget?.("combo", name, values[0] ?? "", () => undefined, { values, ...cfg })
      },
      BOOLEAN(node: unknown, name: string, inputData: unknown[]): unknown {
        const n = node as { addWidget?: (type: string, name: string, value: unknown, cb: () => void, opts?: unknown) => unknown }
        const cfg = (inputData?.[1] as Record<string, unknown>) ?? {}
        return n.addWidget?.("toggle", name, (cfg.default as boolean) ?? false, () => undefined, cfg)
      },
    },
    registerExtension(ext: ComfyExtension): void {
      if (!app.extensions.includes(ext)) {
        app.extensions.push(ext)
      }
      if (app.extensionManager.registerExtension !== undefined) {
        console.log(
          `[CEG] registerExtension: "${ext.name}" -> extensionManager.registerExtension (has onNodeCreated=${typeof ext.nodeCreated} has beforeRegisterNodeDef=${typeof ext.beforeRegisterNodeDef})`
        )
        app.extensionManager.registerExtension(ext)
      } else {
        console.log(
          `[CEG] registerExtension: "${ext.name}" -> app.extensions.push (extManager has no registerExtension)`
        )
      }
    },
    extensionManager: {
      command: {
        commands: [],
      },
    },
  }

  return app
}
if ((window as { app?: ComfyApp }).app === undefined) {
  window.app = createDefaultApp()
}
const appObj: ComfyApp = window.app

// installSettingValueHook
const installSettingValueHook = (settingsObj: AppSettings): void => {
  const originalGet: (id: string) => unknown =
    settingsObj.getSettingValue.bind(settingsObj)
  settingsObj.getSettingValue = function (
    this: AppSettings,
    id: string
  ): unknown {
    const val: unknown = originalGet(id)
    if (id === "Comfy.CustomColorPalettes") {
      if (
        val === null ||
        val === undefined ||
        val === "undefined" ||
        val === "null"
      ) {
        return {}
      }
      if (typeof val === "string") {
        try {
          let parsed: unknown = JSON.parse(val)
          while (typeof parsed === "string") {
            parsed = JSON.parse(parsed)
          }
          if (typeof parsed !== "object" || parsed === null) {
            return {}
          }
          return parsed
        } catch {
          return {}
        }
      }
    }
    return val
  }
}

let _installingHook = false

const installApiSettingsHook = (apiInstance: unknown): void => {
  if (_installingHook) return
  _installingHook = true
  const inst = apiInstance as Record<string, unknown>
  const originalGetSettings = inst.getSettings as
    | (() => Promise<Record<string, unknown>>)
    | undefined
  const wrappedGetSettings = async (): Promise<Record<string, unknown>> => {
    const settings: Record<string, unknown> =
      originalGetSettings !== undefined ? await originalGetSettings() : {}
    const paletteVal: unknown = settings["Comfy.CustomColorPalettes"]
    if (typeof paletteVal === "string") {
      try {
        let parsed: unknown = JSON.parse(paletteVal)
        while (typeof parsed === "string") {
          parsed = JSON.parse(parsed)
        }
        if (typeof parsed === "object" && parsed !== null) {
          settings["Comfy.CustomColorPalettes"] = parsed
        } else {
          settings["Comfy.CustomColorPalettes"] = {}
        }
      } catch {
        settings["Comfy.CustomColorPalettes"] = {}
      }
    }
    return settings
  }
  inst.getSettings = wrappedGetSettings
  _installingHook = false
}

// getSettings dynamic binding
let _getSettings: unknown = (apiObj as unknown as Record<string, unknown>)
  .getSettings
Object.defineProperty(apiObj, "getSettings", {
  get(): unknown {
    return _getSettings
  },
  set(newGetSettings: unknown): void {
    _getSettings = newGetSettings
    installApiSettingsHook(apiObj)
  },
  configurable: true,
})
installApiSettingsHook(apiObj)

// app.ui and app.settings property guards
let _appUi: ComfyAppUI = appObj.ui
let _appSettings: AppSettings = appObj.settings

_appUi.dialogs = {}
_appUi.dialog = {
  show(): void {
    /* noop */
  },
}
_appUi.settings = {
  addSetting(_setting: unknown): unknown {
    return {}
  },
  getSettingValue(_id: string): unknown {
    return null
  },
  setSettingValue(_id: string, _value: unknown): void {
    /* noop */
  },
  settingsLookup: settingsLookupProxy,
  addEventListener(_type: string, _listener: (e: unknown) => void): void {
    /* noop */
  },
  removeEventListener(_type: string, _listener: (e: unknown) => void): void {
    /* noop */
  },
}
_appSettings.addSetting = (_setting: unknown): unknown => ({})
_appSettings.getSettingValue = (_id: string): unknown => null
_appSettings.setSettingValue = (_id: string, _value: unknown): void => {
  /* noop */
}
_appSettings.settingsLookup = settingsLookupProxy
;(_appSettings as unknown as { addEventListener?: unknown }).addEventListener = (
  _type: string,
  _listener: (e: unknown) => void
): void => {
  /* noop */
}
;(_appSettings as unknown as { removeEventListener?: unknown }).removeEventListener = (
  _type: string,
  _listener: (e: unknown) => void
): void => {
  /* noop */
}

installSettingValueHook(_appUi.settings)
installSettingValueHook(_appSettings)

Object.defineProperty(appObj, "ui", {
  get(): ComfyAppUI {
    return _appUi
  },
  set(newUi: ComfyAppUI): void {
    _appUi = newUi
    const newUiR = newUi as unknown as Record<string, unknown>
    if (newUiR.settings === undefined) {
      let _uiSettings: AppSettings | undefined
      Object.defineProperty(newUi, "settings", {
        get(): AppSettings | undefined {
          return _uiSettings
        },
        set(ns: AppSettings): void {
          _uiSettings = ns
          installSettingValueHook(ns)
        },
        configurable: true,
      })
    } else {
      installSettingValueHook(newUi.settings)
    }
  },
  configurable: true,
})

Object.defineProperty(appObj, "settings", {
  get(): AppSettings {
    return _appSettings
  },
  set(newSettings: AppSettings): void {
    _appSettings = newSettings
    installSettingValueHook(newSettings)
  },
  configurable: true,
})

// Re-assign stub graph/canvas (same shape as createDefaultApp)
appObj.graph = Object.assign(
  Object.create(
    (window as unknown as { LGraph?: { prototype: unknown } }).LGraph?.prototype ?? Object.prototype
  ),
  {
    _nodes_by_id: {},
    links: {},
    groups: [],
    nodes: [],
    revision: 0,
    status: 0,
    id: 0,
    add() {
      /* noop */
    },
    remove() {
      /* noop */
    },
    clear() {
      /* noop */
    },
    getNodeById() {
      return undefined
    },
    setDirtyCanvas() {
      /* noop */
    },
    onAfterChange: undefined,
  }
) as unknown as LGraph
appObj.canvas = Object.assign(
  Object.create(
    (window as unknown as { LGraphCanvas?: { prototype: unknown } }).LGraphCanvas?.prototype ?? Object.prototype
  ),
  {
    state: { readOnly: false },
    graph: appObj.graph,
    ds: { scale: 1, offset: [0, 0] },
    resize() {
      /* noop */
    },
    setDirty() {
      /* noop */
    },
    stopRendering() {
      /* noop */
    },
    startRendering() {
      /* noop */
    },
    setCanvas() {
      /* noop */
    },
    render_canvas_border: false,
    graph_mouse: [0, 0],
    canvas: null,
  }
) as unknown as LGraphCanvas
appObj.syncGraph = (): void => {
  // No-op: Zustand store가 single source of truth이므로 sync 필요 없음
}

// 필수 브라우저 글로벌 스텁 설정
{
  const w = window as unknown as Record<string, unknown>

  // Create dummy .comfy-menu and .comfy-menu-container to prevent third-party extensions (like ComfyUI-Manager) from crashing
  if (typeof document !== "undefined") {
    const checkAndCreateMenu = (): void => {
      let menuEl = document.querySelector(".comfy-menu")
      if (!menuEl) {
        menuEl = document.createElement("div")
        menuEl.className = "comfy-menu"
        ;(menuEl as HTMLElement).style.display = "none"
        document.body.appendChild(menuEl)
      }
      let containerEl = document.querySelector(".comfy-menu-container")
      if (!containerEl) {
        containerEl = document.createElement("div")
        containerEl.className = "comfy-menu-container"
        ;(containerEl as HTMLElement).style.display = "none"
        document.body.appendChild(containerEl)
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", checkAndCreateMenu)
    } else {
      checkAndCreateMenu()
    }

    const originalGetElementById = document.getElementById.bind(document)
    document.getElementById = function (id: string): HTMLElement | null {
      const el = originalGetElementById(id)
      if (el !== null) return el

      const fallbackIds: Record<string, string> = {
        "comfy-load-button": "button",
        "comfy-save-button": "button",
        "comfy-clear-button": "button",
        "comfy-load-default-button": "button",
        "comfy-file-input": "input",
        "comfy-settings-button": "button",
        "comfy-user-button": "button",
        "graph-canvas": "canvas",
      }

      if (id in fallbackIds) {
        const tagName = fallbackIds[id]
        if (tagName !== undefined) {
          console.log(`[CEG] document.getElementById("${id}") fallback triggered`)
          let fallbackEl = document.querySelector(`[data-ceg-fallback-id="${id}"]`)
          if (fallbackEl === null) {
            fallbackEl = document.createElement(tagName)
            fallbackEl.setAttribute("data-ceg-fallback-id", id)
            if (id === "comfy-file-input") {
              ;(fallbackEl as HTMLInputElement).type = "file"
            }
            ;(fallbackEl as HTMLElement).style.display = "none"
            document.body.appendChild(fallbackEl)
          }
          return fallbackEl as HTMLElement
        }
      }
      return null
    }

    const originalQuerySelector = document.querySelector.bind(document)
    document.querySelector = function (selector: string): Element | null {
      const el = originalQuerySelector(selector)
      if (el !== null) return el

      if (selector === ".comfy-settings-btn") {
        console.log(`[CEG] document.querySelector("${selector}") fallback triggered`)
        let fallbackEl = originalQuerySelector('[data-ceg-fallback-class="comfy-settings-btn"]')
        if (fallbackEl === null) {
          fallbackEl = document.createElement("button")
          fallbackEl.setAttribute("data-ceg-fallback-class", "comfy-settings-btn")
          ;(fallbackEl as HTMLElement).style.display = "none"
          document.body.appendChild(fallbackEl)
        }
        return fallbackEl
      }
      return null
    }
  }

  if (w.$el === undefined) {
    w.$el = (
      tag: string,
      propsOrChildren:
        | Record<string, object | string | number | boolean | null | undefined>
        | HTMLElement
        | HTMLElement[]
        | string
        | string[]
        | null
        | undefined,
      children?: HTMLElement | HTMLElement[] | string | string[]
    ): HTMLElement => {
      const parts = tag.split(".")
      const el: HTMLElement = document.createElement(parts.shift() || "div")
      if (parts.length > 0) el.classList.add(...parts)
      const appendChildren = (
        target: HTMLElement,
        value?: HTMLElement | HTMLElement[] | string | string[]
      ): void => {
        if (value === undefined) return
        target.append(...(Array.isArray(value) ? value : [value]))
      }
      if (typeof propsOrChildren === "string") {
        el.textContent = propsOrChildren
      } else if (propsOrChildren instanceof HTMLElement) {
        el.append(propsOrChildren)
      } else if (Array.isArray(propsOrChildren)) {
        el.append(...propsOrChildren)
      } else if (propsOrChildren !== null && propsOrChildren !== undefined) {
        const attrs = propsOrChildren
        const parent = attrs.parent
        const callback = attrs.$
        const dataset = attrs.dataset
        const style = attrs.style
        for (const [k, v] of Object.entries(attrs)) {
          if (["parent", "$", "dataset", "style"].includes(k)) continue
          if (k === "style" && typeof v === "object" && v !== null) {
            Object.assign(el.style, v)
          } else if (k === "for") {
            el.setAttribute("for", String(v))
          } else {
            const elRec = el as object as Record<
              string,
              object | string | number | boolean | null | undefined
            >
            elRec[k] = v
          }
        }
        if (typeof style === "object" && style !== null) {
          Object.assign(el.style, style)
        }
        if (typeof dataset === "object" && dataset !== null) {
          Object.assign(el.dataset, dataset)
        }
        appendChildren(el, children)
        if (parent instanceof HTMLElement) parent.append(el)
        if (typeof callback === "function") callback(el)
      }
      return el
    }
  }

  if (w.addStylesheet === undefined) {
    w.addStylesheet = (url: string, relativeTo?: string | URL): Promise<void> => {
      const link: HTMLLinkElement = document.createElement("link")
      link.rel = "stylesheet"
      const cssUrl = url.endsWith(".js") ? `${url.slice(0, -3)}.css` : url
      link.href =
        relativeTo !== undefined
          ? new URL(cssUrl, relativeTo).toString()
          : new URL(cssUrl, window.location.href).toString()
      document.head.appendChild(link)
      return new Promise((resolve) => {
        link.onload = (): void => resolve()
        link.onerror = (): void => resolve()
        if (link.sheet !== null) resolve()
      })
    }
  }

  if (w.getUrl === undefined) {
    w.getUrl = (path: string, base?: string | URL): string => {
      return base !== undefined ? new URL(path, base).toString() : path
    }
  }

  if (w.ComfyWidgets === undefined) {
    w.ComfyWidgets = {
      STRING: (): { widget: { inputEl: Record<string, unknown> } } => ({
        widget: { inputEl: {} },
      }),
      INT: (): { widget: { inputEl: Record<string, unknown> } } => ({
        widget: { inputEl: {} },
      }),
      FLOAT: (): { widget: { inputEl: Record<string, unknown> } } => ({
        widget: { inputEl: {} },
      }),
      COMBO: (): { widget: { inputEl: Record<string, unknown> } } => ({
        widget: { inputEl: {} },
      }),
      BOOLEAN: (): { widget: { inputEl: Record<string, unknown> } } => ({
        widget: { inputEl: {} },
      }),
    }
  }

  const helpDOM = (w.helpDOM ?? {}) as {
    addHelp?: (
      target: HTMLElement | object | null | undefined,
      content?: string | HTMLElement
    ) => HTMLElement
    removeHelp?: (target?: HTMLElement | null) => void
  }
  helpDOM.addHelp ??= (
    target: HTMLElement | object | null | undefined,
    content?: string | HTMLElement
  ): HTMLElement => {
    const help = document.createElement("div")
    help.className = "ceg-extension-help"
    help.style.display = "none"
    if (typeof content === "string") {
      help.textContent = content
    } else if (content instanceof HTMLElement) {
      help.appendChild(content)
    }
    if (target instanceof HTMLElement) {
      target.appendChild(help)
    }
    return help
  }
  helpDOM.removeHelp ??= (target?: HTMLElement | null): void => {
    target?.querySelectorAll(".ceg-extension-help").forEach((el) => el.remove())
  }
  w.helpDOM = helpDOM

  // Mock constructors with dummy properties to avoid no-extraneous-class
  if (w.ComfyApp === undefined) {
    w.ComfyApp = class {
      readonly __ceg = true
    }
  }

  if (w.ComfyDialog === undefined) {
    w.ComfyDialog = class {
      readonly __ceg = true
    }
  }

  if (w.ClipspaceDialog === undefined) {
    w.ClipspaceDialog = class {
      readonly __ceg = true
    }
  }

  if (w.isBeforeFrontendVersion === undefined) {
    w.isBeforeFrontendVersion = (): boolean => false
  }

  window.comfyAPI ??= {} as ComfyAPIObject
  const comfyAPI = window.comfyAPI
  comfyAPI.app ??= { app: window.app }
  comfyAPI.api ??= { api: window.api }
  comfyAPI.utils ??= {
    applyTextReplacements: (_node: object, text: string): string => text,
  }
  comfyAPI.ui ??= {
    ComfyDialog: class {
      __ceg = true
    },
    $el: window.$el,
    ComfyUI: class {
      __ceg = true
    },
  }
  comfyAPI.widgets ??= {
    updateControlWidgetLabel(): void {
      /* noop */
    },
    IS_CONTROL_WIDGET(): void {
      /* noop */
    },
    addValueControlWidget(): void {
      /* noop */
    },
    addValueControlWidgets(): void {
      /* noop */
    },
    ComfyWidgets: window.ComfyWidgets,
    isValidWidgetType(): void {
      /* noop */
    },
  }
  const widgetConfigSymbol = Symbol.for("Comfy.WidgetConfig")
  const widgetGetConfigSymbol = Symbol.for("Comfy.GetWidgetConfig")
  class CorePrimitiveNode extends window.LGraphNode {
    serialize_widgets = true
    isVirtualNode = true
    constructor(title = "Primitive") {
      super(title)
      this.type = "PrimitiveNode"
      this.title = title
      if (this.outputs.length === 0) {
        this.addOutput("connect to widget input", "*")
      }
      if (!this.properties || !("Run widget replace on values" in this.properties)) {
        this.addProperty("Run widget replace on values", false, "boolean")
      }
    }
    applyToGraph(): void {
      /* Value propagation is handled during prompt serialization in this frontend. */
    }
    refreshComboInNode(): void {
      const widget = this.widgets?.[0] as
        | { type?: string; value?: unknown; options?: { values?: unknown[] } }
        | undefined
      const output = this.outputs[0] as
        | { widget?: { [widgetGetConfigSymbol]?: () => [unknown, { values?: unknown[] }] } }
        | undefined
      if (widget?.type !== "combo") return
      const values = output?.widget?.[widgetGetConfigSymbol]?.()?.[1]?.values
      if (Array.isArray(values)) {
        widget.options ??= {}
        widget.options.values = values
        if (!values.includes(widget.value)) widget.value = values[0]
      }
    }
  }
  Object.assign(CorePrimitiveNode, {
    title: "Primitive",
    category: "utilities/primitive",
    type: "PrimitiveNode",
    comfyClass: "PrimitiveNode",
  })
  if (window.LiteGraph.getNodeType?.("PrimitiveNode") === undefined) {
    window.LiteGraph.registerNodeType(
      "PrimitiveNode",
      CorePrimitiveNode as unknown as new (...args: unknown[]) => unknown
    )
  }
  comfyAPI.widgetInputs ??= {
    PrimitiveNode: CorePrimitiveNode as unknown as new () => object,
    getWidgetConfig: (
      slot?: { widget?: Record<PropertyKey, unknown> | null }
    ): [unknown, Record<string, unknown>] => {
      const widget = slot?.widget
      const config = widget?.[widgetConfigSymbol]
      const getConfig = widget?.[widgetGetConfigSymbol]
      if (Array.isArray(config)) return config as [unknown, Record<string, unknown>]
      if (typeof getConfig === "function") {
        const value = (getConfig as () => unknown)()
        if (Array.isArray(value)) return value as [unknown, Record<string, unknown>]
      }
      return ["*", {}]
    },
    convertToInput: (
      node?: LGraphNode,
      widget?: { name?: string; type?: string }
    ): LGraphNodeInput | undefined => {
      if (node === undefined || widget?.name === undefined) return undefined
      const existing = node.inputs.find((slot) => slot.widget?.name === widget.name)
      if (existing !== undefined) return existing
      const input = {
        name: widget.name,
        localized_name: widget.name,
        type: widget.type ?? "*",
        link: null,
        widget: { name: widget.name },
      }
      node.inputs.push(input)
      return input
    },
    setWidgetConfig: (
      slot?: { widget?: Record<PropertyKey, unknown> | null },
      config?: [unknown, Record<string, unknown>]
    ): void => {
      if (slot?.widget === undefined || slot.widget === null) return
      if (config === undefined) {
        delete slot.widget[widgetConfigSymbol]
        delete slot.widget[widgetGetConfigSymbol]
      } else {
        slot.widget[widgetConfigSymbol] = config
        slot.widget[widgetGetConfigSymbol] = (): [unknown, Record<string, unknown>] =>
          config
      }
    },
    mergeIfValid: (
      output?: { widget?: Record<PropertyKey, unknown> | null },
      config?: [unknown, Record<string, unknown>]
    ): [unknown, Record<string, unknown>] | undefined => {
      if (config === undefined) return undefined
      const current = comfyAPI.widgetInputs?.getWidgetConfig(output)
      if (!Array.isArray(current)) return config
      return [
        current[0] === "*" ? config[0] : current[0],
        {
          ...(current[1] as Record<string, unknown>),
          ...(config[1] as Record<string, unknown>),
        },
      ]
    },
  }
  comfyAPI.groupNode ??= {
    GroupNodeConfig: class {
      static registerFromWorkflow(): Promise<void> {
        return Promise.resolve()
      }
      __ceg = true
    },
    GroupNodeHandler: class {
      __ceg = true
    },
  }
  comfyAPI.pnginfo ??= {
    getPngMetadata: (): Promise<Record<string, unknown>> => Promise.resolve({}),
    getWebpMetadata: (): Promise<Record<string, unknown>> =>
      Promise.resolve({}),
  }
  comfyAPI.editAttention ??= {
    incrementWeight(weight: string, delta: number): string {
      const floatWeight = parseFloat(weight)
      if (isNaN(floatWeight)) return weight
      const newWeight = floatWeight + delta
      return String(Number(newWeight.toFixed(10)))
    },
    findNearestEnclosure(
      text: string,
      cursorPos: number
    ): { start: number; end: number } | null {
      let start = cursorPos
      let end = cursorPos
      let openCount = 0
      let closeCount = 0

      if (text[cursorPos] === "(") {
        end = cursorPos + 1
      } else {
        while (start >= 0) {
          start--
          if (text[start] === "(" && openCount === closeCount) break
          if (text[start] === "(") openCount++
          if (text[start] === ")") closeCount++
        }
        if (start < 0) return null
        openCount = 0
        closeCount = 0
      }

      while (end < text.length) {
        if (text[end] === ")" && openCount === closeCount) break
        if (text[end] === "(") openCount++
        if (text[end] === ")") closeCount++
        end++
      }
      if (end === text.length) return null

      return { start: start + 1, end }
    },
    addWeightToParentheses(text: string): string {
      const regex = /^\((.*)\)$/
      const parenMatch = regex.exec(text)
      if (parenMatch === null) return text
      const innerText = parenMatch[1]
      if (innerText === undefined) return text
      const looksLikeTime = /(?:^|\s)\d{1,2}:\d{2}$/.test(innerText)
      const hasTrailingWeight =
        !looksLikeTime &&
        /:[+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?$/.test(innerText)
      return hasTrailingWeight ? text : `(${innerText}:1.0)`
    },
  }
  comfyAPI.widgetValuePropagation ??= {
    applyFirstWidgetValueToGraph(
      node: LGraphNode | null | undefined,
      extraLinks: LLink[] = [],
      transformValue?: (value: unknown) => unknown
    ): void {
      if (node === null || node === undefined) return
      if (
        node.outputs.length === 0 ||
        node.graph === null ||
        node.graph === undefined
      ) {
        return
      }

      const output = node.outputs[0]
      if (output === undefined) return

      const links = output.links
      if (links === null || links.length === 0) {
        return
      }

      const sourceWidget = node.widgets?.[0]
      if (sourceWidget === undefined) return

      let value = sourceWidget.value
      if (transformValue !== undefined) {
        value = transformValue(value)
      }

      const graphMouse: [number, number] = window.app.canvas.graph_mouse ?? [
        0, 0,
      ]

      const graphLinks = node.graph.links
      const resolvedLinks: LLink[] = []

      if (Array.isArray(links)) {
        for (const linkId of links) {
          let link: LLink | undefined
          if (graphLinks instanceof Map) {
            link = graphLinks.get(linkId)
          } else {
            link = (graphLinks as Record<number, LLink | undefined>)[linkId]
          }
          if (link !== undefined) {
            resolvedLinks.push(link)
          }
        }
      }

      const allLinks = [...resolvedLinks, ...extraLinks]

      for (const link of allLinks) {
        const linkInfo = link

        const targetNode = node.graph.getNodeById(linkInfo.target_id)
        if (targetNode === undefined) {
          continue
        }

        const input = targetNode.inputs[linkInfo.target_slot]
        if (input === undefined) continue

        const widgetName = input.widget?.name
        if (widgetName === undefined || widgetName === "") continue

        const targetWidget = targetNode.widgets?.find(
          (w) => w.name === widgetName
        )
        if (targetWidget === undefined) continue

        targetWidget.value = value
        if (targetWidget.callback !== null) {
          targetWidget.callback(
            targetWidget.value,
            window.app.canvas,
            targetNode,
            graphMouse,
            {}
          )
        }
      }
    },
  }

  comfyAPI.groupNodeManage ??= {
    ManageGroupDialog: class {
      __ceg = true
      show(_e?: object): void {
        /* noop */
      }
    },
  }

  const SUPPORTED_EXTENSIONS = new Set([
    ".gltf",
    ".glb",
    ".obj",
    ".fbx",
    ".stl",
    ".spz",
    ".splat",
    ".ply",
    ".ksplat",
  ])
  const SUPPORTED_HDRI_EXTENSIONS = new Set([".hdr", ".exr"])

  comfyAPI.constants ??= {
    iconsHtml: {
      pen: `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M10.97,15.98v14.04c0,.825.675,1.5,1.5,1.5h23.07c.825,0,1.5-.675,1.5-1.5V15.98c0-.825-.675-1.5-1.5-1.5H12.47c-.825,0-1.5.675-1.5,1.5ZM25.79,28.16c-4.365,1.41-8.355-2.58-6.945-6.945.51-1.575,1.785-2.85,3.36-3.36,4.365-1.41,8.355,2.58,6.945,6.945-.51,1.575-1.785,2.85-3.36,3.36Z"/>
        </svg>
      `,
      eraser: `
        <svg viewBox="0 0 44 44">
          <g>
            <rect class="cls-2" x="16.68" y="10" width="10.63" height="24" rx="1.16" ry="1.16" transform="translate(22 -9.11) rotate(45)"/>
            <path class="cls-1" d="M17.27,34.27c-.42,0-.85-.16-1.17-.48l-5.88-5.88c-.31-.31-.48-.73-.48-1.17s.17-.86.48-1.17l15.34-15.34c.62-.62,1.72-.62,2.34,0l5.88,5.88c.65.65.65,1.7,0,2.34l-15.34,15.34c-.32.32-.75.48-1.17.48ZM26.73,10.73c-.18,0-.34.07-.46.19l-15.34,15.34c-.12.12-.19.29-.19.46s.07.34.19.46l5.88,5.88c.26.26.67.26.93,0l15.34-15.34c.26-.26.26-.67,0-.93l-5.88-5.88c-.12-.12-.29-.19-.46-.19Z"/>
          </g>
          <path class="cls-3" d="M20.33,11.03h8.32c.64,0,1.16.52,1.16,1.16v15.79h-10.63v-15.79c0-.64.52-1.16,1.16-1.16Z" transform="translate(20.97 -11.61) rotate(45)"/>
        </svg>
      `,
      paintBucket: `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M33.4,21.76l-11.42,11.41-.04.05c-.61.61-1.6.61-2.21,0l-8.91-8.91c-.61-.61-.61-1.6,0-2.21l.04-.05.3-.29h22.24Z"/>
          <path class="cls-1" d="M20.83,34.17c-.55,0-1.07-.21-1.46-.6l-8.91-8.91c-.8-.8-.8-2.11,0-2.92l11.31-11.31c.8-.8,2.11-.8,2.92,0l8.91,8.91c.39.39.6.91.6,1.46s-.21,1.07-.6,1.46l-11.31,11.31c-.39.39-.91.6-1.46.6ZM23.24,10.83c-.27,0-.54.1-.75.31l-11.31,11.31c-.41.41-.41,1.09,0,1.5l8.91,8.91c.4.4,1.1.4,1.5,0l11.31-11.31c.2-.2.31-.47.31-.75s-.11-.55-.31-.75l-8.91-8.91c-.21-.21-.48-.31-.75-.31Z"/><path class="cls-1" d="M34.28,26.85c0,.84-.68,1.52-1.52,1.52s-1.52-.68-1.52-1.52,1.52-2.86,1.52-2.86c0,0,1.52,2.02,1.52,2.86Z"/>
        </svg>
      `,
      colorSelect: `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M30.29,13.72c-1.09-1.1-2.85-1.09-3.94,0l-2.88,2.88-.75-.75c-.2-.19-.51-.19-.71,0-.19.2-.19.51,0,.71l1.4,1.4-9.59,9.59c-.35.36-.54.82-.54,1.32,0,.14,0,.28.05.41-.05.04-.1.08-.15.13-.39.39-.39,1.01,0,1.4.38.39,1.01.39,1.4,0,.04-.04.08-.09.11-.13.14.04.3.06.45.06.5,0,.97-.19,1.32-.55l9.59-9.59,1.38,1.38c.1.09.22.14.35.14s.26-.05.35-.14c.2-.2.2-.52,0-.71l-.71-.72,2.88-2.89c1.08-1.08,1.08-2.85-.01-3.94ZM19.43,25.82h-2.46l7.15-7.15,1.23,1.23-5.92,5.92Z"/>
        </svg>
      `,
      rgbPaint: `
        <svg viewBox="0 0 44 44">
          <path class="cls-1" d="M34,13.93c0,.47-.19.94-.55,1.31l-13.02,13.04c-.09.07-.18.15-.27.22-.07-1.39-1.21-2.48-2.61-2.49.07-.12.16-.24.27-.34l13.04-13.04c.72-.72,1.89-.72,2.6,0,.35.35.55.83.55,1.3Z"/>
          <path class="cls-1" d="M19.64,29.03c0,4.46-6.46,3.18-9.64,0,3.3-.47,4.75-2.58,7.06-2.58,1.43,0,2.58,1.16,2.58,2.58Z"/>
        </svg>
      `,
    },
    SUPPORTED_EXTENSIONS,
    SUPPORTED_EXTENSIONS_ACCEPT: [...SUPPORTED_EXTENSIONS].join(","),
    SUPPORTED_HDRI_EXTENSIONS,
    SUPPORTED_HDRI_EXTENSIONS_ACCEPT: [...SUPPORTED_HDRI_EXTENSIONS].join(","),
    LOAD3D_NONE_MODEL: "none",
  }

  comfyAPI.types ??= {
    BrushShape: {
      Arc: "arc",
      Rect: "rect",
    },
    Tools: {
      MaskPen: "pen",
      PaintPen: "rgbPaint",
      Eraser: "eraser",
      MaskBucket: "paintBucket",
      MaskColorFill: "colorSelect",
    },
    allTools: ["pen", "rgbPaint", "eraser", "paintBucket", "colorSelect"],
    CompositionOperation: {
      SourceOver: "source-over",
      DestinationOut: "destination-out",
    },
    MaskBlendMode: {
      Black: "black",
      White: "white",
      Negative: "negative",
    },
    ColorComparisonMethod: {
      Simple: "simple",
      HSL: "hsl",
      LAB: "lab",
    },
  }

  const createRecursiveProxy = (name: string): object => {
    function ComfyApiCompatStub(
      this: Record<string, unknown> | undefined
    ): void {
      if (this !== undefined) {
        this.__cegCompatName = name
      }
    }
    const fn = ComfyApiCompatStub as unknown as {
      (...args: unknown[]): void
      new (...args: unknown[]): Record<string, unknown>
    }
    Object.defineProperty(fn, "name", {
      value: name.replace(/[^A-Za-z0-9_$]/g, "_") || "ComfyApiCompatStub",
      configurable: true,
    })
    fn.prototype ??= {}
    const handler: ProxyHandler<typeof fn> = {
      apply(): void {
        /* noop */
      },
      construct(): Record<string, unknown> {
        return { __cegCompatName: name }
      },
      get(target, prop, receiver): object | string | boolean | undefined {
        if (prop === Symbol.toStringTag) return "ComfyApiCompatStub"
        if (prop === "__esModule") return true
        if (prop === "default") return createRecursiveProxy(name)
        if (prop === "prototype") {
          const val = Reflect.get(target, prop, receiver) as object | undefined
          return val ?? {}
        }
        if (prop === "then") return undefined
        if (prop === name) {
          return createRecursiveProxy(name)
        }
        return createRecursiveProxy(String(prop))
      },
    }
    return new Proxy(fn, handler)
  }

  const comfyAPIHandler: ProxyHandler<ComfyAPIObject> = {
    get(target, prop, receiver): object {
      if (prop in target) {
        const val = Reflect.get(target, prop, receiver) as object | undefined
        return val ?? {}
      }
      if (typeof prop === "string") {
        return createRecursiveProxy(prop)
      }
      const val = Reflect.get(target, prop, receiver) as object | undefined
      return val ?? {}
    },
  }

  window.comfyAPI = new Proxy(comfyAPI, comfyAPIHandler)

  // Second ClipspaceDialog check
  if (w.ClipspaceDialog === undefined) {
    w.ClipspaceDialog = class {
      static registerButton(): void {
        /* noop */
      }
      readonly __ceg = true
    }
  } else {
    const cdClass = w.ClipspaceDialog as { registerButton?: () => void }
    cdClass.registerButton ??= (): void => {
      /* noop */
    }
  }

  if (w.Exposed === undefined) {
    w.Exposed = (): void => {
      /* noop */
    }
  }

  if (w.CONFIG_SERVICE === undefined) {
    w.CONFIG_SERVICE = {
      getConfigValue: (): unknown => null,
      addEventListener: (): void => {
        /* noop */
      },
    }
  }

  if (w.ue_callbacks === undefined) {
    w.ue_callbacks = {
      register_allnode_callback: (): void => {
        /* noop */
      },
      register_allgraph_callback: (): void => {
        /* noop */
      },
    }
  }

  if (w.create === undefined) {
    w.create = (
      tag: string,
      clss: string,
      parent: HTMLElement | null,
      properties?: Record<string, unknown>
    ): HTMLElement => {
      const nd: HTMLElement = document.createElement(tag)
      if (clss !== "") {
        clss.split(" ").forEach((s: string): void => {
          nd.classList.add(s)
        })
      }
      if (parent !== null) {
        parent.appendChild(nd)
      }
      if (properties !== undefined) {
        Object.assign(nd, properties)
      }
      return nd
    }
  }

  if (w.createApp === undefined) {
    const mockApp = (_arg: unknown): Record<string, unknown> => {
      return {
        ready: (cb: () => void): Record<string, unknown> => {
          cb()
          return mockApp(_arg)
        },
        on: (): Record<string, unknown> => mockApp(_arg),
        click: (): Record<string, unknown> => mockApp(_arg),
        val: (): string => "",
        hide: (): Record<string, unknown> => mockApp(_arg),
        show: (): Record<string, unknown> => mockApp(_arg),
        use: (): Record<string, unknown> => mockApp(_arg),
        mount: (): Record<string, unknown> => mockApp(_arg),
      }
    }
    w.createApp = mockApp
    if (w.j === undefined) {
      w.j = mockApp
    }
  }
}

// Layout constants
const winRec = window as unknown as Record<string, unknown>
winRec.LAYOUT_LABEL_TO_DATA ??= {
  Left: [1, [0, 0.5], [0, 0]],
  Right: [2, [1, 0.5], [-0, 0]],
  Top: [3, [0.5, 0], [0, 0]],
  Bottom: [4, [0.5, 1], [0, -0]],
}
winRec.LAYOUT_LABEL_OPPOSITES ??= {
  Left: "Right",
  Right: "Left",
  Top: "Bottom",
  Bottom: "Top",
}
winRec.LAYOUT_CLOCKWISE ??= ["Left", "Top", "Right", "Bottom"]

// extensionManager fallback
const appExtRec = appObj as unknown as Record<string, unknown>
appExtRec.extensionManager ??= {
  command: {
    commands: [{ id: "Comfy.ExportWorkflowAPI" }],
  },
}

// File upload input
if (document.getElementById("comfy-file-input") === null) {
  const fileInput: HTMLInputElement = document.createElement("input")
  fileInput.type = "file"
  fileInput.id = "comfy-file-input"
  fileInput.style.display = "none"
  document.body.appendChild(fileInput)
}

// Various global stubs
;(window as unknown as Record<string, unknown>).IoDirection ??= {}
;(window as unknown as Record<string, unknown>).addConnectionLayoutSupport ??=
  (): void => {
    /* noop */
  }
;(window as unknown as Record<string, unknown>).addMenuItem ??= (): void => {
  /* noop */
}
;(window as unknown as Record<string, unknown>).getSlotLinks ??=
  (): unknown[] => []
;(window as unknown as Record<string, unknown>).isValidConnection ??=
  (): boolean => true
;(window as unknown as Record<string, unknown>).setConnectionsLayout ??=
  (): void => {
    /* noop */
  }
;(window as unknown as Record<string, unknown>).waitForCanvas ??=
  (): Promise<unknown> => Promise.resolve()

import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { WebSocketProvider } from "./comfyui/contexts/WebSocketProvider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { Toaster } from "@/components/ui/sonner"
import { ConfirmProvider } from "./comfyui/contexts/ConfirmContext.tsx"

const rootElement: HTMLElement | null = document.getElementById("root")
if (rootElement === null) {
  throw new Error("Root element not found")
}
createRoot(rootElement).render(
  <StrictMode>
    <WebSocketProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={400}>
          <ConfirmProvider>
            <App />
            <Toaster />
          </ConfirmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </WebSocketProvider>
  </StrictMode>
)
