import {z} from "zod"


/**
 * 대기열 얼마나 있는지 확인하는 이벤트 대기열 바뀔 때마다 발생함
 */
export const StatusMessage = z.object({
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


/**
 * 노드별로 진행 상태를 알려주는 이벤트임
 */
export const ProgressStateMessage = z.object({
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

/**
 * 거의 안 쓰는 것 같은데
 */
export const ProgressMessage = z.object({
  type: z.literal("progress"),
  data: z.object({
    value: z.number(),
    max: z.number(),
    node: z.string(),
    prompt_id: z.string(),
  }),
})

export const ExecutedMessage = z.object({
  type: z.literal("executed"),
  data: z.object({
    node: z.string(),
    display_node: z.string().optional(),
    output: z.any(),
  }),
})

export const ExecutingMessage = z.object({
  type: z.literal("executing"),
  data: z.object({
    node: z.string().nullable(),
    display_node: z.string().optional(),
    prompt_id: z.string(),
  }),
})

/**
 * 완료되었을 때 발생하는 이벤트
 */

export const ExecutionSuccessMessage = z.object({
  type: z.literal("execution_success"),
  data: z.object({
    prompt_id: z.string(),
  }),
})

/**
 * /prompt GET 보내고 시작할때 발생하는 이벤트
 */
export const ExecutionStartMessage = z.object({
  type: z.literal("execution_start"),
  data: z.object({
    prompt_id: z.string(),
  }),
})

export const ExecutionInterruptedMessage = z.object({
  type: z.literal("execution_interrupted"),
  data: z.object({
    prompt_id: z.string(),
    node_id: z.string(),
    node_type: z.string(),
    executed: z.array(z.string()),
  }),
})

export const ExecutionCachedMessage = z.object({
  type: z.literal("execution_cached"),
  data: z.object({
    nodes: z.array(z.string()),
    prompt_id: z.string(),
  }),
})

export const RawWebSocketMessageSchema = z.discriminatedUnion("type", [
  StatusMessage,
  ProgressStateMessage,
  ProgressMessage,
  ExecutedMessage,
  ExecutingMessage,
  ExecutionSuccessMessage,
  ExecutionStartMessage,
  ExecutionInterruptedMessage,
  ExecutionCachedMessage,
])

export const WebSocketMessageSchema = RawWebSocketMessageSchema.transform(
  (raw) => {
    switch (raw.type) {
      case "status":
        return {
          type: "status" as const,
          execInfo: {
            queueRemaining: raw.data.status.exec_info.queue_remaining,
          },
          sid: raw.data.sid,
        }
      case "progress_state":
        return {
          type: "progress_state" as const,
          promptId: raw.data.prompt_id,
          nodes: Object.values(raw.data.nodes).map((node) => ({
            displayNodeId: node.display_node_id,
            max: node.max,
            nodeId: node.node_id,
            parentNodeId: node.parent_node_id ?? null,
            promptId: node.prompt_id,
            realNodeId: node.real_node_id,
            value: node.value,
          })),
        }
      case "progress":
        return {
          type: "progress" as const,
          value: raw.data.value,
          max: raw.data.max,
          node: raw.data.node,
          promptId: raw.data.prompt_id,
        }
      case "executed":
        return {
          type: "executed" as const,
          node: raw.data.node,
          displayNode: raw.data.display_node,
          output: raw.data.output,
        }
      case "executing":
        return {
          type: "executing" as const,
          node: raw.data.node,
          displayNode: raw.data.display_node,
          promptId: raw.data.prompt_id,
        }
      case "execution_success":
        return {
          type: "execution_success" as const,
          promptId: raw.data.prompt_id,
        }
      case "execution_start":
        return {
          type: "execution_start" as const,
          promptId: raw.data.prompt_id,
        }
      case "execution_interrupted":
        return {
          type: "execution_interrupted" as const,
          promptId: raw.data.prompt_id,
          nodeId: raw.data.node_id,
          nodeType: raw.data.node_type,
          executed: raw.data.executed,
        }
      case "execution_cached":
        return {
          type: "execution_cached" as const,
          nodes: raw.data.nodes,
          promptId: raw.data.prompt_id,
        }
      default:
        throw new Error(`Unhandled message type: ${(raw as any).type}`)
    }
  }
)