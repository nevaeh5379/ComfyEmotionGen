/**
 * SvgConnections - 노드 연결선을 SVG Bezier 곡선으로 그리는 컴포넌트
 *
 * DOM 레이아웃 이후 핀 요소를 직접 측정하여 정확한 연결선을 그립니다.
 * SVG는 CSS transform(translate/scale) 내부에 있으므로,
 * getBoundingClientRect로 얻은 화면 좌표를 zoom으로 나눠 SVG 좌표계로 변환합니다.
 */

import { useLayoutEffect, useRef, useState, useMemo } from "react"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import type { ComfyWorkflowNode } from "@/comfyui/types/workflow"

function formatSvgNumber(n: number): string {
  return n.toFixed(2)
}

function linkColor(type: string): string {
  const t = type.toUpperCase()
  if (t === "MODEL")       return "#a78bfa"
  if (t === "LATENT")      return "#f472b6"
  if (t === "CONDITIONING") return "#fb923c"
  if (t === "IMAGE")       return "#34d399"
  if (t === "CLIP")        return "#facc15"
  if (t === "VAE")         return "#60a5fa"
  return "#6ee7b7"
}

function queryPin(
  container: HTMLElement,
  nodeId: number,
  slotType: "input" | "output",
  slotIdx: number,
  slotName?: string
): HTMLElement | null {
  // 1. Exact match by nodeId + type + index
  const exact = container.querySelector(
    `[data-slot-node-id="${String(nodeId)}"][data-slot-type="${slotType}"][data-slot-index="${String(slotIdx)}"]`
  )
  if (exact) return exact as HTMLElement

  // 2. Fallback: try matching by slot name if provided
  if (slotName !== undefined && slotName !== "") {
    const byName = container.querySelector(
      `[data-slot-node-id="${String(nodeId)}"][data-slot-type="${slotType}"][data-slot-name="${slotName}"]`
    )
    if (byName) return byName as HTMLElement
  }

  // 3. Fallback: find closest pin within this node (any index)
  const anySlot = container.querySelector(
    `[data-slot-node-id="${String(nodeId)}"][data-slot-type="${slotType}"]`
  )
  return anySlot as HTMLElement | null
}

interface PathData {
  id: number
  d: string
  color: string
}

export function SvgConnections(): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [paths, setPaths] = useState<PathData[]>([])

  const allNodes = useReactGraphStore((s) => s.nodes)
  const allLinks = useReactGraphStore((s) => s.links)
  const zoom = useReactGraphStore((s) => s.zoom)
  const disconnect = useReactGraphStore((s) => s.disconnect)
  const activeGraphId = useReactGraphStore((s) => s.activeGraphId)

  // 활성 그래프에 속한 노드/링크만 필터링
  const nodes = useMemo(() => {
    if (activeGraphId === null) {
      return allNodes.filter((n) => n.graphId === null || n.graphId === undefined)
    }
    return allNodes.filter((n) => n.graphId === activeGraphId)
  }, [allNodes, activeGraphId])
  const links = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id))
    return allLinks.filter((l) =>
      nodeIds.has(l.origin_id) && nodeIds.has(l.target_id)
    )
  }, [allLinks, nodes])

  useLayoutEffect(() => {
    const container = svgRef.current?.parentElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const nodeMap = new Map<number, ComfyWorkflowNode>()
    for (const n of nodes) nodeMap.set(n.id, n)

    const newPaths: PathData[] = []

    for (const link of links) {
      const src = nodeMap.get(link.origin_id)
      const dst = nodeMap.get(link.target_id)
      if (!src || !dst) continue

      const srcPin = queryPin(container, src.id, "output", link.origin_slot, src.outputs?.[link.origin_slot]?.name)
      const dstPin = queryPin(container, dst.id, "input", link.target_slot, dst.inputs?.[link.target_slot]?.name)
      if (!srcPin || !dstPin) continue

      const sr = srcPin.getBoundingClientRect()
      const dr = dstPin.getBoundingClientRect()

      const x1 = (sr.left - containerRect.left + sr.width / 2) / zoom
      const y1 = (sr.top - containerRect.top + sr.height / 2) / zoom
      const x2 = (dr.left - containerRect.left + dr.width / 2) / zoom
      const y2 = (dr.top - containerRect.top + dr.height / 2) / zoom

      const dx = x2 - x1
      const curve = Math.max(Math.abs(dx) * 0.55, 50)

      const d = `M ${formatSvgNumber(x1)} ${formatSvgNumber(y1)} C ${formatSvgNumber(x1 + curve)} ${formatSvgNumber(y1)}, ${formatSvgNumber(x2 - curve)} ${formatSvgNumber(y2)}, ${formatSvgNumber(x2)} ${formatSvgNumber(y2)}`
      const color = linkColor(link.type)

      newPaths.push({ id: link.id, d, color })
    }

    setPaths(newPaths)
  }, [nodes, links, zoom])

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <filter id="link-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {paths.map((lp) => (
        <g key={`link-${String(lp.id)}`} className="pointer-events-auto group">
          <path
            d={lp.d}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              if (e.altKey) disconnect(lp.id)
            }}
          >
            <title>Alt + Click to disconnect</title>
          </path>

          <path
            d={lp.d}
            fill="none"
            stroke={lp.color}
            strokeWidth={4}
            strokeOpacity={0.25}
            style={{ filter: "url(#link-glow)" }}
            className="pointer-events-none"
          />

          <path
            d={lp.d}
            fill="none"
            stroke={lp.color}
            strokeWidth={2}
            className="group-hover:stroke-white transition-colors duration-100 cursor-pointer"
          />
        </g>
      ))}
    </svg>
  )
}
