export function useLayoutMutations() {
  return {
    setNodeZIndex: (id: any, zIndex: any) => {},
  };
}

export enum LayoutSource {
  USER = "USER",
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const layoutStore = {
  querySlotAtPoint: () => null,
  queryRerouteAtPoint: () => null,
  queryLinkSegmentAtPoint: () => null,
  setSource: () => {},
  batchUpdateNodeBounds: () => {},
  getAllNodes: () => ({ value: [] }),
  isDraggingVueNodes: { value: false },
  pendingSlotSync: false,
  deleteLinkLayout: () => {},
};
