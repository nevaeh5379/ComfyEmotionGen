/**
 * LiteGraph Type Declarations (strict-mode compatible)
 * ComfyUI_frontend custom fork
 */

// Re-export types only — implementations live in core/*.ts (with @ts-nocheck)
export type { Vector2, Size, Rect, INodeInputSlot, INodeOutputSlot, IContextMenuValue } from "./core/interfaces"
export type { IBaseWidget, IWidgetOptions, IWidgetSerialize } from "./core/types/widgets"
export { LGraphEventMode } from "./core/types/globalEnums"
export type { NodeId } from "./core/types/nodeIdentification"

// Classes are re-exported as values (implementation files have @ts-nocheck)
export { LGraph } from "./core/LGraph"
export { LGraphCanvas } from "./core/LGraphCanvas"
export { LGraphNode } from "./core/LGraphNode"
export { LGraphGroup } from "./core/LGraphGroup"
export { LLink } from "./core/LLink"
export { LiteGraph } from "./core/LiteGraphGlobal"
export { DragAndScale } from "./core/DragAndScale"
export { measureText } from "./core/measure"
