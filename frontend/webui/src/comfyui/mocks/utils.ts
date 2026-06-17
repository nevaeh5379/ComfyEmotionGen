export function forEachNode(graph: any, callback: (node: any) => void) {
  if (graph && graph._nodes) {
    graph._nodes.forEach(callback);
  }
}

export const zeroUuid = "00000000-0000-0000-0000-000000000000";

export function createUuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export type ColorAdjustOptions = any;

export function adjustColor(color: string, options: any): string {
  return color;
}
