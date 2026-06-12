
import type { LGraphNode } from '../LGraphNode'
import type { INodeInputSlot } from '../litegraph'
import type { SubgraphInput } from '../subgraph/SubgraphInput'
import type { IBaseWidget } from '../types/widgets'

import type { LGraphEventMap } from './LGraphEventMap'

export interface SubgraphInputEventMap extends LGraphEventMap {
  'input-connected': {
    input: INodeInputSlot
    widget?: IBaseWidget
    node?: LGraphNode
  }

  'input-disconnected': {
    input: SubgraphInput
  }
}
