import JSZip from "jszip"

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
  return img.originalFilename || `${img.hash}.${img.extension || "png"}`
}

export async function downloadImagesAsZip(
  imageUrls: Array<{ url: string; filename: string }>,
  zipName: string = "images.zip"
): Promise<void> {
  if (imageUrls.length === 0) return

  const zip = new JSZip()

  const results = await Promise.allSettled(
    imageUrls.map(async ({ url, filename }) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch ${url}`)
      const blob = await response.blob()
      return { filename, blob }
    })
  )

  const usedNames = new Set<string>()
  for (const result of results) {
    if (result.status !== "fulfilled") continue
    const { filename, blob } = result.value
    const uniqueName = deduplicateFilename(filename, usedNames)
    usedNames.add(uniqueName)
    zip.file(uniqueName, blob)
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  triggerBlobDownload(zipBlob, zipName)
}

function deduplicateFilename(
  filename: string,
  used: Set<string>
): string {
  if (!used.has(filename)) return filename
  const dot = filename.lastIndexOf(".")
  const base = dot >= 0 ? filename.slice(0, dot) : filename
  const ext = dot >= 0 ? filename.slice(dot) : ""
  let counter = 1
  let candidate = `${base}_${counter}${ext}`
  while (used.has(candidate)) {
    counter++
    candidate = `${base}_${counter}${ext}`
  }
  return candidate
}
