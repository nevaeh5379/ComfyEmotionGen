import { useLocalStorage } from "./useLocalStorage"
import { STORAGE_KEYS } from "@/lib/storageKeys"
import { DEFAULT_BACKEND_URL, IS_PACKAGE_MODE, PACKAGE_BACKEND_URL } from "@/lib/runtime"

export function useBackendUrl(): string {
  const [storedBackendUrl] = useLocalStorage(
    STORAGE_KEYS.backendUrl,
    DEFAULT_BACKEND_URL
  )
  return IS_PACKAGE_MODE
    ? (PACKAGE_BACKEND_URL as string)
    : storedBackendUrl
}
