import { useEffect, useState, type ImgHTMLAttributes } from "react"

interface WorkerPreviewImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  backendUrl: string
  workerId: string | null | undefined
  previewToken: number | undefined
  enabled?: boolean
}

export function WorkerPreviewImage({
  backendUrl,
  workerId,
  previewToken,
  enabled = true,
  ...imgProps
}: WorkerPreviewImageProps): React.JSX.Element | null {
  const cleanBackendUrl = backendUrl.replace(/\/+$/, "")
  const canLoadPreview =
    enabled &&
    workerId !== null &&
    workerId !== undefined &&
    workerId !== "" &&
    previewToken !== undefined

  const [currentUrl, setCurrentUrl] = useState<string | null>(null)

  useEffect((): (() => void) | undefined => {
    if (!canLoadPreview || workerId === null || workerId === undefined) {
      setCurrentUrl(null)
      return undefined
    }

    const encodedWorkerId = encodeURIComponent(workerId)
    const targetUrl = `${cleanBackendUrl}/workers/${encodedWorkerId}/preview?t=${String(previewToken)}`

    const img = new Image()
    img.onload = (): void => {
      setCurrentUrl(targetUrl)
    }
    img.src = targetUrl

    return (): void => {
      img.onload = null
      img.onerror = null
    }
  }, [cleanBackendUrl, canLoadPreview, workerId, previewToken])

  if (!canLoadPreview || currentUrl === null) {
    return null
  }

  return <img {...imgProps} src={currentUrl} />
}

