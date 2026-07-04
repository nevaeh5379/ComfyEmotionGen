/**
 * 이미지 편집기 공통 타입.
 */

export type ToolId =
  | "move"
  | "brush"
  | "erase"
  | "rect-select"
  | "ellipse-select"
  | "lasso"
  | "magic-wand"
  | "clone"
  | "heal"
  | "crop"
  | "object-remove"
  | "adjust"

export type AdjustKind =
  | "brightness"
  | "contrast"
  | "saturation"
  | "blur"
  | "sharpen"

export interface BrushSettings {
  size: number
  hardness: number
  opacity: number
  color: string
}

export interface CloneSettings {
  /** Alt+클릭으로 설정한 source점(이미지 픽셀 좌표계). null = 미설정. */
  sourcePoint: { x: number; y: number } | null
  size: number
  opacity: number
}

export interface MagicWandSettings {
  tolerance: number
  contiguous: boolean
}

export interface AdjustSettings {
  brightness: number // -100 ~ 100
  contrast: number // -100 ~ 100
  saturation: number // -100 ~ 100
  blur: number // 0 ~ 20 (px)
  sharpen: number // 0 ~ 20 (강도)
}

export const DEFAULT_BRUSH: BrushSettings = {
  size: 56,
  hardness: 1,
  opacity: 1,
  color: "#ffffff",
}

export const DEFAULT_CLONE: CloneSettings = {
  sourcePoint: null,
  size: 56,
  opacity: 1,
}

export const DEFAULT_MAGIC_WAND: MagicWandSettings = {
  tolerance: 32,
  contiguous: true,
}

export const DEFAULT_ADJUST: AdjustSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  sharpen: 0,
}

export type LayerKind = "image" | "adjustment"

export interface Layer {
  id: string
  name: string
  kind: LayerKind
  /** off-screen 캔버스(이미지 픽셀 좌표계). */
  canvas: HTMLCanvasElement
  visible: boolean
  opacity: number // 0 ~ 1
  offsetX: number
  offsetY: number
  /** 조정 레이어일 경우 설정값. */
  adjust?: AdjustSettings | undefined
  /** 이 레이어가 마스크(객체 제거 결과)에 의해 생성되었는지. */
  removable?: boolean
  /** 썸네일 업데이트 감지를 위한 타임스탬프 */
  updatedAt?: number
}

export type SelectionType = "rect" | "ellipse" | "lasso" | "magic"

export interface Selection {
  type: SelectionType
  /** 사각/타원: 정규화된 픽셀 좌표. */
  rect?: { x: number; y: number; w: number; h: number }
  /** 라소/매직완드: 알파 마스크 캔버스(이미지 픽셀 좌표계). */
  maskCanvas?: HTMLCanvasElement
}

export interface Point {
  x: number
  y: number
}

export interface ViewTransform {
  zoom: number
  pan: { x: number; y: number }
}

export const CANVAS_MAX_SIZE = 1600
export const HISTORY_MAX = 30
export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 8

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}