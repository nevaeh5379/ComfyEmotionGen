import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"

export type FreeGroupBy =
  | "filename"
  | "parsedFilename"
  | "tags"
  | "savedTemplate"

export const FREE_GROUP_LABELS: Record<FreeGroupBy, string> = {
  filename: "파일명별",
  parsedFilename: "파일명 패턴 파싱",
  tags: "태그별",
  savedTemplate: "저장된 템플릿별",
}

const FREE_GROUP_KEYS = new Set<FreeGroupBy>([
  "filename",
  "parsedFilename",
  "tags",
  "savedTemplate",
])

export const CURRENT_TEMPLATE_ID = "__current__"
export const DEFAULT_AXIS = `template:${CURRENT_TEMPLATE_ID}`

export type AxisValue =
  | { kind: "template"; templateId: string } // "__current__" 이면 현재 편집 중인 cegTemplate
  | { kind: "free"; mode: FreeGroupBy }

export function encodeAxis(v: AxisValue): string {
  if (v.kind === "template")
    return `template:${v.templateId || CURRENT_TEMPLATE_ID}`
  return `free:${v.mode}`
}

export function decodeAxis(s: string): AxisValue {
  if (s.startsWith("template:")) {
    const id = s.slice("template:".length)
    return { kind: "template", templateId: id || CURRENT_TEMPLATE_ID }
  }
  if (s.startsWith("free:")) {
    const mode = s.slice("free:".length) as FreeGroupBy
    if (FREE_GROUP_KEYS.has(mode)) return { kind: "free", mode }
  }
  return { kind: "template", templateId: CURRENT_TEMPLATE_ID }
}

const NO_TAGS_KEY = "(태그 없음)"
const NO_TEMPLATE_KEY = "(템플릿 없음)"

function parseFilenameMeta(filename: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const tokens = filename.split("_")
  let fallbackIdx = 0
  for (const token of tokens) {
    if (!token) continue
    const dashIdx = token.indexOf("-")
    if (dashIdx > 0 && dashIdx < token.length - 1) {
      const key = token.slice(0, dashIdx)
      const value = token.slice(dashIdx + 1)
      if (key && value && !(key in meta)) {
        meta[key] = value
        continue
      }
    }
    meta[`tag_${fallbackIdx++}`] = token
  }
  return meta
}

function shortHash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36).slice(0, 8)
}

export function groupSavedImagesAsRenderItems(
  images: SavedImage[],
  mode: FreeGroupBy
): RenderItem[] {
  const active = images.filter((img) => img.status !== "trashed")

  if (mode === "filename") {
    const seen = new Set<string>()
    const items: RenderItem[] = []
    for (const img of active) {
      if (seen.has(img.originalFilename)) continue
      seen.add(img.originalFilename)
      items.push({ filename: img.originalFilename, prompt: "", meta: {} })
    }
    return items
  }

  if (mode === "parsedFilename") {
    const seen = new Set<string>()
    const items: RenderItem[] = []
    for (const img of active) {
      if (seen.has(img.originalFilename)) continue
      seen.add(img.originalFilename)
      items.push({
        filename: img.originalFilename,
        prompt: "",
        meta: parseFilenameMeta(img.originalFilename),
      })
    }
    return items
  }

  if (mode === "tags") {
    const tagBuckets = new Map<string, Set<string>>()
    for (const img of active) {
      const tagList = img.tags && img.tags.length > 0 ? img.tags : [NO_TAGS_KEY]
      for (const tag of tagList) {
        if (!tagBuckets.has(tag)) tagBuckets.set(tag, new Set())
        tagBuckets.get(tag)!.add(img.originalFilename)
      }
    }
    return Array.from(tagBuckets.entries()).map(([tag, filenames]) => ({
      filename: `tag:${tag}`,
      prompt: "",
      meta: { tag, count: String(filenames.size) },
    }))
  }

  // savedTemplate
  const tplBuckets = new Map<string, { label: string; files: Set<string> }>()
  for (const img of active) {
    const tpl = img.cegTemplate?.trim() ?? ""
    const key = tpl === "" ? NO_TEMPLATE_KEY : shortHash(tpl)
    const label = tpl === "" ? NO_TEMPLATE_KEY : `template:${key}`
    if (!tplBuckets.has(key)) tplBuckets.set(key, { label, files: new Set() })
    tplBuckets.get(key)!.files.add(img.originalFilename)
  }
  return Array.from(tplBuckets.entries()).map(([key, { label, files }]) => ({
    filename: label,
    prompt: "",
    meta:
      key === NO_TEMPLATE_KEY
        ? { template: NO_TEMPLATE_KEY, count: String(files.size) }
        : { templateHash: key, count: String(files.size) },
  }))
}

export function buildImagesByGroupKey(
  images: SavedImage[],
  mode: FreeGroupBy
): Map<string, SavedImage[]> {
  const map = new Map<string, SavedImage[]>()
  const active = images.filter((img) => img.status !== "trashed")

  const push = (key: string, img: SavedImage) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(img)
  }

  if (mode === "filename" || mode === "parsedFilename") {
    for (const img of active) push(img.originalFilename, img)
    return map
  }

  if (mode === "tags") {
    for (const img of active) {
      const tagList = img.tags && img.tags.length > 0 ? img.tags : [NO_TAGS_KEY]
      for (const tag of tagList) push(`tag:${tag}`, img)
    }
    return map
  }

  // savedTemplate
  for (const img of active) {
    const tpl = img.cegTemplate?.trim() ?? ""
    const key = tpl === "" ? NO_TEMPLATE_KEY : `template:${shortHash(tpl)}`
    push(key, img)
  }
  return map
}
