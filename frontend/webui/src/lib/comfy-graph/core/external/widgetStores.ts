import type { WidgetState, PreviewExposureEntry } from '../types/widgets'

const widgetValues = new Map<string, WidgetState>()

export function getWidgetValueStore() {
  return {
    registerWidget: (graphId: string | number, options: Partial<WidgetState>): WidgetState => {
      const nodeId = options.nodeId
      const name = options.name
      const key = (nodeId !== undefined && name !== undefined)
        ? `${graphId}-${nodeId}-${name}`
        : String(graphId)

      let state = widgetValues.get(key)
      if (!state) {
        const newState: Omit<WidgetState, 'nodeId'> & Partial<Pick<WidgetState, 'nodeId'>> = {
          value: options.value ?? null,
        }
        if (options.options !== undefined) newState.options = options.options
        if (options.type !== undefined) newState.type = options.type
        if (name !== undefined) newState.name = name
        if (nodeId !== undefined) newState.nodeId = nodeId
        if (options.label !== undefined) newState.label = options.label
        if (options.disabled !== undefined) newState.disabled = options.disabled
        if (options.serialize !== undefined) newState.serialize = options.serialize
        widgetValues.set(key, newState)
        state = newState
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
        state.value = value ?? null
      } else {
        widgetValues.set(graphId, { value: value ?? null })
      }
    },
    getWidgetValueState: (graphId: string): WidgetState | null => {
      return widgetValues.get(graphId) || null
    }
  }
}

const exposedWidgets = new Set<string>()
const exposedExposures = new Map<string, PreviewExposureEntry[]>()

export function getPreviewExposureStore() {
  return {
    clearGraph: (_graphId?: string | number) => {
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

export function getDomWidgetStore() {
  return {
    clearGraph: (_graphId?: string | number) => {
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
