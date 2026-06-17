import type { LGraphNode } from '@/lib/litegraph/src/LGraphNode'
import type {
  INodeInputSlot,
  INodeOutputSlot,
  Point
} from '@/lib/litegraph/src/interfaces'
import { LiteGraph } from '@/lib/litegraph/src/litegraph'
import { isWidgetInputSlot } from '@/lib/litegraph/src/node/slotUtils'
import { layoutStore } from './layout'

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

export function getSlotKey(
  nodeId: string,
  index: number,
  isInput: boolean
): string {
  return `${nodeId}-${isInput ? 'in' : 'out'}-${index}`
}

function calculateInputSlotPos(
  context: SlotPositionContext,
  slot: number
): Point {
  const input = context.inputs[slot]
  if (!input) return [context.nodeX, context.nodeY]

  return calculateInputSlotPosFromSlot(context, input)
}

export function calculateInputSlotPosFromSlot(
  context: SlotPositionContext,
  input: INodeInputSlot
): Point {
  const { nodeX, nodeY, collapsed } = context

  if (collapsed) {
    const halfTitle = LiteGraph.NODE_TITLE_HEIGHT * 0.5
    return [nodeX, nodeY - halfTitle]
  }

  const { pos } = input
  if (pos) return [nodeX + pos[0], nodeY + pos[1]]

  const offsetX = LiteGraph.NODE_SLOT_HEIGHT * 0.5
  const nodeOffsetY = context.slotStartY || 0
  const defaultVerticalInputs = getDefaultVerticalInputs(context)
  const slotIndex = defaultVerticalInputs.indexOf(input)
  const slotY = (slotIndex + 0.7) * LiteGraph.NODE_SLOT_HEIGHT

  return [nodeX + offsetX, nodeY + slotY + nodeOffsetY]
}

function calculateOutputSlotPos(
  context: SlotPositionContext,
  slot: number
): Point {
  const { nodeX, nodeY, nodeWidth, collapsed, collapsedWidth, outputs } =
    context

  if (collapsed) {
    const width = collapsedWidth || LiteGraph.NODE_COLLAPSED_WIDTH
    const halfTitle = LiteGraph.NODE_TITLE_HEIGHT * 0.5
    return [nodeX + width, nodeY - halfTitle]
  }

  const outputSlot = outputs[slot]
  if (!outputSlot) return [nodeX + nodeWidth, nodeY]

  const outputPos = outputSlot.pos
  if (outputPos) return [nodeX + outputPos[0], nodeY + outputPos[1]]

  const offsetX = LiteGraph.NODE_SLOT_HEIGHT * 0.5
  const nodeOffsetY = context.slotStartY || 0
  const defaultVerticalOutputs = getDefaultVerticalOutputs(context)
  const slotIndex = defaultVerticalOutputs.indexOf(outputSlot)
  const slotY = (slotIndex + 0.7) * LiteGraph.NODE_SLOT_HEIGHT

  return [nodeX + nodeWidth + 1 - offsetX, nodeY + slotY + nodeOffsetY]
}

export function getSlotPosition(
  node: LGraphNode,
  slotIndex: number,
  isInput: boolean
): Point {
  if (LiteGraph.vueNodesMode) {
    const slotKey = getSlotKey(String(node.id), slotIndex, isInput)
    const slotLayout = layoutStore.getSlotLayout(slotKey)
    if (slotLayout) {
      return [slotLayout.position.x, slotLayout.position.y]
    }

    const nodeLayout = layoutStore.getNodeLayoutRef(String(node.id)).value

    if (nodeLayout) {
      const context: SlotPositionContext = {
        nodeX: nodeLayout.position.x,
        nodeY: nodeLayout.position.y,
        nodeWidth: nodeLayout.size.width,
        nodeHeight: nodeLayout.size.height,
        collapsed: node.flags.collapsed || false,
        collapsedWidth: node._collapsed_width,
        slotStartY: node.constructor.slot_start_y,
        inputs: node.inputs,
        outputs: node.outputs,
        widgets: node.widgets
      }

      return isInput
        ? calculateInputSlotPos(context, slotIndex)
        : calculateOutputSlotPos(context, slotIndex)
    }
  }

  const context: SlotPositionContext = {
    nodeX: node.pos[0],
    nodeY: node.pos[1],
    nodeWidth: node.size[0],
    nodeHeight: node.size[1],
    collapsed: node.flags.collapsed || false,
    collapsedWidth: node._collapsed_width,
    slotStartY: node.constructor.slot_start_y,
    inputs: node.inputs,
    outputs: node.outputs,
    widgets: node.widgets
  }

  return isInput
    ? calculateInputSlotPos(context, slotIndex)
    : calculateOutputSlotPos(context, slotIndex)
}

function getDefaultVerticalInputs(
  context: SlotPositionContext
): INodeInputSlot[] {
  return context.inputs.filter(
    (slot) => !slot.pos && !(context.widgets?.length && isWidgetInputSlot(slot))
  )
}

function getDefaultVerticalOutputs(
  context: SlotPositionContext
): INodeOutputSlot[] {
  return context.outputs.filter((slot) => !slot.pos)
}
