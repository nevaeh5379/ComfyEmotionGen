// CEG stub - layoutMutations from ComfyUI_frontend renderer
// These mutations are Vue/Pinia store operations that we don't need in CEG

export enum LayoutSource {
  Canvas = 'canvas',
  DOM = 'dom',
  Tree = 'tree',
}

export interface LayoutMutations {
  setSource(source: LayoutSource): void
  moveNode(id: string, pos: { x: number; y: number }): void
  resizeNode(id: string, size: { width: number; height: number }): void
  deleteReroute(id: number): void
  deleteLink(id: number): void
  createReroute(id: number, pos: [number, number]): void
  moveReroute(id: number, pos: [number, number]): void
  createLink(id: number, fromNodeId: number, fromSlot: number, toNodeId: number, toSlot: number): void
}

const noop = () => {}

export function useLayoutMutations(): LayoutMutations {
  return {
    setSource: noop,
    moveNode: noop,
    resizeNode: noop,
    deleteReroute: noop,
    deleteLink: noop,
    createReroute: noop,
    moveReroute: noop,
    createLink: noop,
  }
}
