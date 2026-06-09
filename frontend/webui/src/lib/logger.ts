import { PACKAGE_BACKEND_URL } from "./runtime"

const backendUrl = PACKAGE_BACKEND_URL || ""

export function reportClientError(
  level: "info" | "warning" | "error",
  message: string,
  stack?: string
): void {
  const url = `${backendUrl}/logs/client`
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level,
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
    }),
  }).catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("Failed to report error to backend:", errMsg)
  })
}

// Global unhandled exceptions
window.onerror = (
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean | void => {
  const msg = typeof message === "string" ? message : message.type
  const stack = error ? error.stack : `${source || "unknown"}:${lineno || 0}:${colno || 0}`
  reportClientError("error", `Unhandled error: ${msg}`, stack)
}

// Global unhandled promise rejections
window.onunhandledrejection = (event: PromiseRejectionEvent): void => {
  const reason: unknown = event.reason
  const msg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  reportClientError("error", `Unhandled Promise Rejection: ${msg}`, stack)
}
