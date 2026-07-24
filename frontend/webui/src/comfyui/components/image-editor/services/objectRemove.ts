/**
 * 객체 제거(LaMa) 서비스 — POST /inpaint/remove 호출.
 */

export interface InpaintCapabilities {
  enabled: boolean
  device: "cpu" | "cuda" | null
  reason: string | null
}

export async function fetchInpaintCapabilities(
  backendUrl: string
): Promise<InpaintCapabilities> {
  try {
    const res = await fetch(`${backendUrl}/inpaint/capabilities`)
    if (!res.ok)
      return { enabled: false, device: null, reason: "지원 정보 조회 실패" }
    return (await res.json()) as InpaintCapabilities
  } catch {
    return { enabled: false, device: null, reason: "백엔드 연결 불가" }
  }
}

/**
 * 이미지 + 마스크를 LaMa로 전송하여 객체 제거 결과 PNG Blob 반환.
 * mask: 흰색(255)=제거 영역.
 */
export async function removeObject(
  backendUrl: string,
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement
): Promise<Blob> {
  const imageBlob = await canvasToPngBlob(imageCanvas)
  const maskBlob = await canvasToPngBlob(maskCanvas)
  const imageFile = new File([imageBlob], "source.png", { type: "image/png" })
  const maskFile = new File([maskBlob], "mask.png", { type: "image/png" })
  const form = new FormData()
  form.append("image", imageFile)
  form.append("mask", maskFile)
  const res = await fetch(`${backendUrl}/inpaint/remove`, {
    method: "POST",
    body: form,
  })
  if (res.status === 503) {
    throw new Error(
      "백엔드에 LaMa 의존성이 설치되어 있지 않습니다. requirements-inpaint.txt 설치 필요."
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`객체 제거 실패: ${text}`)
  }
  return await res.blob()
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("캔버스를 Blob으로 변환 실패"))
        return
      }
      resolve(blob)
    }, "image/png")
  })
}
