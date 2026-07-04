import type {
  ComfyWorkflowGroup,
  ComfyWorkflowJSON,
  ComfyWorkflowLink,
  ComfyWorkflowNode,
  EditorWorkflowNode,
} from "@/comfyui/types/workflow"
import type { SubgraphDefinition, GraphId } from "@/comfyui/types/subgraph"
import type { SubgraphId } from "@/comfyui/constants"
import { SUBGRAPH_INPUT_ID, SUBGRAPH_OUTPUT_ID } from "@/comfyui/constants"
import { createSubgraphModel } from "@/comfyui/subgraph/SubgraphModel"
import type { SubgraphModelRuntime } from "@/comfyui/subgraph/SubgraphModel"
import { findUsedSubgraphIds } from "@/comfyui/subgraph/subgraphUtils"

export interface NormalizedWorkflowGraph {
  nodes: EditorWorkflowNode[]
  links: ComfyWorkflowLink[]
  groups: ComfyWorkflowGroup[]
  subgraphs: Map<SubgraphId, SubgraphModelRuntime>
}

export interface SerializableGraphState {
  nodes: EditorWorkflowNode[]
  links: ComfyWorkflowLink[]
  groups: ComfyWorkflowGroup[]
  subgraphs: Map<SubgraphId, SubgraphModelRuntime>
}

type RawWorkflowLink = ComfyWorkflowLink | number[]

export function isRootGraphId(graphId: GraphId | undefined): boolean {
  return graphId === null || graphId === undefined
}

export function normalizeWorkflowLinks(
  links: readonly RawWorkflowLink[]
): ComfyWorkflowLink[] {
  return links.map((link): ComfyWorkflowLink => {
    if (!Array.isArray(link)) return link
    return {
      id: link[0] ?? 0,
      origin_id: link[1] ?? 0,
      origin_slot: link[2] ?? 0,
      target_id: link[3] ?? 0,
      target_slot: link[4] ?? 0,
      type: typeof link[5] === "string" ? link[5] : "*",
    }
  })
}

export function normalizeWorkflowNodeForEditor(
  node: ComfyWorkflowNode,
  graphId: GraphId = null
): EditorWorkflowNode {
  return {
    ...node,
    inputs: node.inputs ?? [],
    outputs: node.outputs ?? [],
    properties: node.properties ?? {},
    widgets_values: node.widgets_values ?? [],
    graphId: graphId ?? node.graphId ?? null,
  }
}

export function normalizeWorkflowForEditor(
  workflow: ComfyWorkflowJSON
): NormalizedWorkflowGraph {
  const normalizedLinks = normalizeWorkflowLinks(workflow.links)
  const subgraphs = new Map<SubgraphId, SubgraphModelRuntime>()

  const rootNodes = workflow.nodes.map((node) =>
    normalizeWorkflowNodeForEditor(node, node.graphId ?? null)
  )

  let lastGroupId = 0
  const rootGroups: ComfyWorkflowGroup[] = (workflow.groups ?? []).map(
    (group) => {
      const id = group.id
      lastGroupId = Math.max(lastGroupId, id)
      return {
        ...group,
        id,
        graphId: group.graphId ?? null,
      }
    }
  )

  const nodes = [...rootNodes]
  const links = [...normalizedLinks]
  const groups = [...rootGroups]

  for (const definition of workflow.definitions?.subgraphs ?? []) {
    subgraphs.set(definition.id, createSubgraphModel(definition))

    nodes.push(
      ...definition.nodes.map((node) => ({
        ...normalizeWorkflowNodeForEditor(node, definition.id),
      }))
    )

    links.push(...normalizeWorkflowLinks(definition.links))

    const definitionGroups = definition.groups as
      | ComfyWorkflowGroup[]
      | undefined
    for (const group of definitionGroups ?? []) {
      lastGroupId++
      groups.push({
        ...group,
        id: group.id,
        graphId: definition.id,
      })
    }
  }

  return { nodes, links, groups, subgraphs }
}

export function buildWorkflowJSON(
  nodes: ComfyWorkflowNode[],
  links: ComfyWorkflowLink[],
  groups: ComfyWorkflowGroup[] = []
): ComfyWorkflowJSON {
  return serializeGraphState({
    nodes: nodes.map((node) => normalizeWorkflowNodeForEditor(node)),
    links,
    groups,
    subgraphs: new Map<SubgraphId, SubgraphModelRuntime>(),
  })
}

export function serializeGraphState(
  state: SerializableGraphState
): ComfyWorkflowJSON {
  const rootNodes = state.nodes.filter((node) => isRootGraphId(node.graphId))
  const usedIds = findUsedSubgraphIds(
    rootNodes,
    state.subgraphs as unknown as Map<string, SubgraphDefinition>
  )

  const subgraphDefinitions: SubgraphDefinition[] = []
  for (const id of usedIds) {
    const model = state.subgraphs.get(id)
    if (!model) continue
    const innerNodes = state.nodes.filter((node) => node.graphId === id)
    const innerLinks = state.links.filter(
      (link) =>
        link.origin_id === SUBGRAPH_INPUT_ID ||
        link.target_id === SUBGRAPH_OUTPUT_ID ||
        innerNodes.some(
          (node) => node.id === link.origin_id || node.id === link.target_id
        )
    )
    const innerGroups = state.groups.filter((group) => group.graphId === id)
    subgraphDefinitions.push(
      model.asSerialisable(innerNodes, innerLinks, innerGroups)
    )
  }

  const rootGroups = state.groups.filter((group) =>
    isRootGraphId(group.graphId)
  )
  const workflow: ComfyWorkflowJSON = {
    last_node_id: state.nodes.reduce((max, node) => Math.max(max, node.id), 0),
    last_link_id: state.links.reduce((max, link) => Math.max(max, link.id), 0),
    nodes: state.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      pos: node.pos,
      size: node.size,
      inputs: node.inputs,
      outputs: node.outputs,
      widgets_values: node.widgets_values,
      properties: node.properties,
      mode: node.mode,
      flags: node.flags,
      order: node.order,
      color: node.color,
      bgcolor: node.bgcolor,
      ...(node.graphId !== undefined ? { graphId: node.graphId } : {}),
    })),
    links: state.links.map((link) => ({
      id: link.id,
      origin_id: link.origin_id,
      origin_slot: link.origin_slot,
      target_id: link.target_id,
      target_slot: link.target_slot,
      type: link.type,
    })),
    groups: rootGroups.map((group) => ({
      id: group.id,
      title: group.title,
      bounding: group.bounding,
      color: group.color,
      fontSize: group.fontSize,
      locked: group.locked,
    })),
    version: 0.4,
  }

  if (subgraphDefinitions.length > 0) {
    workflow.definitions = { subgraphs: subgraphDefinitions }
  }

  return workflow
}

export function isValidSlotConnection(
  leftType: string | number | undefined,
  rightType: string | number | undefined
): boolean {
  if (
    leftType === undefined ||
    leftType === "" ||
    leftType === "*" ||
    rightType === undefined ||
    rightType === "" ||
    rightType === "*"
  ) {
    return true
  }

  const leftTypes = String(leftType).toLowerCase().split(",")
  const rightTypes = String(rightType).toLowerCase().split(",")
  for (const left of leftTypes) {
    for (const right of rightTypes) {
      const cleanLeft = left.trim()
      const cleanRight = right.trim()
      if (
        cleanLeft === "" ||
        cleanLeft === "*" ||
        cleanRight === "" ||
        cleanRight === "*"
      ) {
        return true
      }
      if (cleanLeft === cleanRight) return true
    }
  }

  return false
}
