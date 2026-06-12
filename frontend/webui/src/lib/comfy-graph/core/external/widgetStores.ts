// CEG stub - widgetValueStore from ComfyUI_frontend stores
// Vue/Pinia store for widget values - not needed in CEG

const noop = () => null
const emptyState = { value: null }

export function useWidgetValueStore() {
  return {
    registerWidget: (_graphId: string, _options: Record<string, unknown>) => emptyState,
    clearGraph: noop,
    setWidgetValue: noop,
  }
}

export function usePreviewExposureStore() {
  return {
    clearGraph: noop,
    expose: noop,
    unexpose: noop,
  }
}

export function useDomWidgetStore() {
  return {
    clearGraph: noop,
    registerWidget: noop,
    unregisterWidget: noop,
  }
}
