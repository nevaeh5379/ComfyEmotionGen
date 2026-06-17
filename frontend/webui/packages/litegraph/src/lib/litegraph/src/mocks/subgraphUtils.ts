import { isEqual } from 'es-toolkit'
import type { LGraph, SubgraphId } from '@/lib/litegraph/src/LGraph'
import { LGraphGroup } from '@/lib/litegraph/src/LGraphGroup'
import { LGraphNode } from '@/lib/litegraph/src/LGraphNode'
import { LLink } from '@/lib/litegraph/src/LLink'
import type { ResolvedConnection } from '@/lib/litegraph/src/LLink'
import { Reroute } from '@/lib/litegraph/src/Reroute'
import type { RerouteId } from '@/lib/litegraph/src/Reroute'
import {
  SUBGRAPH_INPUT_ID,
  SUBGRAPH_OUTPUT_ID
} from '@/lib/litegraph/src/constants'
import type {
  INodeInputSlot,
  INodeOutputSlot,
  Positionable
} from '@/lib/litegraph/src/interfaces'
import { LiteGraph, createUuidv4 } from '@/lib/litegraph/src/litegraph'
import { nextUniqueName } from '@/lib/litegraph/src/strings'
import type {
  ISerialisedNode,
  SerialisableLLink,
  SubgraphIO
} from '@/lib/litegraph/src/types/serialisation'

import type { GraphOrSubgraph } from '../subgraph/Subgraph'
import type { SubgraphInput } from '../subgraph/SubgraphInput'
import type { SubgraphInputNode } from '../subgraph/SubgraphInputNode'
import type { SubgraphNode } from '../subgraph/SubgraphNode'
import type { SubgraphOutput } from '../subgraph/SubgraphOutput'
import type { SubgraphOutputNode } from '../subgraph/SubgraphOutputNode'

interface FilteredItems {
  nodes: Set<LGraphNode>
  reroutes: Set<Reroute>
  groups: Set<LGraphGroup>
  subgraphInputNodes: Set<SubgraphInputNode>
  subgraphOutputNodes: Set<SubgraphOutputNode>
  unknown: Set<Positionable>
}

export function splitPositionables(
  items: Iterable<Positionable>
): FilteredItems {
  const nodes = new Set<LGraphNode>()
  const reroutes = new Set<Reroute>()
  const groups = new Set<LGraphGroup>()
  const subgraphInputNodes = new Set<SubgraphInputNode>()
  const subgraphOutputNodes = new Set<SubgraphOutputNode>()

  const unknown = new Set<Positionable>()

  for (const item of items) {
    switch (true) {
      case item instanceof LGraphNode:
        nodes.add(item)
        break
      case item instanceof LGraphGroup:
        groups.add(item)
        break
      case item instanceof Reroute:
        reroutes.add(item)
        break
      case 'id' in item && item.id === SUBGRAPH_INPUT_ID:
        subgraphInputNodes.add(item as SubgraphInputNode)
        break
      case 'id' in item && item.id === SUBGRAPH_OUTPUT_ID:
        subgraphOutputNodes.add(item as SubgraphOutputNode)
        break
      default:
        unknown.add(item)
        break
    }
  }

  return {
    nodes,
    reroutes,
    groups,
    subgraphInputNodes,
    subgraphOutputNodes,
    unknown
  }
}

interface BoundaryLinks {
  boundaryLinks: LLink[]
  boundaryFloatingLinks: LLink[]
  internalLinks: LLink[]
  boundaryInputLinks: LLink[]
  boundaryOutputLinks: LLink[]
}

export function getBoundaryLinks(
  graph: LGraph,
  items: Set<Positionable>
): BoundaryLinks {
  const internalLinks: LLink[] = []
  const boundaryLinks: LLink[] = []
  const boundaryInputLinks: LLink[] = []
  const boundaryOutputLinks: LLink[] = []
  const boundaryFloatingLinks: LLink[] = []
  const visited = new WeakSet<Positionable>()

  for (const item of items) {
    if (visited.has(item)) continue
    visited.add(item)

    // Nodes
    if (item instanceof LGraphNode) {
      const node = item

      // Inputs
      if (node.inputs) {
        for (const input of node.inputs) {
          addFloatingLinks(input._floatingLinks)

          if (input.link == null) continue

          const resolved = LLink.resolve(input.link, graph)
          if (!resolved) {
            console.warn(`Failed to resolve link ID [${input.link}]`)
            continue
          }

          // Output end of this link is outside the items set
          const { link, outputNode } = resolved
          if (outputNode) {
            if (!items.has(outputNode)) {
              boundaryInputLinks.push(link)
            } else {
              internalLinks.push(link)
            }
          } else if (link.origin_id === SUBGRAPH_INPUT_ID) {
            // Subgraph input node - always boundary
            boundaryInputLinks.push(link)
          }
        }
      }

      // Outputs
      if (node.outputs) {
        for (const output of node.outputs) {
          addFloatingLinks(output._floatingLinks)

          if (!output.links) continue

          const many = LLink.resolveMany(output.links, graph)
          for (const { link, inputNode } of many) {
            if (
              // Subgraph output node
              link.target_id === SUBGRAPH_OUTPUT_ID ||
              // Input end of this link is outside the items set
              (inputNode && !items.has(inputNode))
            ) {
              boundaryOutputLinks.push(link)
            }
            // Internal links are discovered on input side.
          }
        }
      }
    } else if (item instanceof Reroute) {
      // Reroutes
      const reroute = item

      const results = LLink.resolveMany(reroute.linkIds, graph)
      for (const { link } of results) {
        const reroutes = LLink.getReroutes(graph, link)
        const reroutesOutside = reroutes.filter(
          (reroute) => !items.has(reroute)
        )

        const { inputNode, outputNode } = link.resolve(graph)

        if (
          reroutesOutside.length ||
          (inputNode && !items.has(inputNode)) ||
          (outputNode && !items.has(outputNode))
        ) {
          boundaryLinks.push(link)
        }
      }
    }
  }

  return {
    boundaryLinks,
    boundaryFloatingLinks,
    internalLinks,
    boundaryInputLinks,
    boundaryOutputLinks
  }

  function addFloatingLinks(floatingLinks: Set<LLink> | undefined): void {
    if (!floatingLinks) return

    for (const link of floatingLinks) {
      const crossesBoundary = LLink.getReroutes(graph, link).some(
        (reroute) => !items.has(reroute)
      )

      if (crossesBoundary) boundaryFloatingLinks.push(link)
    }
  }
}

export function multiClone(nodes: Iterable<LGraphNode>): ISerialisedNode[] {
  const clonedNodes: ISerialisedNode[] = []

  for (const node of nodes) {
    const newNode = LiteGraph.createNode(node.type)
    if (!newNode) {
      console.warn('Failed to create node', node.type)
      const serializedData = structuredClone(node.serialize())
      clonedNodes.push(serializedData)
      continue
    }

    const data = structuredClone(node.serialize())
    newNode.configure(data)

    clonedNodes.push(newNode.serialize())
  }

  return clonedNodes
}

export function groupResolvedByOutput(
  resolvedConnections: ResolvedConnection[]
): Map<SubgraphIO | INodeOutputSlot | object, ResolvedConnection[]> {
  const groupedByOutput: ReturnType<typeof groupResolvedByOutput> = new Map()

  for (const resolved of resolvedConnections) {
    const groupBy = resolved.subgraphInput ?? resolved.output ?? {}
    const group = groupedByOutput.get(groupBy)
    if (group) {
      group.push(resolved)
    } else {
      groupedByOutput.set(groupBy, [resolved])
    }
  }

  return groupedByOutput
}

function mapReroutes(
  link: SerialisableLLink,
  reroutes: Map<RerouteId, Reroute>
) {
  let child: SerialisableLLink | Reroute = link
  let nextReroute =
    child.parentId === undefined ? undefined : reroutes.get(child.parentId)

  while (child.parentId !== undefined && nextReroute) {
    child = nextReroute
    nextReroute =
      child.parentId === undefined ? undefined : reroutes.get(child.parentId)
  }

  const lastId = child.parentId
  child.parentId = undefined
  return lastId
}

export function mapSubgraphInputsAndLinks(
  resolvedInputLinks: ResolvedConnection[],
  links: SerialisableLLink[],
  reroutes: Map<RerouteId, Reroute>
): SubgraphIO[] {
  const groupedByOutput = groupResolvedByOutput(resolvedInputLinks)

  const inputs: SubgraphIO[] = []

  for (const [, connections] of groupedByOutput) {
    const inputLinks: SerialisableLLink[] = []

    for (const resolved of connections) {
      const { link, input } = resolved
      if (!input) continue

      const linkData = link.asSerialisable()
      link.parentId = mapReroutes(link, reroutes)
      linkData.origin_id = SUBGRAPH_INPUT_ID
      linkData.origin_slot = inputs.length

      links.push(linkData)
      inputLinks.push(linkData)
    }

    const { input } = connections[0]
    if (!input) continue

    const {
      color_off,
      color_on,
      dir,
      hasErrors,
      label,
      localized_name,
      name,
      shape,
      type
    } = input
    const uniqueName = nextUniqueName(
      name,
      inputs.map((input) => input.name)
    )
    const uniqueLocalizedName = localized_name
      ? nextUniqueName(
          localized_name,
          inputs.map((input) => input.localized_name ?? '')
        )
      : undefined

    const inputData: SubgraphIO = {
      id: createUuidv4(),
      type: String(type),
      linkIds: inputLinks.map((link) => link.id),
      name: uniqueName,
      color_off,
      color_on,
      dir,
      label,
      localized_name: uniqueLocalizedName,
      hasErrors,
      shape
    }

    inputs.push(inputData)
  }

  return inputs
}

export function mapSubgraphOutputsAndLinks(
  resolvedOutputLinks: ResolvedConnection[],
  links: SerialisableLLink[],
  reroutes: Map<RerouteId, Reroute>
): SubgraphIO[] {
  const groupedByOutput = groupResolvedByOutput(resolvedOutputLinks)

  const outputs: SubgraphIO[] = []

  for (const [, connections] of groupedByOutput) {
    const outputLinks: SerialisableLLink[] = []

    for (const resolved of connections) {
      const { link, output } = resolved
      if (!output) continue

      const linkData = link.asSerialisable()
      linkData.parentId = mapReroutes(link, reroutes)
      linkData.target_id = SUBGRAPH_OUTPUT_ID
      linkData.target_slot = outputs.length

      links.push(linkData)
      outputLinks.push(linkData)
    }

    const { output } = connections[0]
    if (!output) continue

    const {
      color_off,
      color_on,
      dir,
      hasErrors,
      label,
      localized_name,
      name,
      shape,
      type
    } = output
    const uniqueName = nextUniqueName(
      name,
      outputs.map((output) => output.name)
    )
    const uniqueLocalizedName = localized_name
      ? nextUniqueName(
          localized_name,
          outputs.map((output) => output.localized_name ?? '')
        )
      : undefined

    const outputData = {
      id: createUuidv4(),
      type: String(type),
      linkIds: outputLinks.map((link) => link.id),
      name: uniqueName,
      color_off,
      color_on,
      dir,
      label,
      localized_name: uniqueLocalizedName,
      hasErrors,
      shape
    } satisfies SubgraphIO

    outputs.push(structuredClone(outputData))
  }
  return outputs
}

export function getDirectSubgraphIds(graph: GraphOrSubgraph): Set<SubgraphId> {
  const subgraphIds = new Set<SubgraphId>()

  for (const node of graph._nodes) {
    if (node.isSubgraphNode()) {
      subgraphIds.add(node.type)
    }
  }

  return subgraphIds
}

export function findUsedSubgraphIds(
  rootGraph: GraphOrSubgraph,
  subgraphRegistry: Map<SubgraphId, GraphOrSubgraph>
): Set<SubgraphId> {
  const usedSubgraphIds = new Set<SubgraphId>()
  const toVisit: GraphOrSubgraph[] = [rootGraph]

  while (toVisit.length > 0) {
    const graph = toVisit.shift()!
    const directIds = getDirectSubgraphIds(graph)

    for (const id of directIds) {
      if (!usedSubgraphIds.has(id)) {
        usedSubgraphIds.add(id)
        const subgraph = subgraphRegistry.get(id)
        if (subgraph) {
          toVisit.push(subgraph)
        }
      }
    }
  }

  return usedSubgraphIds
}

function reorderInPlace<T>(arr: T[], indices: readonly number[]): void {
  arr.splice(0, arr.length, ...indices.flatMap((i) => arr[i] ?? []))
}

function* indexedLinks<S>(
  slots: readonly S[],
  resolve: (slot: S) => Iterable<LLink | undefined>
): Generator<readonly [number, LLink]> {
  for (const [index, slot] of slots.entries()) {
    for (const link of resolve(slot)) {
      if (link) yield [index, link] as const
    }
  }
}

export function reorderSubgraphInputs(
  subgraphNode: SubgraphNode,
  orderedIndices: readonly number[]
): void {
  const subgraph = subgraphNode.subgraph
  if (!subgraph) return

  const n = subgraph.inputs.length
  if (
    orderedIndices.length !== n ||
    new Set(orderedIndices).size !== orderedIndices.length ||
    orderedIndices.some((i) => i < 0 || i >= n)
  ) {
    console.error(
      `reorderSubgraphInputs: orderedIndices must be a permutation of 0..${n - 1}`,
      orderedIndices
    )
    return
  }

  const oldOrder = subgraph.inputs.map((i) => i.id)

  reorderInPlace(subgraph.inputs, orderedIndices)
  reorderInPlace(subgraphNode.inputs, orderedIndices)
  subgraphNode.invalidatePromotedViews()

  function* innerLinks(input: SubgraphInput): Generator<LLink | undefined> {
    for (const id of input.linkIds) yield subgraph.getLink(id)
  }
  for (const [slot, link] of indexedLinks(subgraph.inputs, innerLinks)) {
    link.origin_slot = slot
  }

  function* outerLink(input: INodeInputSlot): Generator<LLink | undefined> {
    if (input.link != null) yield subgraphNode.graph?.getLink(input.link)
  }
  for (const [slot, link] of indexedLinks(subgraphNode.inputs, outerLink)) {
    link.target_slot = slot
  }

  const newOrder = subgraph.inputs.map((i) => i.id)
  if (!isEqual(oldOrder, newOrder)) {
    subgraph.events.dispatch('inputs-reordered', {
      subgraph,
      oldOrder,
      newOrder
    })
  }
}

export function isSubgraphInput(slot: unknown): slot is SubgraphInput {
  return (
    slot != null &&
    typeof slot === 'object' &&
    'parent' in slot &&
    slot.parent != null &&
    typeof slot.parent === 'object' &&
    'id' in slot.parent &&
    slot.parent.id === SUBGRAPH_INPUT_ID
  )
}

export function isSubgraphOutput(slot: unknown): slot is SubgraphOutput {
  return (
    slot != null &&
    typeof slot === 'object' &&
    'parent' in slot &&
    slot.parent != null &&
    typeof slot.parent === 'object' &&
    'id' in slot.parent &&
    slot.parent.id === SUBGRAPH_OUTPUT_ID
  )
}

export function isNodeSlot(
  slot: unknown
): slot is INodeInputSlot | INodeOutputSlot {
  return (
    slot != null &&
    typeof slot === 'object' &&
    ('link' in slot || 'links' in slot)
  )
}
