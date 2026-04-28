import {z} from "zod"


/** 대기열 얼마나 있는지 확인하는 이벤트, 대기열 바뀔 때마다 발생 */
const RawStatusMessageSchema = z.object({
  type: z.literal("status"),
  data: z.object({
    status: z.object({
      exec_info: z.object({
        queue_remaining: z.number(),
      }),
    }),
    sid: z.string().optional(),
  }),
})

/** 노드별로 진행 상태를 알려주는 이벤트 */
const RawProgressStateMessageSchema = z.object({
  type: z.literal("progress_state"),
  data: z.object({
    prompt_id: z.string(),
    nodes: z.record(
      z.string(),
      z.object({
        display_node_id: z.string(),
        max: z.number(),
        node_id: z.string(),
        parent_node_id: z.string().nullable().optional(),
        prompt_id: z.string(),
        real_node_id: z.string(),
        value: z.number().optional(),
      })
    ),
  }),
})

/** 거의 안 쓰이는 듯 */
const RawProgressMessageSchema = z.object({
  type: z.literal("progress"),
  data: z.object({
    value: z.number(),
    max: z.number(),
    node: z.string(),
    prompt_id: z.string(),
  }),
})

const ComfyImageSchema = z.object({
  filename: z.string(),
  subfolder: z.string(),
  type: z.string(),
})

const ComfyOutputSchema = z.object({
  images: z.array(ComfyImageSchema).optional(),
}).catchall(z.array(z.unknown()));

const RawExecutedMessageSchema = z.object({
  type: z.literal("executed"),
  data: z.object({
    node: z.string(),
    display_node: z.string().optional(),
    // output: z.unknown(),
    output: ComfyOutputSchema.optional().nullable(),
    prompt_id: z.string(),
  }),
})

const RawExecutingMessageSchema = z.object({
  type: z.literal("executing"),
  data: z.object({
    node: z.string().nullable(),
    display_node: z.string().optional(),
    prompt_id: z.string(),
  }),
})

/** 완료되었을 때 발생하는 이벤트 */
const RawExecutionSuccessMessageSchema = z.object({
  type: z.literal("execution_success"),
  data: z.object({
    prompt_id: z.string(),
  }),
})

/** /prompt 보내고 시작할 때 발생하는 이벤트 */
const RawExecutionStartMessageSchema = z.object({
  type: z.literal("execution_start"),
  data: z.object({
    prompt_id: z.string(),
  }),
})

const RawExecutionInterruptedMessageSchema = z.object({
  type: z.literal("execution_interrupted"),
  data: z.object({
    prompt_id: z.string(),
    node_id: z.string(),
    node_type: z.string(),
    executed: z.array(z.string()),
  }),
})

const RawExecutionCachedMessageSchema = z.object({
  type: z.literal("execution_cached"),
  data: z.object({
    nodes: z.array(z.string()),
    prompt_id: z.string(),
  }),
})

export const RawWebSocketMessageSchema = z.discriminatedUnion("type", [
  RawStatusMessageSchema,
  RawProgressStateMessageSchema,
  RawProgressMessageSchema,
  RawExecutedMessageSchema,
  RawExecutingMessageSchema,
  RawExecutionSuccessMessageSchema,
  RawExecutionStartMessageSchema,
  RawExecutionInterruptedMessageSchema,
  RawExecutionCachedMessageSchema,
])

export type RawWebSocketMessage = z.infer<typeof RawWebSocketMessageSchema>

export type StatusMessage = {
  type: "status"
  execInfo: {queueRemaining: number}
  sid?: string
}

export type ProgressNode = {
  displayNodeId: string
  max: number
  nodeId: string
  parentNodeId: string | null
  promptId: string
  realNodeId: string
  value?: number
}

export type ProgressStateMessage = {
  type: "progress_state"
  promptId: string
  nodes: ProgressNode[]
}

export type ProgressMessage = {
  type: "progress"
  value: number
  max: number
  node: string
  promptId: string
}

export type ComfyOutput = z.infer<typeof ComfyOutputSchema>

export type ExecutedMessage = {
  type: "executed"
  node: string
  displayNode?: string
  output: ComfyOutput | null
  promptId: string
}

export type ExecutingMessage = {
  type: "executing"
  node: string | null
  displayNode?: string
  promptId: string
}

export type ExecutionSuccessMessage = {
  type: "execution_success"
  promptId: string
}

export type ExecutionStartMessage = {
  type: "execution_start"
  promptId: string
}

export type ExecutionInterruptedMessage = {
  type: "execution_interrupted"
  promptId: string
  nodeId: string
  nodeType: string
  executed: string[]
}

export type ExecutionCachedMessage = {
  type: "execution_cached"
  nodes: string[]
  promptId: string
}

export type WebSocketMessage =
  | StatusMessage
  | ProgressStateMessage
  | ProgressMessage
  | ExecutedMessage
  | ExecutingMessage
  | ExecutionSuccessMessage
  | ExecutionStartMessage
  | ExecutionInterruptedMessage
  | ExecutionCachedMessage

// 특정 타입만 좁혀서 받고 싶을 때 사용
export type WebSocketMessageOf<T extends WebSocketMessage["type"]> = Extract<
  WebSocketMessage,
  {type: T}
>


export const WebSocketMessageSchema = RawWebSocketMessageSchema.transform(
  (raw): WebSocketMessage => {
    switch (raw.type) {
      case "status":
        return {
          type: "status",
          execInfo: {
            queueRemaining: raw.data.status.exec_info.queue_remaining,
          },
          ...(raw.data.sid !== undefined ? {sid: raw.data.sid} : {}),
        }
      case "progress_state":
        return {
          type: "progress_state",
          promptId: raw.data.prompt_id,
          nodes: Object.values(raw.data.nodes).map((node) => ({
            displayNodeId: node.display_node_id,
            max: node.max,
            nodeId: node.node_id,
            parentNodeId: node.parent_node_id ?? null,
            promptId: node.prompt_id,
            realNodeId: node.real_node_id,
            ...(node.value !== undefined ? {value: node.value} : {}),
          })),
        }
      case "progress":
        return {
          type: "progress",
          value: raw.data.value,
          max: raw.data.max,
          node: raw.data.node,
          promptId: raw.data.prompt_id,
        }
      case "executed":
        return {
          type: "executed",
          node: raw.data.node,
          output: raw.data.output ?? null,
          promptId: raw.data.prompt_id,
          ...(raw.data.display_node !== undefined
            ? {displayNode: raw.data.display_node}
            : {}),
        }
      case "executing":
        return {
          type: "executing",
          node: raw.data.node,
          promptId: raw.data.prompt_id,
          ...(raw.data.display_node !== undefined
            ? {displayNode: raw.data.display_node}
            : {}),
        }
      case "execution_success":
        return {
          type: "execution_success",
          promptId: raw.data.prompt_id,
        }
      case "execution_start":
        return {
          type: "execution_start",
          promptId: raw.data.prompt_id,
        }
      case "execution_interrupted":
        return {
          type: "execution_interrupted",
          promptId: raw.data.prompt_id,
          nodeId: raw.data.node_id,
          nodeType: raw.data.node_type,
          executed: raw.data.executed,
        }
      case "execution_cached":
        return {
          type: "execution_cached",
          nodes: raw.data.nodes,
          promptId: raw.data.prompt_id,
        }
    }
  }
)