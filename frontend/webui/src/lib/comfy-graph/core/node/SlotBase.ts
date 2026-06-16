
import type { LLink } from '../LLink'
import { Rectangle } from '../infrastructure/Rectangle'
import type {
  CanvasColour,
  DefaultConnectionColors,
  INodeSlot,
  ISlotType,
  IWidgetLocator,
  Point
} from '../interfaces'
import type {
  LinkDirection,
  RenderShape
} from '../types/globalEnums'

/** Base class for all input & output slots. */

export abstract class SlotBase implements INodeSlot {
  name: string
  localized_name?: string | undefined
  label?: string | undefined
  type: ISlotType
  dir?: LinkDirection | undefined
  removable?: boolean | undefined
  shape?: RenderShape | undefined
  color_off?: CanvasColour | undefined
  color_on?: CanvasColour | undefined
  locked?: boolean | undefined
  nameLocked?: boolean | undefined
  widget?: IWidgetLocator | undefined
  _floatingLinks?: Set<LLink> | undefined
  hasErrors?: boolean | undefined

  /** The centre point of the slot. */
  abstract pos?: Point | undefined
  readonly boundingRect: Rectangle

  constructor(name: string, type: ISlotType, boundingRect?: Rectangle) {
    this.name = name
    this.type = type
    this.boundingRect = boundingRect ?? new Rectangle()
  }

  abstract get isConnected(): boolean

  renderingColor(colorContext: DefaultConnectionColors): CanvasColour {
    return this.isConnected
      ? this.color_on || colorContext.getConnectedColor(this.type)
      : this.color_off || colorContext.getDisconnectedColor(this.type)
  }
}
