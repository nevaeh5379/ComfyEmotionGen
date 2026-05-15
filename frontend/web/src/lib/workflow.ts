import * as z from "zod";

/**
 * 노드 간 연결: [소스 노드 ID, 출력 슬롯 인덱스]
 */
export const NodeLinkSchema = z.tuple([z.string(), z.number()]);
export type NodeLink = z.infer<typeof NodeLinkSchema>;

/**
 * 노드 입력값 (재귀 타입)
 * 다른 노드의 출력 참조 또는 원시값/배열
 */
export type NodeInputValue =
  | string
  | number
  | boolean
  | null
  | NodeLink
  | NodeInputValue[]
  | { [key: string]: NodeInputValue };

export const NodeInputValueSchema: z.ZodType<NodeInputValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    NodeLinkSchema,
    z.array(NodeInputValueSchema),
     z.record(z.string(), NodeInputValueSchema),
  ]),
);

/**
 * 노드 입력 객체 (키는 노드 종류마다 다름)
 */
export const NodeInputsSchema = z.record(z.string(), NodeInputValueSchema);
export type NodeInputs = z.infer<typeof NodeInputsSchema>;

/**
 * 노드 메타데이터 (UI 표시용, 확장 필드 허용)
 */
export const NodeMetaSchema = z
  .object({
    title: z.string(),
  })
  .loose(); // 정의되지 않은 필드도 보존
export type NodeMeta = z.infer<typeof NodeMetaSchema>;

/**
 * 단일 노드
 */
export const ComfyNodeSchema = z.object({
  inputs: NodeInputsSchema,
  class_type: z.string(),
  _meta: NodeMetaSchema.optional(),
});
export type ComfyNode = z.infer<typeof ComfyNodeSchema>;

/**
 * ComfyUI 워크플로우 (API 포맷)
 * 키는 노드 ID(문자열)
 */
export const ComfyWorkflowSchema = z.record(z.string(), ComfyNodeSchema);
export type ComfyWorkflow = z.infer<typeof ComfyWorkflowSchema>;

export type MappingSourceType = "prompt" | "filename" | "seed" | "image" | "fixed";

export interface NodeMapping {
  id: string;
  nodeId: string;
  inputKey: string;
  sourceType: MappingSourceType;
  seedValue?: number;
  seedRandom?: boolean;
  fixedValue?: string;
}