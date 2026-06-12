// CEG stub - layoutStore from ComfyUI_frontend renderer
// Vue/Pinia layout store for DOM node rendering - not needed in CEG

const noop = () => null
const emptyRef = { value: [] }
const emptyMap = new Map()

export const layoutStore = {
  querySlotAtPoint: noop,
  queryRerouteAtPoint: noop,
  queryLinkSegmentAtPoint: noop,
  setSource: noop,
  batchUpdateNodeBounds: noop,
  getAllNodes: () => emptyRef,
  isDraggingVueNodes: { value: false },
  pendingSlotSync: false,
  vueNodesMode: false,
}
