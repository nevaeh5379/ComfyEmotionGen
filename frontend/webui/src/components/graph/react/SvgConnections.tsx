/**
 * SvgConnections - 노드 연결선을 SVG Bezier 곡선으로 그리는 컴포넌트
 *
 * DOM 레이아웃 이후 핀 요소를 직접 측정하여 정확한 연결선을 그립니다.
 * SVG는 CSS transform(translate/scale) 내부에 있으므로,
 * getBoundingClientRect로 얻은 화면 좌표를 zoom으로 나눠 SVG 좌표계로 변환합니다.
 */

import React, { useLayoutEffect, useRef, useState } from "react"
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"
import type { ComfyWorkflowNode } from "@/lib/comfy-graph/types/workflow"

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
  if (exact !== null) return exact as HTMLElement

  // 2. Fallback: try matching by slot name if provided
  if (slotName !== undefined && slotName !== "") {
    const byName = container.querySelector(
      `[data-slot-node-id="${String(nodeId)}"][data-slot-type="${slotType}"][data-slot-name="${slotName}"]`
    )
    if (byName !== null) return byName as HTMLElement
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

export function SvgConnections(): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const [paths, setPaths] = useState<PathData[]>([])

  const nodes = useReactGraphStore((s) => s.nodes)
  const links = useReactGraphStore((s) => s.links)
  const zoom = useReactGraphStore((s) => s.zoom)
  const disconnect = useReactGraphStore((s) => s.disconnect)

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

      const d = `M ${String(x1)} ${String(y1)} C ${String(x1 + curve)} ${String(y1)}, ${String(x2 - curve)} ${String(y2)}, ${String(x2)} ${String(y2)}`
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
