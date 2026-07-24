/**
 * Subgraph API - 글로벌/로컬 subgraph 블루프린트 관리
 * ComfyUI_frontend: src/scripts/api.ts (getGlobalSubgraphs, getGlobalSubgraphData) 참고
 *
 * CEG 백엔드는 ComfyUI 프록시이므로, 글로벌 subgraph 엔드포인트는
 * 외부 ComfyUI 서버에 위임. 로컬 블루프린트는 localStorage 사용.
 */

import type { SubgraphDefinition } from "@/comfyui/types/subgraph"

/** 로컬에 저장된 블루프린트 메타데이터 */
export interface SubgraphBlueprintMeta {
  /** 블루프린트 고유 이름 (파일명 역할) */
  name: string
  /** 표시명 */
  displayName: string
  /** 카테고리 (노드 팔레트용) */
  category: string
  /** 생성 시각 (ISO) */
  createdAt: string
  /** 수정 시각 (ISO) */
  modifiedAt: string
  /** 블루프린트 정의 (SubgraphDefinition) */
  definition: SubgraphDefinition
}

const STORAGE_KEY = "ceg_subgraph_blueprints"

/** 로컬 블루프린트 전체 목록 로드 */
export function listLocalBlueprints(): SubgraphBlueprintMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as SubgraphBlueprintMeta[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn("[subgraphApi] listLocalBlueprints 실패:", err)
    return []
  }
}

/** 로컬 블루프린트 저장 (upsert by name) */
export function saveLocalBlueprint(meta: SubgraphBlueprintMeta): void {
  const existing = listLocalBlueprints()
  const idx = existing.findIndex((b) => b.name === meta.name)
  if (idx >= 0) {
    existing[idx] = { ...meta, modifiedAt: new Date().toISOString() }
  } else {
    existing.push({
      ...meta,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    })
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
  } catch (err) {
    console.warn("[subgraphApi] saveLocalBlueprint 실패:", err)
  }
}

/** 로컬 블루프린트 삭제 (by name) */
export function deleteLocalBlueprint(name: string): void {
  const existing = listLocalBlueprints()
  const filtered = existing.filter((b) => b.name !== name)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (err) {
    console.warn("[subgraphApi] deleteLocalBlueprint 실패:", err)
  }
}

/** 이름으로 로컬 블루프린트 조회 */
export function getLocalBlueprint(name: string): SubgraphBlueprintMeta | null {
  const existing = listLocalBlueprints()
  return existing.find((b) => b.name === name) ?? null
}

/**
 * 글로벌 subgraph 목록 조회 (외부 ComfyUI 서버).
 * CEG 백엔드가 프록시하므로, /global_subgraphs 엔드포인트가 있으면 사용.
 * 없으면 빈 배열 반환.
 */
export interface GlobalSubgraphInfo {
  id: string
  name: string
  category?: string
  description?: string
}

export async function getGlobalSubgraphs(): Promise<GlobalSubgraphInfo[]> {
  try {
    const resp = await fetch("/global_subgraphs")
    if (!resp.ok) return []
    const data = (await resp.json()) as GlobalSubgraphInfo[]
    return Array.isArray(data) ? data : []
  } catch {
    // 엔드포인트 미지원 시 빈 배열
    return []
  }
}

/** 글로벌 subgraph 정의 데이터 조회 */
export async function getGlobalSubgraphData(
  id: string
): Promise<SubgraphDefinition | null> {
  try {
    const resp = await fetch(`/global_subgraphs/${encodeURIComponent(id)}`)
    if (!resp.ok) return null
    return (await resp.json()) as SubgraphDefinition
  } catch {
    return null
  }
}
