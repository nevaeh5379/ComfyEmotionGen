/**
 * 편집 결과 내보내기 — 합성 캔버스 → File/Blob, saved-images 업로드, 로컬 다운로드.
 */

import { triggerBlobDownload } from "../../../utils/downloadImages"

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("캔버스를 Blob으로 변환 실패"))
          return
        }
        resolve(blob)
      },
      "image/png"
    )
  })
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (blob) triggerBlobDownload(blob, filename)
  }, "image/png")
}

export function baseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "") || "image"
}

/**
 * saved-images에 업로드 — 백엔드가 SHA-256 해시로 저장 후 DB 기록.
 * 반환된 hash로 /saved-images/{hash} 접근 가능.
 */
export async function uploadToSavedImages(
  backendUrl: string,
  canvas: HTMLCanvasElement,
  filename: string
): Promise<{ hash: string; filename: string }> {
  const blob = await canvasToPngBlob(canvas)
  const file = new File([blob], filename, { type: "image/png" })
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${backendUrl}/saved-images/upload`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`saved-images 업로드 실패: ${text}`)
  }
  return (await res.json()) as { hash: string; filename: string }
}