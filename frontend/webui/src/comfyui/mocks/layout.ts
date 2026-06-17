export function useLayoutMutations() {
  return {
    moveNode: () => {},
    batchMoveNodes: () => {},
    resizeNode: () => {},
    setNodeZIndex: () => {},
    createNode: () => {},
    deleteNode: () => {},
    createLink: () => {},
    deleteLink: () => {},
    createReroute: () => {},
    deleteReroute: () => {},
    moveReroute: () => {},
    bringNodeToFront: () => {},
    setSource: () => {},
    setActor: () => {},
  };
}

export enum LayoutSource {
  Canvas = 'canvas',
  Unknown = 'unknown'
}
