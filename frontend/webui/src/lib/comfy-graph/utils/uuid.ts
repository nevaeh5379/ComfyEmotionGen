/**
 * UUID 유틸리티
 * ComfyUI_frontend: src/utils/uuid.ts
 */

export type UUID = string

/** Special-case zero-UUID, consisting entirely of zeros. Used as a default value. */
export const zeroUuid = "00000000-0000-0000-0000-000000000000"

/** Pre-allocated storage for uuid random values. */
const randomStorage = new Uint32Array(31)

/**
 * Creates a UUIDv4 string.
 * @returns A new UUIDv4 string
 */
export function createUuidv4(): UUID {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID()
  if (typeof crypto?.getRandomValues === "function") {
    const random = crypto.getRandomValues(randomStorage)
    let i = 0
    return "10000000-1000-4000-8000-100000000000".replaceAll(/[018]/g, (a) =>
      (
        Number(a) ^
        ((random[i++] * 3.725_290_298_461_914e-9) >> (Number(a) * 0.25))
      ).toString(16)
    )
  }
  return "10000000-1000-4000-8000-100000000000".replaceAll(/[018]/g, (a) =>
    (Number(a) ^ ((Math.random() * 16) >> (Number(a) * 0.25))).toString(16)
  )
}
