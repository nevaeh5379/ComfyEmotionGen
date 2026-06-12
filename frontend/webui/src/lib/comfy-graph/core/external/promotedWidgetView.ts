// CEG stub - promotedWidgetView from ComfyUI_frontend
import type { LGraphNode } from '../LGraphNode'
import type { IBaseWidget, WidgetObjectValue } from '../types/widgets'
import type { SubgraphNode } from '../subgraph/SubgraphNode'

export interface PromotedWidgetSource {
  sourceNodeId: string
  sourceWidgetName: string
}

export interface PromotedWidgetView extends IBaseWidget, PromotedWidgetSource {
  readonly node: LGraphNode
  hydrateHostValue?(value: string | number | boolean | WidgetObjectValue | null): void
}

export interface ResolvedPromotedWidget {
  status: 'resolved' | 'not_found'
  resolved?: {
    widget?: IBaseWidget
  }
}

export function isPromotedWidgetView(widget: IBaseWidget): widget is PromotedWidgetView {
  return (widget as PromotedWidgetView).sourceNodeId !== undefined
}

export function createPromotedWidgetView(
  node: LGraphNode,
  sourceNodeId: string,
  sourceWidgetName: string,
  label: string,
  name: string
): PromotedWidgetView {
  const symbolKey = Symbol.for('comfy-widget')
  const view: PromotedWidgetView = {
    [symbolKey]: true,
    node,
    sourceNodeId,
    sourceWidgetName,
    name,
    label,
    type: 'custom',
    options: {},
    y: 0
  }
  return view
}

export function resolveConcretePromotedWidget(
  subgraphNode: SubgraphNode,
  sourceNodeId: string,
  sourceWidgetName: string
): ResolvedPromotedWidget {
  const subgraph = subgraphNode.subgraph
  if (!subgraph) {
    return { status: 'not_found' }
  }

  const interiorNode = subgraph.getNodeById(Number(sourceNodeId)) || subgraph.getNodeById(sourceNodeId)
  if (!interiorNode) {
    return { status: 'not_found' }
  }

  const widget = interiorNode.widgets?.find((w) => w.name === sourceWidgetName)
  if (!widget) {
    return { status: 'not_found' }
  }

  return {
    status: 'resolved',
    resolved: {
      widget
    }
  }
}
