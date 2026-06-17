// CEG - LitegraphLinkAdapter from ComfyUI_frontend renderer
// Bridges litegraph data model to canvas renderer
import type { CanvasColour } from '../interfaces'
import { LinkDirection, LinkRenderType, LinkMarkerShape } from '../types/globalEnums'
import type { Direction, RenderContext, LinkRenderData, RenderMode } from './pathRenderer'
import { CanvasPathRenderer } from './pathRenderer'
import type { LLink } from '../LLink'
import type { Reroute } from '../Reroute'

export interface LinkRenderContext {
  renderMode: number
  connectionWidth: number
  renderBorder: boolean
  lowQuality: boolean
  highQualityRender: boolean
  scale: number
  linkMarkerShape: number
  renderConnectionArrows: boolean
  highlightedLinks?: Set<string>
  defaultLinkColor?: string
  linkTypeColors?: Record<string, string>
  disabledPattern?: CanvasPattern | null
}

function convertDirection(dir: number | LinkDirection): Direction {
  switch (dir) {
    case LinkDirection.UP:
      return 'up'
    case LinkDirection.DOWN:
      return 'down'
    case LinkDirection.LEFT:
      return 'left'
    case LinkDirection.RIGHT:
      return 'right'
    case LinkDirection.CENTER:
    case LinkDirection.NONE:
    default:
      return 'none'
  }
}

function convertRenderMode(mode: number | LinkRenderType): RenderMode {
  switch (mode) {
    case LinkRenderType.STRAIGHT_LINK:
      return 'straight'
    case LinkRenderType.LINEAR_LINK:
      return 'linear'
    case LinkRenderType.SPLINE_LINK:
    default:
      return 'spline'
  }
}

function getDirectionOffset(direction: Direction, distance: number): { x: number; y: number } {
  switch (direction) {
    case 'left':
      return { x: -distance, y: 0 }
    case 'right':
      return { x: distance, y: 0 }
    case 'up':
      return { x: 0, y: -distance }
    case 'down':
      return { x: 0, y: distance }
    case 'none':
    default:
      return { x: 0, y: 0 }
  }
}

const pathRenderer = new CanvasPathRenderer()

export class LitegraphLinkAdapter {
  constructor(_isReroute: boolean = false) {
    // No-op
  }

  renderLink(
    _ctx: CanvasRenderingContext2D,
    _link: LLink | null,
    _context: LinkRenderContext,
    _startPos: [number, number],
    _endPos: [number, number],
    _startDirection: number,
    _endDirection: number,
    _reroutes: Reroute[] = []
  ): void {
    // No-op - LGraphCanvas.ts uses renderLinkDirect
  }

  renderDraggingLink(
    ctx: CanvasRenderingContext2D,
    from: readonly [number, number],
    to: readonly [number, number],
    colour: CanvasColour,
    startDir: number,
    endDir: number,
    context: LinkRenderContext
  ): void {
    const fromInput = (endDir === LinkDirection.CENTER || endDir === LinkDirection.NONE) && startDir !== LinkDirection.NONE

    let fixedDirection: Direction = 'right'
    let dragDirection: Direction = 'left'

    if (fromInput) {
      fixedDirection = 'left'
      dragDirection = 'right'
      if (startDir === LinkDirection.UP) fixedDirection = 'up'
      else if (startDir === LinkDirection.DOWN) fixedDirection = 'down'
    } else {
      fixedDirection = 'right'
      dragDirection = 'left'
      if (startDir === LinkDirection.UP) fixedDirection = 'up'
      else if (startDir === LinkDirection.DOWN) fixedDirection = 'down'
    }

    const renderContext: RenderContext = {
      style: {
        mode: convertRenderMode(context.renderMode),
        connectionWidth: context.connectionWidth,
        borderWidth: context.renderBorder ? 2 : 0,
        showArrows: context.renderConnectionArrows || context.linkMarkerShape === LinkMarkerShape.Arrow,
        lowQuality: context.lowQuality,
        showCenterMarker: context.linkMarkerShape === LinkMarkerShape.Circle,
        centerMarkerShape: 'circle',
        highQuality: context.highQualityRender,
      },
      colors: {
        default: typeof colour === 'string' ? colour : (context.defaultLinkColor || '#aaa'),
        byType: context.linkTypeColors || {},
        highlighted: '#ff0',
      },
      patterns: {
        disabled: context.disabledPattern
      },
      scale: context.scale,
      highlightedIds: context.highlightedLinks
    }

    pathRenderer.drawDraggingLink(
      ctx,
      {
        fixedPoint: { x: from[0], y: from[1] },
        fixedDirection,
        dragPoint: { x: to[0], y: to[1] },
        dragDirection,
        color: typeof colour === 'string' ? colour : undefined,
      },
      renderContext
    )
  }

  renderLinkDirect(
    ctx: CanvasRenderingContext2D,
    a: readonly [number, number],
    b: readonly [number, number],
    link: LLink | null,
    _skip_border: boolean,
    flow: unknown, // flow value (number or null)
    color: CanvasColour | null,
    start_dir: number,
    end_dir: number,
    context: LinkRenderContext,
    extras: {
      reroute?: Reroute
      startControl?: readonly [number, number]
      endControl?: readonly [number, number]
      num_sublines?: number
      disabled?: boolean
    } = {}
  ): void {
    const renderContext: RenderContext = {
      style: {
        mode: convertRenderMode(context.renderMode),
        connectionWidth: context.connectionWidth,
        borderWidth: context.renderBorder ? 2 : 0,
        showArrows: context.renderConnectionArrows || context.linkMarkerShape === LinkMarkerShape.Arrow,
        lowQuality: context.lowQuality,
        showCenterMarker: context.linkMarkerShape === LinkMarkerShape.Circle,
        centerMarkerShape: 'circle',
        highQuality: context.highQualityRender,
      },
      colors: {
        default: context.defaultLinkColor || '#aaa',
        byType: context.linkTypeColors || {},
        highlighted: '#ff0',
      },
      patterns: {
        disabled: context.disabledPattern
      },
      scale: context.scale,
      highlightedIds: context.highlightedLinks
    }

    if (flow !== null && flow !== undefined && flow !== 0) {
      renderContext.animation = {
        time: typeof flow === 'number' ? flow : 0
      }
    }

    let controlPoints: { x: number; y: number }[] | undefined = undefined
    if (extras.startControl || extras.endControl) {
      const sc = extras.startControl
      const ec = extras.endControl
      
      const dist = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2))
      const controlDist = Math.max(30, dist * 0.25)
      
      const startControlOffset = sc 
        ? { x: sc[0], y: sc[1] }
        : getDirectionOffset(convertDirection(start_dir), controlDist)
        
      const endControlOffset = ec
        ? { x: ec[0], y: ec[1] }
        : getDirectionOffset(convertDirection(end_dir), controlDist)

      controlPoints = [
        { x: a[0] + startControlOffset.x, y: a[1] + startControlOffset.y },
        { x: b[0] + endControlOffset.x, y: b[1] + endControlOffset.y }
      ]
    }

    const linkRenderData: LinkRenderData = {
      id: link ? String(link.id) : (extras.reroute ? `reroute-${extras.reroute.id}` : 'temp'),
      startPoint: { x: a[0], y: a[1] },
      endPoint: { x: b[0], y: b[1] },
      startDirection: convertDirection(start_dir),
      endDirection: convertDirection(end_dir),
      color: (typeof color === 'string' ? color : undefined) || (link?.color ? String(link.color) : undefined),
      type: link ? String(link.type) : undefined,
      disabled: extras.disabled,
      flow: flow !== null && flow !== undefined && flow !== 0,
      controlPoints
    }

    const path = pathRenderer.drawLink(ctx, linkRenderData, renderContext)

    if (link) {
      link.path = path
      if (linkRenderData.centerPos) {
        link._pos = [linkRenderData.centerPos.x, linkRenderData.centerPos.y]
      }
      if (linkRenderData.centerAngle !== undefined) {
        link._centreAngle = linkRenderData.centerAngle
      }
    }

    if (extras.reroute) {
      extras.reroute.path = path
      if (linkRenderData.centerPos) {
        extras.reroute._pos = [linkRenderData.centerPos.x, linkRenderData.centerPos.y]
      }
      if (linkRenderData.centerAngle !== undefined) {
        extras.reroute._centreAngle = linkRenderData.centerAngle
      }
    }
  }
}
