// CEG stub - LitegraphLinkAdapter from ComfyUI_frontend renderer
// Bridges litegraph data model to canvas renderer - we use litegraph's built-in rendering

export interface LinkRenderContext {
  renderMode: number
  connectionWidth: number
  renderBorder: boolean
  lowQuality: boolean
  highQualityRender: boolean
  scale: number
  linkMarkerShape: number
  renderConnectionArrows: boolean
}

export class LitegraphLinkAdapter {
  constructor(_isReroute: boolean = false) {
    // No-op: CEG uses litegraph.js built-in rendering
  }

  renderLink(
    _ctx: CanvasRenderingContext2D,
    _link: unknown,
    _context: LinkRenderContext,
    _startPos: [number, number],
    _endPos: [number, number],
    _startDirection: number,
    _endDirection: number,
    _reroutes: unknown[] = []
  ): void {
    // No-op
  }
}
