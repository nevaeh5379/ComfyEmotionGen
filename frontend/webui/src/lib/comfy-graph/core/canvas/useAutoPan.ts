export interface DragAndScale {
  offset: [number, number]
  scale: number
}

interface AutoPanOptions {
  canvas: HTMLCanvasElement
  ds: DragAndScale
  maxPanSpeed?: number
  onPan: (panX: number, panY: number) => void
}

export class AutoPanController {
  private canvas: HTMLCanvasElement
  private ds: DragAndScale
  private maxPanSpeed: number
  private onPan: (panX: number, panY: number) => void

  private pointerX = 0
  private pointerY = 0
  private active = false
  private animFrameId: number | null = null

  private threshold = 40 // Pixel threshold near canvas boundaries to start auto-panning

  constructor(options: AutoPanOptions) {
    this.canvas = options.canvas
    this.ds = options.ds
    this.maxPanSpeed = options.maxPanSpeed ?? 500
    this.onPan = options.onPan
  }

  updatePointer(x: number, y: number): void {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    
    // Normalize client coordinates to canvas relative coordinates
    let relX = x
    let relY = y

    if (x >= rect.left && x <= rect.right) {
      relX = x - rect.left
    }
    if (y >= rect.top && y <= rect.bottom) {
      relY = y - rect.top
    }

    this.pointerX = relX
    this.pointerY = relY
  }

  start(): void {
    if (this.active) return
    this.active = true
    this.loop()
  }

  stop(): void {
    this.active = false
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  private loop = (): void => {
    if (!this.active) return

    const rect = this.canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    let panX = 0
    let panY = 0

    // Left border
    if (this.pointerX < this.threshold && this.pointerX >= 0) {
      const ratio = (this.threshold - this.pointerX) / this.threshold
      panX = ratio * this.maxPanSpeed * 0.03
    }
    // Right border
    else if (this.pointerX > width - this.threshold && this.pointerX <= width) {
      const ratio = (this.pointerX - (width - this.threshold)) / this.threshold
      panX = -ratio * this.maxPanSpeed * 0.03
    }

    // Top border
    if (this.pointerY < this.threshold && this.pointerY >= 0) {
      const ratio = (this.threshold - this.pointerY) / this.threshold
      panY = ratio * this.maxPanSpeed * 0.03
    }
    // Bottom border
    else if (this.pointerY > height - this.threshold && this.pointerY <= height) {
      const ratio = (this.pointerY - (height - this.threshold)) / this.threshold
      panY = -ratio * this.maxPanSpeed * 0.03
    }

    if (panX !== 0 || panY !== 0) {
      // Update offset directly as well
      this.ds.offset[0] += panX / this.ds.scale
      this.ds.offset[1] += panY / this.ds.scale
      this.onPan(panX, panY)
    }

    this.animFrameId = requestAnimationFrame(this.loop)
  }
}
