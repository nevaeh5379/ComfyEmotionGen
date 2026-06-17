export function useWidgetValueStore() {
  return {
    clearGraph: () => {},
    registerWidget: (id: string, config: any) => ({}),
    deleteWidget: (id: string) => {},
    setValue: (id: string, value: any) => {},
    getWidget: (id: string) => undefined,
  };
}

export function usePreviewExposureStore() {
  return {
    clearGraph: () => {},
    getExposures: () => [],
    addExposure: () => {},
    removeExposure: () => {},
  };
}
