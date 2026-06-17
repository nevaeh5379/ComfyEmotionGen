import type { WidgetState, PreviewExposureEntry } from '../types/widgets'

const widgetValues = new Map<string, WidgetState>()

export function useWidgetValueStore() {
  return {
    registerWidget: (graphId: string | number, options: Partial<WidgetState>): WidgetState => {
      const nodeId = options.nodeId
      const name = options.name
      const key = (nodeId !== undefined && name !== undefined)
        ? `${graphId}-${nodeId}-${name}`
        : String(graphId)

      let state = widgetValues.get(key)
      if (!state) {
        state = {
          value: options.value ?? null,
          nodeId,
          name,
          label: options.label,
          disabled: options.disabled,
          type: options.type,
          options: options.options,
          serialize: options.serialize
        }
        widgetValues.set(key, state)
      }
      return state
    },
    getWidget: (graphId: string | number, nodeId: string | number, name: string): WidgetState | null => {
      const key = `${graphId}-${nodeId}-${name}`
      return widgetValues.get(key) || null
    },
    clearGraph: (graphId?: string | number) => {
      if (graphId === undefined) {
        widgetValues.clear()
      } else {
        const prefix = `${graphId}-`
        for (const key of widgetValues.keys()) {
          if (key.startsWith(prefix) || key === String(graphId)) {
            widgetValues.delete(key)
          }
        }
      }
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
