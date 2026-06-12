import type { WidgetState, PreviewExposureEntry } from '../types/widgets'

const widgetValues = new Map<string, WidgetState>()

export function useWidgetValueStore() {
  return {
    registerWidget: (graphId: string, options: Partial<WidgetState>): WidgetState => {
      let state = widgetValues.get(graphId)
      if (!state) {
        state = { value: options.value ?? null }
        widgetValues.set(graphId, state)
      }
      return state
    },
    clearGraph: (graphId?: string | number) => {
      widgetValues.clear()
    },
    setWidgetValue: (graphId: string, value: string | number | boolean | null) => {
      const state = widgetValues.get(graphId)
      if (state) {
        state.value = value ?? undefined
      } else {
        widgetValues.set(graphId, { value: value ?? undefined })
      }
    },
    getWidgetValueState: (graphId: string): WidgetState | null => {
      return widgetValues.get(graphId) || null
    }
  }
}

const exposedWidgets = new Set<string>()
const exposedExposures = new Map<string, PreviewExposureEntry[]>()

export function usePreviewExposureStore() {
  return {
    clearGraph: (graphId?: string | number) => {
      exposedWidgets.clear()
      exposedExposures.clear()
    },
    expose: (widgetId: string) => {
      exposedWidgets.add(widgetId)
    },
    unexpose: (widgetId: string) => {
      exposedWidgets.delete(widgetId)
    },
    isExposed: (widgetId: string) => {
      return exposedWidgets.has(widgetId)
    },
    getExposures: (rootGraphId: string | number, hostLocator: string): PreviewExposureEntry[] => {
      const key = `${rootGraphId}-${hostLocator}`
      return exposedExposures.get(key) || []
    },
    setExposures: (rootGraphId: string | number, hostLocator: string, exposures: PreviewExposureEntry[]): void => {
      const key = `${rootGraphId}-${hostLocator}`
      exposedExposures.set(key, exposures)
      for (const entry of exposures) {
        exposedWidgets.add(`${entry.sourceNodeId}-${entry.name}`)
      }
    }
  }
}

const domWidgets = new Map<string, unknown>()

export function useDomWidgetStore() {
  return {
    clearGraph: (graphId?: string | number) => {
      domWidgets.clear()
    },
    registerWidget: (id: string, widget: unknown) => {
      domWidgets.set(id, widget)
    },
    unregisterWidget: (id: string) => {
      domWidgets.delete(id)
    },
    clearPositionOverride: (id: string): void => {
      domWidgets.delete(id)
    }
  }
}
