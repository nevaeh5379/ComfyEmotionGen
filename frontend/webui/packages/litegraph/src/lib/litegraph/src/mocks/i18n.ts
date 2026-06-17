export function resolveSupportedLocale(input: any) {
  return "en"
}

export async function loadLocale(locale: any) {
  return
}

export async function setActiveLocale(input: any) {
  return "en"
}

export function mergeCustomNodesI18n(i18nData: any) {
  return
}

export const i18n = {
  global: {
    locale: { value: "en" },
    setLocaleMessage() {},
    mergeLocaleMessage() {},
  }
}

export function t(key: string) {
  return key
}

export function te(key: string) {
  return false
}

export function d(key: any) {
  return String(key)
}

export function st(key: string, fallbackMessage: string) {
  return fallbackMessage
}

export function stRaw(key: string, fallbackMessage: string) {
  return fallbackMessage
}
