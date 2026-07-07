async function blobToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("Canvas is not available")
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((pngBlob) => {
      if (pngBlob === null) {
        reject(new Error("Failed to convert image"))
        return
      }
      resolve(pngBlob)
    }, "image/png")
  })
}

export async function copyImageUrlToClipboard(imageUrl: string): Promise<void> {
  if (
    typeof ClipboardItem === "undefined" ||
    navigator.clipboard?.write === undefined
  ) {
    throw new Error("Image clipboard is not supported")
  }

  const res = await fetch(imageUrl, { cache: "no-store" })
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${String(res.status)}`)

  const sourceBlob = await res.blob()
  const clipboardBlob =
    sourceBlob.type === "image/png" ? sourceBlob : await blobToPng(sourceBlob)

  await navigator.clipboard.write([
    new ClipboardItem({ [clipboardBlob.type || "image/png"]: clipboardBlob }),
  ])
}
