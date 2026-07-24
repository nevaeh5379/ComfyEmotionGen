/**
 * Canvas snapshots are raw RGBA buffers (width * height * 4 bytes). A fixed
 * step limit alone can retain hundreds of megabytes for large images, so keep
 * the familiar step limit while also enforcing a shared byte budget.
 */
export const IMAGE_HISTORY_MAX_BYTES = 128 * 1024 * 1024

function imageDataBytes(imageData: ImageData): number {
  return imageData.data.byteLength
}

export function enforceImageDataHistoryLimit(
  history: ImageData[],
  future: ImageData[],
  maxEntries: number,
  maxBytes = IMAGE_HISTORY_MAX_BYTES
): void {
  let entryCount = history.length + future.length
  let byteCount = 0
  for (const snapshot of history) byteCount += imageDataBytes(snapshot)
  for (const snapshot of future) byteCount += imageDataBytes(snapshot)

  while (entryCount > maxEntries || byteCount > maxBytes) {
    // Drop the least useful snapshot first: oldest undo, then furthest redo.
    // Always keep at least one snapshot so a single undo remains available
    // even when an unusually large canvas exceeds the byte budget by itself.
    let removed: ImageData | undefined
    if (history.length > 1) {
      removed = history.shift()
    } else if (future.length > 1) {
      removed = future.shift()
    } else if (history.length > 0 && future.length > 0) {
      removed = future.shift()
    } else {
      break
    }

    if (removed === undefined) break
    entryCount -= 1
    byteCount -= imageDataBytes(removed)
  }
}
