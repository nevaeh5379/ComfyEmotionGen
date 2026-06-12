// CEG stub - slotCalculations from ComfyUI_frontend renderer
import type { LGraphNode } from '../LGraphNode'
import type { INodeInputSlot, INodeOutputSlot, Point } from '../interfaces'

export interface SlotPositionContext {
  nodeX: number
  nodeY: number
  nodeHeight: number
  slotIndex: number
  isInput: boolean
  widgetIndex?: number
  widgetsStartY?: number
  slotRadius?: number
}

export function calculateInputSlotPosFromSlot(
  ctx: SlotPositionContext,
  slot: INodeInputSlot
): Point {
  // Minimal fallback: place slots evenly along left edge
  const y = ctx.nodeY + (ctx.nodeHeight * (ctx.slotIndex + 1)) / (ctx.slotIndex + 2)
  return [ctx.nodeX, y]
}

export function getSlotPosition(
  node: LGraphNode,
  slotIndex: number | INodeInputSlot | INodeOutputSlot,
  isInput: boolean
): Point {
  if (typeof slotIndex === 'number') {
    const y = node.pos[1] + (node.size[1] * (slotIndex + 1)) / (slotIndex + 2)
    return isInput
      ? [node.pos[0], y]
      : [node.pos[0] + node.size[0], y]
  }
  return [node.pos[0], node.pos[1] + node.size[1] / 2]
}
