/**
 * SvgConnections - 노드 연결선을 SVG Bezier 곡선으로 그리는 컴포넌트
 *
 * ⚡ DOM 측정(getBoundingClientRect) 없이 store 데이터만으로
 *    핀 위치를 수학적으로 계산 → 드래그 시 즉시 반응
 */

import { useMemo } from "react"
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"
import type { ComfyWorkflowNode } from "@/lib/comfy-graph/types/workflow"

// ─── ReactNode.tsx 레이아웃 상수 (Tailwind 값과 동기화 유지) ──────────────
//  title bar:  py-1(4) + text-xs line-height(14) + border(1) ≈ 25px
const TITLE_H        = 25   // 타이틀 바 높이
const CONTENT_PAD    = 4    // py-1 top padding (content 영역)
const ROW_H          = 16   // h-4  슬롯 행 높이
const ROW_GAP        = 2    // gap-0.5 슬롯 행 사이 간격
const PIN_R          = 5    // w-2.5 h-2.5 → 직경 10px → 반지름 5px
const GRID_PAD_X     = 4    // px-1  그리드 좌우 패딩
// ─────────────────────────────────────────────────────────────────────────

/** output 핀(우측) 중심 좌표 → 월드 좌표 */
function outputPinCenter(node: ComfyWorkflowNode, slotIdx: number): [number, number] {
  return [
    node.pos[0] + node.size[0] - GRID_PAD_X - PIN_R,
    node.pos[1] + TITLE_H + CONTENT_PAD + slotIdx * (ROW_H + ROW_GAP) + ROW_H / 2,
  ]
}

/** input 핀(좌측) 중심 좌표 → 월드 좌표 */
function inputPinCenter(node: ComfyWorkflowNode, slotIdx: number): [number, number] {
  return [
    node.pos[0] + GRID_PAD_X + PIN_R,
    node.pos[1] + TITLE_H + CONTENT_PAD + slotIdx * (ROW_H + ROW_GAP) + ROW_H / 2,
  ]
}

/** 타입 문자열 → 연결선 색상 */
function linkColor(type: string): string {
  const t = type.toUpperCase()
  if (t === "MODEL")       return "#a78bfa"  // violet
  if (t === "LATENT")      return "#f472b6"  // pink
  if (t === "CONDITIONING") return "#fb923c" // orange
  if (t === "IMAGE")       return "#34d399"  // green
  if (t === "CLIP")        return "#facc15"  // yellow
  if (t === "VAE")         return "#60a5fa"  // blue
  return "#6ee7b7"                           // teal (default)
}

export function SvgConnections() {
  const nodes    = useReactGraphStore((s) => s.nodes)
  const links    = useReactGraphStore((s) => s.links)
  const disconnect = useReactGraphStore((s) => s.disconnect)

  // id → node 빠른 조회용 맵
  const nodeMap = useMemo(() => {
    const m = new Map<number, ComfyWorkflowNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // 링크 → 베지어 경로 계산 (DOM 측정 없음 → 즉시 반응)
  const paths = useMemo(() => {
    return links.flatMap((link) => {
      const src = nodeMap.get(link.origin_id)
      const dst = nodeMap.get(link.target_id)
      if (!src || !dst) return []

      const [x1, y1] = outputPinCenter(src, link.origin_slot)
      const [x2, y2] = inputPinCenter(dst, link.target_slot)

      const dx     = x2 - x1
      const curve  = Math.max(Math.abs(dx) * 0.55, 50)
      const cp1x   = x1 + curve
      const cp2x   = x2 - curve

      const d = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`
      const color = linkColor(link.type)

      return [{ id: link.id, d, color }]
    })
  }, [links, nodeMap])

  return (
    <svg
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
          {/* 클릭 감지용 투명 두꺼운 패스 */}
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

          {/* 글로우 그림자 */}
          <path
            d={lp.d}
            fill="none"
            stroke={lp.color}
            strokeWidth={4}
            strokeOpacity={0.25}
            style={{ filter: "url(#link-glow)" }}
            className="pointer-events-none"
          />

          {/* 실제 선 */}
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
