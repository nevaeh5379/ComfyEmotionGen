declare const __DEFAULT_BACKEND_PORT__: string | undefined

const injected = (window as { COMFY_EMOTION_GEN_BACKEND_URL?: string })
  .COMFY_EMOTION_GEN_BACKEND_URL

export const PACKAGE_BACKEND_URL: string | null =
  typeof injected === "string" && injected.length > 0 ? injected : null

export const IS_PACKAGE_MODE: boolean = PACKAGE_BACKEND_URL !== null

/**
 * Default backend port — can be overridden at build time via VITE_BACKEND_PORT.
 * Only affects the *fallback* URL when no runtime config (window global or
 * localStorage) is present.
 */
const DEFAULT_BACKEND_PORT: string =
  typeof __DEFAULT_BACKEND_PORT__ !== "undefined"
    ? __DEFAULT_BACKEND_PORT__
    : (import.meta.env.VITE_BACKEND_PORT ?? "8000")

export const DEFAULT_BACKEND_URL: string =
  PACKAGE_BACKEND_URL ?? `http://localhost:${DEFAULT_BACKEND_PORT}`