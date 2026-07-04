import type { JSX as ReactJSX } from "react"
import type { ComfyApi } from "@/comfyui/api"
import type { ComfyAppService } from "@/comfyui/services/appService"
import type { ComfyWorkflowNode } from "@/comfyui/types/workflow"
import type { ComfyExtension as ComfyExtensionType } from "@/comfyui/types/extensionTypes"

declare global {
  type ComfyExtension = ComfyExtensionType
  interface LGraphEventMode {
    ALWAYS: number
    NEVER: number
    BYPASS: number
  }

  interface LiteGraphGlobal {
    registerNodeType(type: string, base_class: unknown): void
    unregisterNodeType?(type: string): void
    registerNodeAndSlotType?(type: string, base_class: unknown): void
    clearRegisteredTypes?(): void
    getNodeType?(type: string): unknown
    getNodeTypesCategories?(filter?: string): string[]
    getNodeTypesInCategory?(category: string, filter?: string): unknown[]
    isValidConnection?(typeA: unknown, typeB: unknown): boolean
    cloneObject?<T>(value: T): T
    extendClass?(target: { prototype?: object }, origin: { prototype?: object }): void
    NODE_DEFAULT_WIDTH: number
    NODE_DEFAULT_HEIGHT: number
    NODE_WIDTH?: number
    NODE_TITLE_HEIGHT?: number
    NODE_SLOT_HEIGHT?: number
    NODE_WIDGET_HEIGHT?: number
    NODE_TEXT_SIZE?: number
    ACTION?: number
    EVENT?: number
    INPUT?: number
    OUTPUT?: number
    ALWAYS: number
    NEVER: number
    BYPASS: number
    LGraphEventMode?: LGraphEventMode
    createNode(
      type: string,
      title?: string,
      options?: Record<string, unknown>
    ): LGraphNode | null
    LGraphNode: typeof LGraphNode
  }

  interface LGraph {
    // Identity
    id: string
    revision: number
    status: number

    // Data containers
    add(nodeOrGroup: LGraphNode | LGraphGroup): void
    syncGraph?(): Promise<void>
    links: Map<number, LLink> & Record<number, LLink>
    groups: LGraphGroup[]
    nodes: LGraphNode[]
    clear(): void
    _nodes_by_id: Record<string, LGraphNode | undefined>
    getNodeById(id: number | string): LGraphNode | undefined
    setDirtyCanvas(flag: boolean, history?: boolean): void
    _canvas?: LGraphCanvas

    // State
    state?: {
      lastNodeId: number
      lastLinkId: number
      lastGroupId: number
      lastRerouteId: number
    }
    config?: Record<string, unknown>
    extra?: Record<string, unknown>
    vars?: Record<string, unknown>

    // Computed
    readonly empty?: boolean

    // Link management
    getLink?(id: number): LLink | undefined
    removeLink?(id: number): void

    // Search
    findNodesByType?(type: string): LGraphNode[]
    findNodesByTitle?(title: string): LGraphNode[]
    remove?(nodeOrGroup: LGraphNode | LGraphGroup): void

    // Serialization
    serialize?(): Record<string, unknown>
    configure?(data: Record<string, unknown>, keep_old?: boolean): void

    // Change tracking
    beforeChange?(info?: LGraphNode): void
    afterChange?(info?: LGraphNode | null): void
    change?(): void
    incrementVersion?(): void
    attachCanvas?(canvas: LGraphCanvas): void
    detachCanvas?(canvas?: LGraphCanvas): void

    // Execution (stubs)
    updateExecutionOrder?(): void
    computeExecutionOrder?(): void

    // Callbacks
    onNodeAdded?: (node: LGraphNode) => void
    onNodeRemoved?: (node: LGraphNode) => void
    onBeforeChange?: (graph: LGraph, info?: LGraphNode | null) => void
    onAfterChange?: (graph: LGraph, info?: LGraphNode | null) => void
    onConfigure?: (data: Record<string, unknown>) => void
    onSerialize?: (data: Record<string, unknown>) => void

    // Events (stub)
    events?: {
      addEventListener(type: string, listener: (event: Event) => void): void
      removeEventListener(type: string, listener: (event: Event) => void): void
      dispatch(type: string, detail: unknown): boolean
    }
  }

  interface LGraphNodeInput {
    name: string
    type: string
    link: number | null
    localized_name?: string
    widget?: { name: string } | null
  }
  interface LGraphNodeOutput {
    name: string
    type: string
    links: number[] | null
    localized_name?: string
  }

  interface LGraphNode {
    id: number
    graph?: LGraph | null
    title?: string
    type?: string
    color?: string
    bgcolor?: string
    pos: [number, number]
    size: [number, number]
    inputs: LGraphNodeInput[]
    outputs: LGraphNodeOutput[]
    widgets?: WidgetType[]
    order?: number
    mode?: number
    properties?: Record<string, unknown>
    properties_info?: Record<string, Record<string, unknown>>
    flags?: Record<string, unknown>
    addInput(name: string, type: string): void
    addOutput(name: string, type: string): void
    computeSize(minWidth?: number): [number, number]
    expandToFitContent(): void
    setSize(size: [number, number]): void
    setPos(x: number | [number, number], y?: number): void
    move(deltaX: number, deltaY: number): void
    snapToGrid(): void
    alignToGrid(): void
    getTitle(): string
    serialize(): Record<string, unknown>
    clone(): LGraphNode
    connect(
      slot: number,
      node: LGraphNode,
      inputSlot: number | string
    ): boolean | null
    disconnectInput(slot: number): void
    disconnectOutput(slot: number): void
    configure(
      data:
        | ComfyWorkflowNode
        | Record<string, string | number | boolean | object | null | undefined>
    ): void
    onNodeCreated?(): void
    addProperty(
      name: string,
      defaultValue: unknown,
      type?: string,
      extraInfo?: Record<string, unknown>
    ): void
    setProperty(name: string, value: unknown): void
    getProperty(name: string): unknown
    getPropertyInfo(name: string): Record<string, unknown> | undefined
    removeProperty(name: string): void
    addCustomWidget<TWidget extends WidgetType>(customWidget: TWidget): TWidget
    removeWidget(widgetOrSlot: WidgetType | number): void
    ensureWidgetRemoved(widget: WidgetType): void
    findInputSlot(name: string, returnObj?: false): number
    findInputSlot(name: string, returnObj: true): LGraphNodeInput | undefined
    findOutputSlot(name: string, returnObj?: false): number
    findOutputSlot(
      name: string,
      returnObj: true
    ): LGraphNodeOutput | undefined
    getInputInfo(slot: number): LGraphNodeInput | null
    getOutputInfo(slot: number): LGraphNodeOutput | null
    isInputConnected(slot: number): boolean
    isOutputConnected(slot: number): boolean
    isAnyOutputConnected(): boolean
    removeInput(slot: number): void
    removeOutput(slot: number): void
    getInputLink(slot: number): LLink | null
    getInputNode(slot: number): LGraphNode | null
    getOutputNodes(slot: number): LGraphNode[] | null
    getInputData(slot?: number, forceUpdate?: boolean): unknown
    getInputDataByName(slotName?: string, forceUpdate?: boolean): unknown
    setOutputData(slot?: number, data?: unknown): void
    getOutputData(slot?: number): unknown
    setOutputDataType(slot: number, type: string): void
    getInputDataType(slot: number): string | undefined
    getInputOrProperty(name: string): unknown
    findInputSlotFree(): number
    findOutputSlotFree(): number
    findInputSlotByType(type: string): number
    findOutputSlotByType(type: string): number
    findSlotByType(input: boolean, type: string): number
    findConnectByTypeSlot(type: string, isOutput?: boolean): number
    findInputByType(type: string): LGraphNodeInput | null
    findOutputByType(type: string): LGraphNodeOutput | null
    canConnectTo(slot: number, targetNode: LGraphNode, targetSlot: number): boolean
    connectByType(
      slot: number,
      targetNode: LGraphNode,
      targetType: string
    ): boolean | null
    connectByTypeOutput(
      targetType: string,
      targetNode: LGraphNode,
      targetSlot: number
    ): boolean | null
    getSlotFromWidget(widget: WidgetType): number
    getWidgetFromSlot(slot: number): WidgetType | undefined
    addTitleButton(name: string, label: string, callback?: () => void): unknown
    onTitleButtonClick(name: string): void
    collapse(force?: boolean): void
    toggleAdvanced(): void
    pin(): void
    unpin(): void
    loadImage(url: string): HTMLImageElement
    trace(...args: unknown[]): void
    addWidget(
      type: string,
      name: string,
      value: string | number | boolean,
      callback: (v: string | number | boolean) => void,
      options?: Record<string, unknown>
    ): WidgetType
    addDOMWidget(
      name: string,
      type: string,
      element: HTMLElement,
      options?: {
        getValue?: () => unknown
        setValue?: (v: unknown) => void
        hideOnZoom?: boolean
        selectOn?: string[]
        [key: string]: unknown
      }
    ): WidgetType
    setDirtyCanvas(flag?: boolean, history?: boolean): void
  }

  interface LGraphCanvas {
    state: { readOnly: boolean }
    resize(width: number, height: number): void
    ds: { scale: number; offset: [number, number] }
    setDirty(canvas: boolean, history: boolean): void
    stopRendering(): void
    startRendering(): void
    setCanvas(canvas: HTMLCanvasElement): void
    render_canvas_border: boolean
    default_connection_color_byType?: Record<string, string>
    link_type_colors?: Record<string, string>
    app?: ComfyApp
    graph?: LGraph | null
    graph_mouse?: [number, number]
    canvas_mouse?: [number, number]
    canvas?: HTMLCanvasElement | null
    addEventListener?(type: string, listener: (e: Event) => void): void
    removeEventListener?(type: string, listener: (e: Event) => void): void
    setGraph?(graph: LGraph): void
    getCurrentGraph?(): LGraph | undefined
    getCanvasMenuOptions?(): unknown[]
    getNodeMenuOptions?(node?: LGraphNode): unknown[]
    getGroupMenuOptions?(group?: LGraphGroup): unknown[]
    getContextMenuOptions?(): unknown[]
    draw?(forceCanvas?: boolean, forceBgCanvas?: boolean): void
    selectNode?(node: LGraphNode): void
    selectNodes?(nodes?: LGraphNode[]): void
    deselectNode?(node: LGraphNode): void
    deselectAll?(): void
    deselectAllNodes?(): void
    deleteSelected?(): void
    deleteSelectedNodes?(): void
    copyToClipboard?(items?: unknown): void
    pasteFromClipboard?(options?: unknown): unknown
    prompt?(
      title: string,
      value: string,
      callback?: (value: string) => void,
      event?: Event,
      multiline?: boolean
    ): HTMLElement
    showSearchBox?(): HTMLElement
    showEditPropertyValue?(): HTMLElement
    centerOnNode?(node: LGraphNode): void
    setZoom?(value: number, center?: [number, number]): void
    bringToFront?(node: LGraphNode): void
    sendToBack?(node: LGraphNode): void
    processContextMenu?(...args: unknown[]): unknown
    convertOffsetToCanvas?(pos: [number, number]): [number, number]
    convertCanvasToOffset?(pos: [number, number]): [number, number]
    convertEventToCanvasOffset?(event: MouseEvent): [number, number]
    isNodeVisible?(node: LGraphNode): boolean
    computeVisibleNodes?(): LGraphNode[]
  }

  interface LLink {
    id: number
    origin_id: number
    origin_slot: number
    target_id: number
    target_slot: number
    type: string
  }

  interface LGraphGroup {
    id: number
    title: string
    pos: [number, number]
    size: [number, number]
    color?: string
  }

  interface LGraphConstructor {
    new (): LGraph
    prototype: LGraph
  }
  interface LGraphNodeConstructor {
    new (title?: string): LGraphNode
    prototype: LGraphNode
  }
  interface LGraphCanvasConstructor {
    new (canvas: HTMLCanvasElement, graph: LGraph): LGraphCanvas
    prototype: LGraphCanvas
  }
  interface LLinkConstructor {
    new (): LLink
    prototype: LLink
  }
  interface LGraphGroupConstructor {
    new (): LGraphGroup
    prototype: LGraphGroup
  }

  var LGraph: LGraphConstructor
  var LGraphNode: LGraphNodeConstructor
  var LGraphCanvas: LGraphCanvasConstructor
  var LLink: LLinkConstructor
  var LGraphGroup: LGraphGroupConstructor
  var LiteGraph: LiteGraphGlobal

  namespace JSX {
    type Element = ReactJSX.Element
  }

  interface AddDOMWidgetOptions {
    getValue?(): unknown
    setValue?(v: unknown): void
    beforeResize?(widget: WidgetType, node: LGraphNode): void
    afterResize?(widget: WidgetType, node: LGraphNode): void
    hideOnZoom?: boolean
    selectOn?: string[]
    [key: string]: unknown
  }

  interface WidgetType {
    type: string
    name: string
    element?: HTMLElement
    options: AddDOMWidgetOptions & { hideOnZoom: boolean }
    _value?: unknown
    value: unknown
    callback:
      | ((
          value: unknown,
          canvas?: LGraphCanvas,
          node?: LGraphNode,
          mouse?: [number, number],
          event?: object
        ) => void)
      | null
  }

  interface SettingEntry {
    onChange(): void
  }

  type SettingsLookup = Record<string, SettingEntry>

  interface AppSettings {
    addSetting(setting: unknown): unknown
    getSettingValue(id: string): unknown
    setSettingValue(id: string, value: unknown): void
    settingsLookup: SettingsLookup
    addEventListener?(type: string, listener: (e: unknown) => void): void
    removeEventListener?(type: string, listener: (e: unknown) => void): void
  }

  interface ComfyAppUI {
    dialogs: Record<string, unknown>
    dialog: { show(): void }
    settings: AppSettings
    menu?: {
      readonly element: HTMLElement | null
    }
    menuContainer?: HTMLElement | null
  }

  interface ExtensionManager {
    command: {
      commands: { id: string }[]
    }
    registerExtension?(ext: ComfyExtension): void
  }

  interface ComfyApp {
    graph: LGraph
    canvas: LGraphCanvas
    syncGraph(): void | Promise<void>
    ui: ComfyAppUI
    settings: AppSettings
    extensions: ComfyExtension[]
    registerExtension(ext: ComfyExtension): void
    extensionManager: ExtensionManager
    extensionsLoaded?: boolean
    api?: ComfyApi
    syncGraphNode?(id: number): void
    widgets?: Record<string, (node: unknown, name: string, inputData: unknown[], app: unknown) => unknown>
  }

  interface Window {
    app: ComfyApp
    api: ComfyApi
    LGraphNode: LGraphNodeConstructor
    __comfyAppService?: ComfyAppService
    __useReactGraphStore?: unknown
  }

  interface ComfyWidgetsAPI {
    STRING(): { widget: { inputEl: Record<string, unknown> } }
    INT(): { widget: { inputEl: Record<string, unknown> } }
    FLOAT(): { widget: { inputEl: Record<string, unknown> } }
    COMBO(): { widget: { inputEl: Record<string, unknown> } }
    BOOLEAN(): { widget: { inputEl: Record<string, unknown> } }
  }

  interface UECallbacks {
    register_allnode_callback(): void
    register_allgraph_callback(): void
  }

  interface ComfyAPIObject {
    app?: {
      app: ComfyApp
    }
    api?: {
      api: ComfyApi
    }
    utils?: {
      applyTextReplacements(node: object, text: string): string
    }
    ui?: {
      ComfyDialog: new () => object
      $el: (
        tag: string,
        attrs:
          | Record<string, object | string | number | boolean | null>
          | null
          | undefined,
        children?: object
      ) => HTMLElement
      ComfyUI: new () => object
    }
    widgets?: {
      updateControlWidgetLabel(): void
      IS_CONTROL_WIDGET(): void
      addValueControlWidget(): void
      addValueControlWidgets(): void
      ComfyWidgets: ComfyWidgetsAPI
      isValidWidgetType(): void
    }
    widgetInputs?: {
      PrimitiveNode?: new () => object
      getWidgetConfig(
        slot?: { widget?: Record<PropertyKey, unknown> | null }
      ): [unknown, Record<string, unknown>]
      convertToInput(
        node?: LGraphNode,
        widget?: { name?: string; type?: string }
      ): LGraphNodeInput | undefined
      setWidgetConfig(
        slot?: { widget?: Record<PropertyKey, unknown> | null },
        config?: [unknown, Record<string, unknown>]
      ): void
      mergeIfValid(
        output?: { widget?: Record<PropertyKey, unknown> | null },
        config?: [unknown, Record<string, unknown>]
      ): [unknown, Record<string, unknown>] | undefined
    }
    groupNode?: {
      GroupNodeConfig: (new () => object) & {
        registerFromWorkflow(): Promise<void>
      }
      GroupNodeHandler: new () => object
    }
    pnginfo?: {
      getPngMetadata(): Promise<Record<string, unknown>>
      getWebpMetadata(): Promise<Record<string, unknown>>
    }
    editAttention?: {
      incrementWeight(weight: string, delta: number): string
      findNearestEnclosure(
        text: string,
        cursorPos: number
      ): { start: number; end: number } | null
      addWeightToParentheses(text: string): string
    }
    widgetValuePropagation?: {
      applyFirstWidgetValueToGraph(
        node: LGraphNode | null | undefined,
        extraLinks?: LLink[],
        transformValue?: (value: unknown) => unknown
      ): void
    }
    groupNodeManage?: {
      ManageGroupDialog: new (app?: object) => {
        show(e?: object): void
      }
    }
    constants?: {
      iconsHtml: Record<string, string>
      SUPPORTED_EXTENSIONS: Set<string>
      SUPPORTED_EXTENSIONS_ACCEPT: string
      SUPPORTED_HDRI_EXTENSIONS: Set<string>
      SUPPORTED_HDRI_EXTENSIONS_ACCEPT: string
      LOAD3D_NONE_MODEL: string
      [key: string]: object | Set<string> | string
    }
    types?: {
      BrushShape: Record<string, string>
      Tools: Record<string, string>
      allTools: string[]
      CompositionOperation: Record<string, string>
      MaskBlendMode: Record<string, string>
      ColorComparisonMethod: Record<string, string>
      [key: string]: Record<string, string> | string[]
    }
    [key: string]: object | undefined
  }

  interface Window {
    LiteGraph?: LiteGraphGlobal
    LGraph?: LGraphConstructor
    LGraphNode?: LGraphNodeConstructor
    LGraphCanvas?: LGraphCanvasConstructor
    LLink?: LLinkConstructor
    LGraphGroup?: LGraphGroupConstructor
    app: ComfyApp
    api: ComfyApi
    comfyExtensions?: object[]

    $el: (
      tag: string,
      attrs:
        | Record<string, object | string | number | boolean | null>
        | null
        | undefined,
      children?: object
    ) => HTMLElement
    addStylesheet: (url: string, relativeTo?: string | URL) => Promise<void>
    getUrl: (path: string, base?: string | URL) => string
    ComfyWidgets: ComfyWidgetsAPI
    ComfyApp: new () => object
    ComfyDialog: new () => object
    ClipspaceDialog: new () => object & { registerButton?: () => void }
    isBeforeFrontendVersion: () => boolean
    comfyAPI?: ComfyAPIObject
    Exposed: () => void
    CONFIG_SERVICE: { getConfigValue(): unknown; addEventListener(): void }
    helpDOM: {
      addHelp(
        target: HTMLElement | object | null | undefined,
        content?: string | HTMLElement
      ): HTMLElement
      removeHelp(target?: HTMLElement | null): void
    }
    ue_callbacks: UECallbacks
    create: (
      tag: string,
      clss: string,
      parent: HTMLElement | null,
      properties?: Record<string, unknown>
    ) => HTMLElement
    createApp: (arg: unknown) => Record<string, unknown>
    j: (arg: unknown) => Record<string, unknown>
    LAYOUT_LABEL_TO_DATA: Record<
      string,
      [number, [number, number], [number, number]]
    >
    LAYOUT_LABEL_OPPOSITES: Record<string, string>
    LAYOUT_CLOCKWISE: string[]
    IoDirection: Record<string, unknown>
    addConnectionLayoutSupport: (...args: unknown[]) => void
    addMenuItem: (...args: unknown[]) => void
    getSlotLinks: (...args: unknown[]) => unknown[]
    isValidConnection: (...args: unknown[]) => boolean
    setConnectionsLayout: (...args: unknown[]) => void
    waitForCanvas: (...args: unknown[]) => Promise<unknown>
    __comfyAppService?: ComfyAppService
  }
}
