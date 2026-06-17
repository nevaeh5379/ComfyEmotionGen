import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function httpToWs(url: string): string {
  try {
    const u = new URL(url)
    if (u.port && (Number(u.port) < 0 || Number(u.port) > 65535)) {
      return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
    }
    return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
  } catch {
    return ""
  }
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}
