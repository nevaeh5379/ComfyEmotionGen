// CEG stub - promotedWidgetView from ComfyUI_frontend
import type { LGraphNode } from '../LGraphNode'
import type { IBaseWidget } from '../types/widgets'

export interface PromotedWidgetView extends IBaseWidget {
  readonly node: LGraphNode
  readonly sourceNodeId: string
  readonly sourceWidgetName: string
}

export function isPromotedWidgetView(widget: IBaseWidget): widget is PromotedWidgetView {
  return (widget as any)?.sourceNodeId !== undefined
}

export function createPromotedWidgetView(
  node: LGraphNode,
  widget: IBaseWidget,
  sourceNodeId: string,
  sourceWidgetName: string
): PromotedWidgetView {
  return {
    ...widget,
    node,
    sourceNodeId,
    sourceWidgetName,
  }
}
