declare const __FRONTEND_VERSION__: string
declare const __BUNDLE_VERSION__: string
declare const __COMMIT__: string
declare const __GITHUB_REPO__: string

export const FRONTEND_VERSION = __FRONTEND_VERSION__
export const BUNDLE_VERSION = __BUNDLE_VERSION__
export const COMMIT = __COMMIT__ || null
export const GITHUB_REPO = __GITHUB_REPO__

export const IS_LOCAL_DEV = BUNDLE_VERSION === "dev"

function detectChannel(v: string): "dev" | "beta" | "stable" {
  if (v === "dev" || v.includes("-dev")) return "dev"
  if (/-beta|-rc|-alpha/.test(v)) return "beta"
  return "stable"
}

export const UPDATE_CHANNEL = detectChannel(BUNDLE_VERSION)
