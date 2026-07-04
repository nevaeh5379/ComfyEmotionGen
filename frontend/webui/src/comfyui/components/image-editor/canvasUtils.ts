/**
 * 캔버스 유틸 — 픽셀 좌표 변환, 브러시 드로잉, flood fill(매직완드),
 * 조정 레이어 픽셀 변환, 합성 렌더.
 */

import type { AdjustSettings, Layer, Selection, ViewTransform } from "./types"

/** #rrggbb 또는 #rgb → rgba(...) 문자열. alpha는 "0"~"1" 문자열. */
export function hexToRgba(hex: string, alpha: string): string {
  let h = hex.replace("#", "")
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("")
  const r = Number.parseInt(h.slice(0, 2) ?? "ff", 16)
  const g = Number.parseInt(h.slice(2, 4) ?? "ff", 16)
  const b = Number.parseInt(h.slice(4, 6) ?? "ff", 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: React.PointerEvent<HTMLCanvasElement>
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

/** 표시 좌표(clientX/Y) → 이미지 픽셀 좌표(줌/팬 반영).
 *  캔버스는 margin(flex center) + transformOrigin center + translate(pan) scale(zoom)으로 렌더되므로
 *  getBoundingClientRect()는 변환 후의 화면 박스(zoom·pan 반영)를 반환한다.
 *  중앙(center) 기준 스케일이므로 화면 박스의 중심은 (W/2, H/2) 이미지 픽셀에 대응.
 *  img = (client - rect.center) / scale + W/2
 */
export function clientToImagePoint(
  clientX: number,
  clientY: number,
  displayCanvas: HTMLCanvasElement,
  _view: ViewTransform
): { x: number; y: number } {
  const rect = displayCanvas.getBoundingClientRect()
  const scale = rect.width / displayCanvas.width
  return {
    x: (clientX - rect.left - rect.width / 2) / scale + displayCanvas.width / 2,
    y:
      (clientY - rect.top - rect.height / 2) / scale + displayCanvas.height / 2,
  }
}

export function getBrushSpacing(brushSize: number): number {
  const stepPercentage = Math.pow(100, 5 / 100) / 100
  return Math.max(1, brushSize * stepPercentage)
}

export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mode: "paint" | "erase",
  hardness: number,
  opacity: number,
  color = "#ffffff"
): void {
  const radius = Math.max(0.5, size / 2)
  ctx.save()
  ctx.globalCompositeOperation =
    mode === "paint" ? "source-over" : "destination-out"
  if (mode === "erase") {
    ctx.fillStyle = "rgb(0, 0, 0)"
  } else if (hardness >= 1 && opacity >= 1) {
    ctx.fillStyle = color
  } else {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    const innerAlpha = Math.min(1, Math.max(0, opacity)).toFixed(3)
    const hardStop = Math.min(1, Math.max(0, hardness))
    const innerColor = hexToRgba(color, innerAlpha)
    gradient.addColorStop(0, innerColor)
    gradient.addColorStop(hardStop, innerColor)
    gradient.addColorStop(1, hexToRgba(color, "0"))
    ctx.fillStyle = gradient
  }
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 두 점 사이를 브러시 간격으로 채우며 stroke. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
  mode: "paint" | "erase",
  hardness: number,
  opacity: number,
  color = "#ffffff"
): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil(distance / getBrushSpacing(size)))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    drawDot(
      ctx,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      size,
      mode,
      hardness,
      opacity,
      color
    )
  }
}

/**
 * flood fill — 매직완드. 시작점과 색상 차이가 tolerance 이내인 연결 영역을 마스크로.
 * 반환: 알파 마스크 캔버스(흰=선택).
 */
export function floodFill(
  sourceCanvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  tolerance: number,
  contiguous: boolean
): HTMLCanvasElement {
  const ctx = sourceCanvas.getContext("2d")
  if (!ctx) throw new Error("canvas context unavailable")
  const w = sourceCanvas.width
  const h = sourceCanvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const sx = Math.floor(startX)
  const sy = Math.floor(startY)
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return blankMaskCanvas(w, h)
  const startIdx = (sy * w + sx) * 4
  const sr = data[startIdx] ?? 0
  const sg = data[startIdx + 1] ?? 0
  const sb = data[startIdx + 2] ?? 0
  const tol = Math.max(0, tolerance)
  const mask = new Uint8Array(w * h)
  const visited = new Uint8Array(w * h)

  const matches = (idx: number): boolean => {
    const dr = (data[idx] ?? 0) - sr
    const dg = (data[idx + 1] ?? 0) - sg
    const db = (data[idx + 2] ?? 0) - sb
    return Math.sqrt(dr * dr + dg * dg + db * db) <= tol
  }

  if (contiguous) {
    const stack: number[] = [sy * w + sx]
    while (stack.length > 0) {
      const p = stack.pop()!
      if (p < 0 || p >= w * h) continue
      if (visited[p]) continue
      visited[p] = 1
      const idx = p * 4
      if (!matches(idx)) continue
      mask[p] = 255
      const x = p % w
      const y = Math.floor(p / w)
      if (x > 0) stack.push(p - 1)
      if (x < w - 1) stack.push(p + 1)
      if (y > 0) stack.push(p - w)
      if (y < h - 1) stack.push(p + w)
    }
  } else {
    for (let p = 0; p < w * h; p += 1) {
      if (matches(p * 4)) mask[p] = 255
    }
  }

  const out = blankMaskCanvas(w, h)
  const outCtx = out.getContext("2d")
  if (!outCtx) return out
  const outData = outCtx.createImageData(w, h)
  for (let i = 0; i < mask.length; i += 1) {
    outData.data[i * 4] = 255
    outData.data[i * 4 + 1] = 255
    outData.data[i * 4 + 2] = 255
    outData.data[i * 4 + 3] = mask[i] ?? 0
  }
  outCtx.putImageData(outData, 0, 0)
  return out
}

export function blankMaskCanvas(
  width: number,
  height: number
): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = width
  c.height = height
  return c
}

/** 조정 레이어 픽셀 변환 적용 — ImageData를 새로 만들어 반환. */
export function applyAdjust(
  source: ImageData,
  settings: AdjustSettings
): ImageData {
  const { brightness, contrast, saturation, blur, sharpen } = settings
  const out = new ImageData(
    new Uint8ClampedArray(source.data),
    source.width,
    source.height
  )
  const data = out.data

  // 밝기/대비/채도
  const b = brightness / 100
  const c = contrast / 100
  const s = 1 + saturation / 100
  const contrastFactor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255))

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] ?? 0
    let g = data[i + 1] ?? 0
    let bl = data[i + 2] ?? 0
    // 밝기
    r = r + b * 255
    g = g + b * 255
    bl = bl + b * 255
    // 대비
    r = contrastFactor * (r - 128) + 128
    g = contrastFactor * (g - 128) + 128
    bl = contrastFactor * (bl - 128) + 128
    // 채도 (회색 평균 기준)
    const gray = (r + g + bl) / 3
    r = gray + (r - gray) * s
    g = gray + (g - gray) * s
    bl = gray + (bl - gray) * s
    data[i] = Math.max(0, Math.min(255, r))
    data[i + 1] = Math.max(0, Math.min(255, g))
    data[i + 2] = Math.max(0, Math.min(255, bl))
  }

  // 블러/샤픈은 별도 패스 — 단순 박스 블러 + 언샵 마스크.
  if (blur > 0) {
    boxBlur(out, Math.max(1, Math.round(blur)))
  }
  if (sharpen > 0) {
    sharpenPass(out, sharpen / 20)
  }
  return out
}

function boxBlur(image: ImageData, radius: number): void {
  const { width: w, height: h, data } = image
  const copy = new Uint8ClampedArray(data)
  const r = Math.max(1, radius)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0,
        count = 0
      for (let dy = -r; dy <= r; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const idx = (ny * w + nx) * 4
          sr += copy[idx] ?? 0
          sg += copy[idx + 1] ?? 0
          sb += copy[idx + 2] ?? 0
          sa += copy[idx + 3] ?? 0
          count += 1
        }
      }
      const o = (y * w + x) * 4
      data[o] = sr / count
      data[o + 1] = sg / count
      data[o + 2] = sb / count
      data[o + 3] = sa / count
    }
  }
}

function sharpenPass(image: ImageData, amount: number): void {
  const { width: w, height: h, data } = image
  const copy = new Uint8ClampedArray(data)
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  const kSize = 3
  const half = 1
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sr = 0,
        sg = 0,
        sb = 0
      for (let ky = 0; ky < kSize; ky += 1) {
        for (let kx = 0; kx < kSize; kx += 1) {
          const px = Math.min(w - 1, Math.max(0, x + kx - half))
          const py = Math.min(h - 1, Math.max(0, y + ky - half))
          const idx = (py * w + px) * 4
          const k = kernel[ky * kSize + kx] ?? 0
          sr += (copy[idx] ?? 0) * k
          sg += (copy[idx + 1] ?? 0) * k
          sb += (copy[idx + 2] ?? 0) * k
        }
      }
      const o = (y * w + x) * 4
      const origR = copy[o] ?? 0
      const origG = copy[o + 1] ?? 0
      const origB = copy[o + 2] ?? 0
      data[o] = Math.max(0, Math.min(255, origR + (sr - origR) * amount))
      data[o + 1] = Math.max(0, Math.min(255, origG + (sg - origG) * amount))
      data[o + 2] = Math.max(0, Math.min(255, origB + (sb - origB) * amount))
    }
  }
}

/**
 * 모든 레이어를 합성하여 대상 캔버스에 렌더.
 * 조정 레이어는 아래 누적 합성 결과에 applyAdjust를 적용.
 */
export function compositeLayers(
  layers: Layer[],
  target: HTMLCanvasElement
): void {
  const ctx = target.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, target.width, target.height)
  let accumulated: ImageData | null = null
  for (const layer of layers) {
    if (!layer.visible) continue
    if (layer.kind === "image") {
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(layer.canvas, layer.offsetX, layer.offsetY)
      ctx.restore()
      // 누적 합성 결과 갱신
      accumulated = ctx.getImageData(0, 0, target.width, target.height)
    } else if (layer.kind === "adjustment" && layer.adjust && accumulated) {
      const adjusted = applyAdjust(accumulated, layer.adjust)
      ctx.putImageData(adjusted, 0, 0)
      accumulated = adjusted
    }
  }
}

/**
 * 선택 영역을 클리핑 마스크로 적용 — 컨텍스트에 clip 설정.
 * 선택 없으면 적용 안 함.
 */
export function applySelectionClip(
  ctx: CanvasRenderingContext2D,
  selection: Selection | null
): void {
  if (!selection) return
  if (selection.maskCanvas) {
    ctx.save()
    ctx.beginPath()
    // maskCanvas 알파를 clip 경로로 사용 — drawImage로 마스킹 합성이 더 간단.
    // 여기서는 clip 없이 호출자가 마스크 기반 합성하도록 정보만 반환하는 패턴이 더 단순.
    // 실제 clip은 path 기반만 지원하므로 라소/매직완드는 별도 마스킹 패스 사용.
    ctx.restore()
  } else if (selection.rect) {
    const { x, y, w, h } = selection.rect
    ctx.save()
    ctx.beginPath()
    if (selection.type === "ellipse") {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.rect(x, y, w, h)
    }
    ctx.clip()
  }
}

/** 선택 영역 내용을 삭제(알파 0). 마스크 선택은 maskCanvas 알파로 삭제. */
export function clearSelectionArea(
  ctx: CanvasRenderingContext2D,
  selection: Selection,
  width: number,
  height: number
): void {
  if (selection.maskCanvas) {
    ctx.save()
    ctx.globalCompositeOperation = "destination-out"
    ctx.drawImage(selection.maskCanvas, 0, 0)
    ctx.restore()
  } else if (selection.rect) {
    const { x, y, w, h } = selection.rect
    ctx.save()
    if (selection.type === "ellipse") {
      // 타원 영역 삭제
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.clearRect(0, 0, width, height)
    } else {
      ctx.clearRect(x, y, w, h)
    }
    ctx.restore()
  }
}

/**
 * 선택 영역을 새 캔버스로 잘라내기(이동용).
 * 반환: 잘라낸 픽셀 캔버스. 원본은 알파 0 됨.
 */
export function cutSelectionToCanvas(
  sourceCanvas: HTMLCanvasElement,
  selection: Selection
): HTMLCanvasElement {
  const ctx = sourceCanvas.getContext("2d")
  if (!ctx) throw new Error("context unavailable")
  const out = document.createElement("canvas")
  out.width = sourceCanvas.width
  out.height = sourceCanvas.height
  const outCtx = out.getContext("2d")!
  if (selection.maskCanvas) {
    outCtx.drawImage(sourceCanvas, 0, 0)
    // 마스크 영역만 남기기
    outCtx.globalCompositeOperation = "destination-in"
    outCtx.drawImage(selection.maskCanvas, 0, 0)
    outCtx.globalCompositeOperation = "source-over"
    // 원본에서 마스크 영역 삭제
    ctx.save()
    ctx.globalCompositeOperation = "destination-out"
    ctx.drawImage(selection.maskCanvas, 0, 0)
    ctx.restore()
  } else if (selection.rect) {
    const { x, y, w, h } = selection.rect
    outCtx.drawImage(sourceCanvas, 0, 0)
    outCtx.save()
    outCtx.globalCompositeOperation = "destination-in"
    if (selection.type === "ellipse") {
      outCtx.beginPath()
      outCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      outCtx.fill()
    } else {
      outCtx.fillRect(x, y, w, h)
    }
    outCtx.restore()
    // 원본에서 영역 삭제
    clearSelectionArea(ctx, selection, sourceCanvas.width, sourceCanvas.height)
  }
  return out
}
