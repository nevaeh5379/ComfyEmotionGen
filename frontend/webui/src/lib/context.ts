import { useContext } from "react"

export function useContextRequired<T>(
  context: React.Context<T | null>,
  hookName: string
): T {
  const ctx = useContext(context)
  if (!ctx)
    throw new Error(`${hookName} must be used within its Provider`)
  return ctx
}
