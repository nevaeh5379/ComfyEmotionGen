const injected = (window as { COMFY_EMOTION_GEN_BACKEND_URL?: string })
  .COMFY_EMOTION_GEN_BACKEND_URL

export const PACKAGE_BACKEND_URL: string | null =
  typeof injected === "string" && injected.length > 0 ? injected : null

export const IS_PACKAGE_MODE: boolean = PACKAGE_BACKEND_URL !== null

export const DEFAULT_BACKEND_URL: string =
  PACKAGE_BACKEND_URL ?? "http://localhost:8000"
