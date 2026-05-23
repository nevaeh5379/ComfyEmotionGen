import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function httpToWs(url: string): string {
  return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
}
