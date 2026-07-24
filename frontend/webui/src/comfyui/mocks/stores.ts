export function useWidgetValueStore() {
  return {
    clearGraph: () => {
      /* no-op */
    },
    registerWidget: (_id: string, _config: unknown) => ({
      /* no-op */
    }),
    deleteWidget: (_id: string) => {
      /* no-op */
    },
    setValue: (_id: string, _value: unknown) => {
      /* no-op */
    },
    getWidget: (_id: string) => undefined,
  }
}

export function usePreviewExposureStore() {
  return {
    clearGraph: () => {
      /* no-op */
    },
    getExposures: () => [],
    addExposure: () => {
      /* no-op */
    },
    removeExposure: () => {
      /* no-op */
    },
  }
}
