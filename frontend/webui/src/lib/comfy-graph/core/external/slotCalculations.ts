// CEG - slotCalculations from ComfyUI_frontend renderer
import type { LGraphNode } from '../LGraphNode'
import type { INodeInputSlot, INodeOutputSlot, Point } from '../interfaces'

export interface SlotPositionContext {
  nodeX: number
  nodeY: number
  nodeWidth: number
  nodeHeight: number
  collapsed: boolean
  collapsedWidth?: number
  slotStartY?: number
  inputs: INodeInputSlot[]
  outputs: INodeOutputSlot[]
  widgets?: Array<{ name?: string }>
}

interface NodeConstructorWithSlotHeight {
  title_height?: number
  slot_height?: number
  slot_start_y?: number
}

const DEFAULT_TITLE_HEIGHT = 30
const DEFAULT_SLOT_HEIGHT = 20

export function calculateInputSlotPosFromSlot(
  ctx: SlotPositionContext,
  slot: INodeInputSlot
): Point {
  if (ctx.collapsed) {
    return [ctx.nodeX, ctx.nodeY - DEFAULT_TITLE_HEIGHT * 0.5]
  }

  if (slot.pos) {
    return [ctx.nodeX + slot.pos[0], ctx.nodeY + slot.pos[1]]
  }

  const slotIndex = ctx.inputs.indexOf(slot)
  const nodeOffsetY = ctx.slotStartY || 0
  const y = ctx.nodeY + ((slotIndex !== -1 ? slotIndex : 0) + 0.7) * DEFAULT_SLOT_HEIGHT + nodeOffsetY
  return [ctx.nodeX + DEFAULT_SLOT_HEIGHT * 0.5, y]
}

export function getSlotPosition(
  node: LGraphNode,
  slotIndex: number | INodeInputSlot | INodeOutputSlot,
  isInput: boolean
): Point {
  const ctor = node.constructor as NodeConstructorWithSlotHeight
  const titleHeight = ctor.title_height ?? DEFAULT_TITLE_HEIGHT
  const slotHeight = ctor.slot_height ?? DEFAULT_SLOT_HEIGHT

  if (node.flags.collapsed) {
    return [node.pos[0], node.pos[1] - titleHeight * 0.5]
  }

  const slot = typeof slotIndex === 'number'
    ? (isInput ? node.inputs?.[slotIndex] : node.outputs?.[slotIndex])
    : slotIndex

  const index = typeof slotIndex === 'number'
    ? slotIndex
    : (isInput ? node.inputs?.indexOf(slotIndex as INodeInputSlot) : node.outputs?.indexOf(slotIndex as INodeOutputSlot))

  if (slot && slot.pos) {
    return [node.pos[0] + slot.pos[0], node.pos[1] + slot.pos[1]]
  }

  const nodeOffsetY = ctor.slot_start_y || 0
  const y = node.pos[1] + ((index !== -1 ? (index ?? 0) : 0) + 0.7) * slotHeight + nodeOffsetY
  
  if (isInput) {
    return [node.pos[0] + slotHeight * 0.5, y]
  } else {
    return [node.pos[0] + node.size[0] - slotHeight * 0.5, y]
  }
}
