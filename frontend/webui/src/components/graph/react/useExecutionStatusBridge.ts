import { useEffect } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"

type ExecutionEventDetail = Record<string, unknown>

function detailFromEvent(event: Event): ExecutionEventDetail {
  return (event as CustomEvent<ExecutionEventDetail>).detail
}

function promptIdFromDetail(detail: ExecutionEventDetail): string | null {
  return (detail.prompt_id as string | null | undefined) ?? null
}

function resetExecutionState(status: "success" | "interrupted"): void {
  setTimeout(() => {
    const current = useReactGraphStore.getState()
    if (current.executionStatus === status) {
      useReactGraphStore.setState({
        executionStatus: "idle",
        executingPromptId: null,
        executedNodeIds: new Set<number>(),
        overallProgress: null,
      })
    }
  }, 3000)
}

export function useExecutionStatusBridge(): void {
  useEffect(() => {
    const api = window.api

    const handleExecutionStart = (event: Event): void => {
      const detail = detailFromEvent(event)
      console.log("[CEG] execution_start:", detail)
      useReactGraphStore.setState({
        executionStatus: "running",
        executingPromptId: promptIdFromDetail(detail),
        executingNodeId: null,
        executedNodeIds: new Set<number>(),
        overallProgress: null,
      })
    }

    const handleExecuting = (event: Event): void => {
      const detail = detailFromEvent(event)

      let nodeId: unknown = null
      let promptId: string | null = null

      if (typeof detail === "object") {
        nodeId = detail.node
        promptId = promptIdFromDetail(detail)
      } else {
        nodeId = detail
      }

      const nodeIdNum =
        nodeId !== null && nodeId !== undefined && nodeId !== ""
          ? Number(nodeId)
          : null
      console.log("[CEG] executing node:", nodeIdNum, "promptId:", promptId)

      const store = useReactGraphStore.getState()
      const nextExecuted = new Set(store.executedNodeIds)

      if (
        store.executingNodeId !== null &&
        store.executingNodeId !== nodeIdNum
      ) {
        nextExecuted.add(store.executingNodeId)
      }

      const updateObj: Partial<typeof store> = {
        executingNodeId: nodeIdNum,
        executedNodeIds: nextExecuted,
      }

      if (promptId !== null) {
        updateObj.executingPromptId = promptId
      }

      if (nodeIdNum !== null && store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleProgress = (event: Event): void => {
      const detail = detailFromEvent(event)
      const store = useReactGraphStore.getState()
      console.log("[CEG] progress:", detail)

      const updateObj: Partial<typeof store> = {
        overallProgress: {
          value: detail.value as number,
          max: detail.max as number,
        },
      }

      const promptId = promptIdFromDetail(detail)
      if (promptId !== null) {
        updateObj.executingPromptId = promptId
      }
      if (store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleExecuted = (event: Event): void => {
      const detail = detailFromEvent(event)
      const store = useReactGraphStore.getState()
      const nextExecuted = new Set(store.executedNodeIds)
      if (detail.node !== null && detail.node !== undefined) {
        nextExecuted.add(Number(detail.node))
      }
      console.log("[CEG] executed node:", Number(detail.node))

      const updateObj: Partial<typeof store> = {
        executedNodeIds: nextExecuted,
      }
      const promptId = promptIdFromDetail(detail)
      if (promptId !== null) {
        updateObj.executingPromptId = promptId
      }
      if (store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleExecutionCached = (event: Event): void => {
      const detail = detailFromEvent(event)
      const store = useReactGraphStore.getState()
      const nextExecuted = new Set(store.executedNodeIds)
      if (Array.isArray(detail.nodes)) {
        detail.nodes.forEach((node) => {
          nextExecuted.add(Number(node))
        })
      }
      console.log("[CEG] execution_cached nodes:", detail.nodes)

      const updateObj: Partial<typeof store> = {
        executedNodeIds: nextExecuted,
      }
      const promptId = promptIdFromDetail(detail)
      if (promptId !== null) {
        updateObj.executingPromptId = promptId
      }
      if (store.executionStatus === "idle") {
        updateObj.executionStatus = "running"
      }

      useReactGraphStore.setState(updateObj)
    }

    const handleExecutionSuccess = (event: Event): void => {
      const detail = detailFromEvent(event)
      const store = useReactGraphStore.getState()
      console.log("[CEG] execution_success:", detail)

      const promptId = promptIdFromDetail(detail)
      if (
        store.executingPromptId !== null &&
        promptId !== null &&
        store.executingPromptId !== promptId
      ) {
        return
      }

      const nextExecuted = new Set(store.executedNodeIds)
      if (store.executingNodeId !== null) {
        nextExecuted.add(store.executingNodeId)
      }

      useReactGraphStore.setState({
        executionStatus: "success",
        executingNodeId: null,
        executedNodeIds: nextExecuted,
        overallProgress: store.overallProgress
          ? { value: store.overallProgress.max, max: store.overallProgress.max }
          : null,
      })

      resetExecutionState("success")
    }

    const handleExecutionError = (): void => {
      console.log("[CEG] execution_error")
      useReactGraphStore.setState({
        executionStatus: "error",
        executingNodeId: null,
        overallProgress: null,
      })
    }

    const handleExecutionInterrupted = (): void => {
      console.log("[CEG] execution_interrupted")
      useReactGraphStore.setState({
        executionStatus: "interrupted",
        executingNodeId: null,
        overallProgress: null,
      })
      resetExecutionState("interrupted")
    }

    api.addEventListener("execution_start", handleExecutionStart)
    api.addEventListener("executing", handleExecuting)
    api.addEventListener("progress", handleProgress)
    api.addEventListener("executed", handleExecuted)
    api.addEventListener("execution_cached", handleExecutionCached)
    api.addEventListener("execution_success", handleExecutionSuccess)
    api.addEventListener("execution_error", handleExecutionError)
    api.addEventListener("execution_interrupted", handleExecutionInterrupted)

    return (): void => {
      api.removeEventListener("execution_start", handleExecutionStart)
      api.removeEventListener("executing", handleExecuting)
      api.removeEventListener("progress", handleProgress)
      api.removeEventListener("executed", handleExecuted)
      api.removeEventListener("execution_cached", handleExecutionCached)
      api.removeEventListener("execution_success", handleExecutionSuccess)
      api.removeEventListener("execution_error", handleExecutionError)
      api.removeEventListener(
        "execution_interrupted",
        handleExecutionInterrupted
      )
    }
  }, [])
}
