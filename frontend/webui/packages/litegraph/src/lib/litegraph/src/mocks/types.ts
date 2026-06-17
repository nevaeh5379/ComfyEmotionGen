export type WidgetId = string;
export type WidgetState = any;
export type SerializedProxyWidgetTuple = any;
export type LinkRenderContext = any;
export type SlotPositionContext = any;
export function widgetId(graphId: any, nodeId: any, name: any): any {
  return `${graphId}:${nodeId}:${name}`;
}
export function parseWidgetId(id: any): any {
  const parts = id.split(":");
  return { graphId: parts[0] || "", nodeId: parts[1] || "", name: parts[2] || "" };
}
export function isWidgetId(value: any): boolean {
  return typeof value === "string" && value.includes(":");
}
