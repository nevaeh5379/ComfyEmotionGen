export function useLayoutMutations() {
  return {
    moveNode: () => {
      /* no-op */
    },
    batchMoveNodes: () => {
      /* no-op */
    },
    resizeNode: () => {
      /* no-op */
    },
    setNodeZIndex: () => {
      /* no-op */
    },
    createNode: () => {
      /* no-op */
    },
    deleteNode: () => {
      /* no-op */
    },
    createLink: () => {
      /* no-op */
    },
    deleteLink: () => {
      /* no-op */
    },
    createReroute: () => {
      /* no-op */
    },
    deleteReroute: () => {
      /* no-op */
    },
    moveReroute: () => {
      /* no-op */
    },
    bringNodeToFront: () => {
      /* no-op */
    },
    setSource: () => {
      /* no-op */
    },
    setActor: () => {
      /* no-op */
    },
  }
}

export enum LayoutSource {
  Canvas = "canvas",
  Unknown = "unknown",
}
