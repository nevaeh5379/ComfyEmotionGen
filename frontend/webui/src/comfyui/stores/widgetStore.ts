const widgetTypes = new Set<string>()

const BASIC_WIDGET_TYPES = ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]
for (const type of BASIC_WIDGET_TYPES) {
  widgetTypes.add(type)
}

export const widgetStore = {
  isWidgetType(type: string | string[]): boolean {
    const normalized = Array.isArray(type) ? "COMBO" : String(type).toUpperCase()
    return widgetTypes.has(normalized)
  },

  register(type: string): void {
    widgetTypes.add(String(type).toUpperCase())
  },

  registerMany(types: string[]): void {
    for (const type of types) {
      widgetTypes.add(String(type).toUpperCase())
    }
  },
}
