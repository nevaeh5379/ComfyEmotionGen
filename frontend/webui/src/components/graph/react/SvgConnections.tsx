/**
 * SvgConnections - 노드 연결선을 SVG Bezier 곡선으로 그리는 컴포넌트
 *
 * DOM 레이아웃 이후 핀 요소를 직접 측정하여 정확한 연결선을 그립니다.
 * SVG는 CSS transform(translate/scale) 내부에 있으므로,
 * getBoundingClientRect로 얻은 화면 좌표를 zoom으로 나눠 SVG 좌표계로 변환합니다.
 */

import { useLayoutEffect, useRef, useState } from "react"
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
  slotIdx: number
): HTMLElement | null {
  return container.querySelector(
    `[data-slot-node-id="${nodeId}"][data-slot-type="${slotType}"][data-slot-index="${slotIdx}"]`
  )
}

interface PathData {
  id: number
  d: string
  color: string
}

export function SvgConnections() {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathsRef = useRef<PathData[]>([])
  const [, redraw] = useState(0)

  const nodes = useReactGraphStore((s) => s.nodes)
  const links = useReactGraphStore((s) => s.links)
  const zoom = useReactGraphStore((s) => s.zoom)
  const disconnect = useReactGraphStore((s) => s.disconnect)

  useLayoutEffect(() => {
    const container = svgRef.current?.parentElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const nodeMap = new Map<number, ComfyWorkflowNode>()
    if (nodes) for (const n of nodes) nodeMap.set(n.id, n)

    const newPaths: PathData[] = []

    for (const link of links) {
      const src = nodeMap.get(link.origin_id)
      const dst = nodeMap.get(link.target_id)
      if (!src || !dst) continue

      const srcPin = queryPin(container, src.id, "output", link.origin_slot)
      const dstPin = queryPin(container, dst.id, "input", link.target_slot)
      if (!srcPin || !dstPin) continue

      const sr = srcPin.getBoundingClientRect()
      const dr = dstPin.getBoundingClientRect()

      const x1 = (sr.left - containerRect.left + sr.width / 2) / zoom
      const y1 = (sr.top - containerRect.top + sr.height / 2) / zoom
      const x2 = (dr.left - containerRect.left + dr.width / 2) / zoom
      const y2 = (dr.top - containerRect.top + dr.height / 2) / zoom

      const dx = x2 - x1
      const curve = Math.max(Math.abs(dx) * 0.55, 50)

      const d = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`
      const color = linkColor(link.type)

      newPaths.push({ id: link.id, d, color })
    }

    pathsRef.current = newPaths
    redraw((n) => n + 1)
  }, [nodes, links, zoom])

  const paths = pathsRef.current

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
        <g key={`link-${lp.id}`} className="pointer-events-auto group">
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
