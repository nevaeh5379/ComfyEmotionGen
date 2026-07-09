import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react"

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
  const previewSourceKey = canLoadPreview
    ? `${cleanBackendUrl}:${workerId}`
    : null
  const previewRequestKey = previewSourceKey !== null
    ? `${previewSourceKey}:${String(previewToken)}`
    : null
  const [preview, setPreview] = useState<{
    requestKey: string
    sourceKey: string
    url: string
  } | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const sourceKeyRef = useRef<string | null>(null)

  useEffect((): (() => void) => {
    return (): void => {
      if (objectUrlRef.current !== null) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  useEffect((): (() => void) | undefined => {
    if (
      previewRequestKey === null ||
      previewSourceKey === null ||
      workerId === null ||
      workerId === undefined
    ) {
      if (objectUrlRef.current !== null) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      sourceKeyRef.current = null
      return undefined
    }

    if (
      sourceKeyRef.current !== null &&
      sourceKeyRef.current !== previewSourceKey &&
      objectUrlRef.current !== null
    ) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    sourceKeyRef.current = previewSourceKey

    const encodedWorkerId = encodeURIComponent(workerId)
    const controller = new AbortController()
    let stagedUrl: string | null = null

    const fetchPreview = async (): Promise<void> => {
      try {
        const res = await fetch(
          `${cleanBackendUrl}/workers/${encodedWorkerId}/preview`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        )
        if (!res.ok) return
        const blob = await res.blob()
        if (controller.signal.aborted) return

        stagedUrl = URL.createObjectURL(blob)
        if (objectUrlRef.current !== null) {
          URL.revokeObjectURL(objectUrlRef.current)
        }
        objectUrlRef.current = stagedUrl
        setPreview({
          requestKey: previewRequestKey,
          sourceKey: previewSourceKey,
          url: stagedUrl,
        })
        stagedUrl = null
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
      }
    }

    void fetchPreview()

    return (): void => {
      controller.abort()
      if (stagedUrl !== null) {
        URL.revokeObjectURL(stagedUrl)
      }
    }
  }, [cleanBackendUrl, previewRequestKey, previewSourceKey, workerId])

  const previewUrl =
    preview?.sourceKey === previewSourceKey ? preview.url : null
  if (previewSourceKey === null || previewUrl === null) {
    return null
  }
  return <img {...imgProps} src={previewUrl} />
}
