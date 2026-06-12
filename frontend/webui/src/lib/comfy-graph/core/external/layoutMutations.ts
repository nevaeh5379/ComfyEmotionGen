import { layoutStore, LayoutSource } from './layoutStore'
export { LayoutSource }

export interface LayoutMutations {
  setSource(source: LayoutSource): void
  moveNode(id: string, pos: { x: number; y: number }): void
  resizeNode(id: string, size: { width: number; height: number }): void
  deleteReroute(id: number): void
  deleteLink(id: number): void
  createReroute(id: number, pos: { x: number; y: number }, parentId?: number, linkIds?: number[]): void
  moveReroute(id: number, pos: [number, number]): void
  createLink(id: number, fromNodeId: number, fromSlot: number, toNodeId: number, toSlot: number): void
  setNodeZIndex(nodeId: string | number, zIndex: number): void
}

export function useLayoutMutations(): LayoutMutations {
  return {
    setSource(source) {
      layoutStore.setSource(source)
    },
    moveNode(id, pos) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'moveNode',
        entity: 'node',
        nodeId: id,
        position: pos,
        previousPosition: pos
      })
    },
    resizeNode(id, size) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'resizeNode',
        entity: 'node',
        nodeId: id,
        size: size,
        previousSize: size
      })
    },
    deleteReroute(id) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'deleteReroute',
        entity: 'reroute',
        rerouteId: id
      })
      layoutStore.deleteRerouteLayout(id)
    },
    deleteLink(id) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'deleteLink',
        entity: 'link',
        linkId: id
      })
      layoutStore.deleteLinkLayout(id)
    },
    createReroute(id, pos, parentId, linkIds) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'createReroute',
        entity: 'reroute',
        rerouteId: id,
        pos: pos,
        parentId: parentId,
        linkIds: linkIds
      })
    },
    moveReroute(id, pos) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'moveReroute',
        entity: 'reroute',
        rerouteId: id,
        pos: pos
      })
    },
    createLink(id, fromNodeId, fromSlot, toNodeId, toSlot) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'createLink',
        entity: 'link',
        linkId: id
      })
    },
    setNodeZIndex(nodeId, zIndex) {
      layoutStore.applyOperation({
        timestamp: Date.now(),
        actor: 'user',
        source: layoutStore.getCurrentSource(),
        type: 'setNodeZIndex',
        entity: 'node',
        nodeId: String(nodeId),
        zIndex: zIndex
      })
    }
  }
}
