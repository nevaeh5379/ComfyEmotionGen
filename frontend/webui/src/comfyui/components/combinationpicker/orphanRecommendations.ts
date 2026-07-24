import type { SavedImage } from "../../types/Message"
import type { RenderItem } from "./CombinationPickerComponents"

export interface AxisRename {
  from: string
  to: string
  value: string
}

export interface OrphanRecommendation {
  target: RenderItem
  score: number
  confidence: "high" | "medium" | "low"
  axisRenames: AxisRename[]
  matchingAxes: number
  addedAxes: string[]
  removedAxes: string[]
}

function axisMeta(meta: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(meta ?? {}).filter(
      ([key]) => !key.startsWith("set.") && key !== "source" && key !== "mode"
    )
  )
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1)
  )
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection++
  return intersection / (left.size + right.size - intersection)
}

function scoreCandidate(
  filename: string,
  image: SavedImage,
  target: RenderItem
): OrphanRecommendation {
  const sourceMeta = axisMeta(image.meta)
  const targetMeta = axisMeta(target.meta)
  const unmatchedSource = new Map(Object.entries(sourceMeta))
  const unmatchedTarget = new Map(Object.entries(targetMeta))
  let matchingAxes = 0

  for (const [key, value] of Object.entries(sourceMeta)) {
    if (targetMeta[key] === value) {
      matchingAxes++
      unmatchedSource.delete(key)
      unmatchedTarget.delete(key)
    }
  }

  const axisRenames: AxisRename[] = []
  for (const [sourceKey, sourceValue] of Array.from(unmatchedSource)) {
    const matches = Array.from(unmatchedTarget).filter(
      ([, targetValue]) => targetValue === sourceValue
    )
    if (matches.length !== 1) continue
    const match = matches[0]
    if (match === undefined) continue
    const [targetKey] = match
    axisRenames.push({ from: sourceKey, to: targetKey, value: sourceValue })
    unmatchedSource.delete(sourceKey)
    unmatchedTarget.delete(targetKey)
  }

  const sameValues = matchingAxes + axisRenames.length
  const axisTotal = Math.max(Object.keys(sourceMeta).length, Object.keys(targetMeta).length, 1)
  const axisSimilarity = sameValues / axisTotal
  const filenameSimilarity = jaccard(tokens(filename), tokens(target.filename))
  const promptSimilarity = jaccard(tokens(image.prompt), tokens(target.prompt))
  const sourceSets = Object.entries(image.meta ?? {}).filter(([key]) => key.startsWith("set."))
  const matchingSets = sourceSets.filter(([key, value]) => target.meta[key] === value).length
  const setSimilarity = sourceSets.length === 0 ? 1 : matchingSets / sourceSets.length
  const structuralPenalty = unmatchedSource.size + unmatchedTarget.size

  const rawScore =
    axisSimilarity * 60 +
    filenameSimilarity * 18 +
    promptSimilarity * 8 +
    setSimilarity * 14 -
    structuralPenalty * 4
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  return {
    target,
    score,
    confidence: score >= 85 ? "high" : score >= 65 ? "medium" : "low",
    axisRenames,
    matchingAxes,
    addedAxes: Array.from(unmatchedTarget.keys()),
    removedAxes: Array.from(unmatchedSource.keys()),
  }
}

export function recommendOrphanTarget(
  filename: string,
  images: SavedImage[],
  targets: RenderItem[]
): OrphanRecommendation | null {
  const image = images[0]
  if (image === undefined || targets.length === 0) return null
  const ranked = targets
    .map((target) => scoreCandidate(filename, image, target))
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]
  const second = ranked[1]
  if (best === undefined || best.score < 45) return null
  if (second !== undefined && best.score - second.score < 3 && best.score < 85) {
    return { ...best, confidence: "low" }
  }
  return best
}

/** Build all recommendations through an axis-value index instead of O(G×T). */
export function buildOrphanRecommendations(
  groups: Map<string, SavedImage[]>,
  targets: RenderItem[]
): Map<string, OrphanRecommendation> {
  const targetIndexesByValue = new Map<string, Set<number>>()
  targets.forEach((target, index) => {
    for (const value of new Set(Object.values(axisMeta(target.meta)))) {
      const indexes = targetIndexesByValue.get(value)
      if (indexes === undefined) targetIndexesByValue.set(value, new Set([index]))
      else indexes.add(index)
    }
  })

  const recommendations = new Map<string, OrphanRecommendation>()
  for (const [filename, images] of groups) {
    const image = images[0]
    if (image === undefined) continue
    const candidateIndexes = new Set<number>()
    for (const value of new Set(Object.values(axisMeta(image.meta)))) {
      for (const index of targetIndexesByValue.get(value) ?? []) {
        candidateIndexes.add(index)
      }
    }
    if (candidateIndexes.size === 0) continue
    const candidates: RenderItem[] = []
    for (const index of candidateIndexes) {
      const target = targets[index]
      if (target !== undefined) candidates.push(target)
    }
    const recommendation = recommendOrphanTarget(filename, images, candidates)
    if (recommendation !== null) recommendations.set(filename, recommendation)
  }
  return recommendations
}

export function metaForTarget(
  image: SavedImage,
  target: RenderItem
): Record<string, string> {
  const preserved = Object.fromEntries(
    Object.entries(image.meta ?? {}).filter(
      ([key]) => key.startsWith("set.") || key === "source" || key === "mode"
    )
  )
  return { ...preserved, ...axisMeta(target.meta) }
}
