export type NodeCategory = "loader" | "sampler" | "conditioning" | "latent" | "image" | "other"

export interface CategoryStyle {
  bg: string
  border: string
  hex: string
}

const CATEGORY_STYLES: Record<NodeCategory, CategoryStyle> = {
  loader:       { bg: "bg-blue-500",    border: "border-blue-500",    hex: "#3b82f6" },
  sampler:      { bg: "bg-emerald-500", border: "border-emerald-500", hex: "#10b981" },
  conditioning: { bg: "bg-amber-500",   border: "border-amber-500",   hex: "#f59e0b" },
  latent:       { bg: "bg-purple-500",  border: "border-purple-500",  hex: "#8b5cf6" },
  image:        { bg: "bg-pink-500",    border: "border-pink-500",    hex: "#ec4899" },
  other:        { bg: "bg-gray-500",    border: "border-gray-500",    hex: "#6b7280" },
}

export function getCategoryStyle(classType: string): CategoryStyle {
  const lower = classType.toLowerCase()
  if (lower.includes("loader") || lower.includes("load") || lower.includes("lora")) return CATEGORY_STYLES.loader
  if (lower.includes("sampler") || lower.includes("ksampler")) return CATEGORY_STYLES.sampler
  if (lower.includes("encode") || lower.includes("conditioning") || lower.includes("clip")) return CATEGORY_STYLES.conditioning
  if (lower.includes("vae") || lower.includes("latent")) return CATEGORY_STYLES.latent
  if (lower.includes("image") || lower.includes("preview") || lower.includes("save")) return CATEGORY_STYLES.image
  return CATEGORY_STYLES.other
}
