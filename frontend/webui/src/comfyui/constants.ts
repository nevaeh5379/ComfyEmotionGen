/**
 * Subgraph 상수
 * ComfyUI_frontend: src/lib/litegraph/src/constants.ts
 */

/** Subgraph의 가상 입력 노드 ID (내부에서는 output-side로 동작) */
export const SUBGRAPH_INPUT_ID = -10

/** Subgraph의 가상 출력 노드 ID (내부에서는 input-side로 동작) */
export const SUBGRAPH_OUTPUT_ID = -20

/** Subgraph 정의 ID는 UUID 형식 */
export type SubgraphId = string

/** UUID 형식 검증 (느슨한 캐노니컬 UUID) */
export function isUuidShapedSubgraphId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  )
}

/** 새 SubgraphId 생성 */
export function createSubgraphId(): SubgraphId {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }
  // 폴백: Math.random 기반 UUID v4 흉내
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (c: string): string => {
      const r = (Math.random() * 16) | 0
      const v = c === "x" ? r : (r & 0x3) | 0x8
      return v.toString(16)
    }
  )
}
