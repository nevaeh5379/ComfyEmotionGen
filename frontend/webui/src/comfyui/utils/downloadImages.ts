export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function getImageFilename(img: {
  originalFilename?: string
  hash: string
  extension?: string
}): string {
  return img.originalFilename ?? `${img.hash}.${img.extension ?? "png"}`
}

export async function downloadImagesAsZip(
  imageUrls: { url: string; filename: string }[],
  zipName = "images.zip"
): Promise<void> {
  if (imageUrls.length === 0) return

  // ZIP creation is an infrequent, heavy feature. Load it on demand so the
  // library does not occupy the initial bundle/heap for every page visit.
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  const usedNames = new Set<string>()
  let nextIndex = 0
  let addedCount = 0
  const workerCount = Math.min(4, imageUrls.length)

  // Bound concurrent responses: fetching every full-resolution image at once
  // can create a large transient memory spike before JSZip starts processing.
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < imageUrls.length) {
        const index = nextIndex++
        const item = imageUrls[index]
        if (item === undefined) continue
        try {
          const response = await fetch(item.url)
          if (!response.ok) throw new Error(`Failed to fetch ${item.url}`)
          const blob = await response.blob()
          const uniqueName = deduplicateFilename(item.filename, usedNames)
          usedNames.add(uniqueName)
          zip.file(uniqueName, blob)
          addedCount += 1
        } catch {
          // Preserve the existing best-effort behavior: failed images are
          // skipped while the remaining archive is still downloaded.
        }
      }
    })
  )

  if (addedCount === 0) return

  const zipBlob = await zip.generateAsync({ type: "blob" })
  triggerBlobDownload(zipBlob, zipName)
}

function deduplicateFilename(filename: string, used: Set<string>): string {
  if (!used.has(filename)) return filename
  const dot = filename.lastIndexOf(".")
  const base = dot >= 0 ? filename.slice(0, dot) : filename
  const ext = dot >= 0 ? filename.slice(dot) : ""
  let counter = 1
  let candidate = `${base}_${String(counter)}${ext}`
  while (used.has(candidate)) {
    counter++
    candidate = `${base}_${String(counter)}${ext}`
  }
  return candidate
}
