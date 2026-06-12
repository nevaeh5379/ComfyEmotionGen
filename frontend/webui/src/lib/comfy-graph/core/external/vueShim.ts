// CEG stub - minimal Vue reactivity shim for litegraph core

/** Unwraps a ref to its value. No-op for non-ref values. */
export function toValue<T>(v: T | { value: T }): T {
  if (v && typeof v === 'object' && 'value' in v) {
    return (v as { value: T }).value
  }
  return v
}

/** No-op reactive stub */
export function ref<T>(v: T): { value: T } {
  return { value: v }
}

/** No-op computed stub */
export function computed<T>(getter: () => T): { value: T } {
  return { value: getter() }
}
