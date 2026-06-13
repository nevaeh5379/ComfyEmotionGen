/**
 * SvgConnections - 노드 연결선을 SVG Bezier 곡선으로 그리는 컴포넌트
 */

import { useEffect, useState, useMemo } from "react"
import { useReactGraphStore } from "@/lib/comfy-graph/stores/reactGraphStore"

interface SvgConnectionsProps {
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function SvgConnections({ containerRef }: SvgConnectionsProps) {
  const nodes = useReactGraphStore((s) => s.nodes)
  const links = useReactGraphStore((s) => s.links)
  const zoom = useReactGraphStore((s) => s.zoom)
  const disconnect = useReactGraphStore((s) => s.disconnect)

  const [tick, setTick] = useState(0)

  // 노드 드래그 및 그래프 상태 변화 시 핀 위치 재계산 트리거
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setTick((t) => t + 1)
    })
    return () => cancelAnimationFrame(handle)
  }, [nodes, links, zoom, tick]) // 매 렌더링 프레임 핀 위치 추적 보장

  // 연결선 경로 계산
  const renderedPaths = useMemo(() => {
    const containerEl = containerRef.current
    if (!containerEl) return []

    const containerRect = containerEl.getBoundingClientRect()

    return links.map((link) => {
      // 1. Output Pin (시작점) 찾기
      const outSelector = `[data-slot-node-id="${link.origin_id}"][data-slot-type="output"][data-slot-index="${link.origin_slot}"]`
      const outEl = containerEl.querySelector(outSelector)

      // 2. Input Pin (끝점) 찾기
      const inSelector = `[data-slot-node-id="${link.target_id}"][data-slot-type="input"][data-slot-index="${link.target_slot}"]`
      const inEl = containerEl.querySelector(inSelector)

      if (!outEl || !inEl) return null

      const outRect = outEl.getBoundingClientRect()
      const inRect = inEl.getBoundingClientRect()

      // 컨테이너 로컬 스페이스(world coords)로 핀 중심 좌표 변환
      const p1: [number, number] = [
        (outRect.left - containerRect.left + outRect.width / 2) / zoom,
        (outRect.top - containerRect.top + outRect.height / 2) / zoom,
      ]

      const p2: [number, number] = [
        (inRect.left - containerRect.left + inRect.width / 2) / zoom,
        (inRect.top - containerRect.top + inRect.height / 2) / zoom,
      ]

      // Bezier 곡선 경로 계산
      const dx = p2[0] - p1[0]
      const curve = Math.max(Math.abs(dx) * 0.55, 40)
      const cp1x = p1[0] + curve
      const cp1y = p1[1]
      const cp2x = p2[0] - curve
      const cp2y = p2[1]

      const path = `M ${p1[0]} ${p1[1]} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`

      return {
        id: link.id,
        path,
        type: link.type,
      }
    }).filter(Boolean) as Array<{ id: number; path: string; type: string }>
  }, [links, nodes, zoom, containerRef, tick])

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
      {/* 그림자 및 후광 효과 */}
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 연결선들 */}
      {renderedPaths.map((lp) => (
        <g key={`g-link-${lp.id}`} className="pointer-events-auto group">
          {/* 클릭 감지용 두꺼운 투명 패스 */}
          <path
            d={lp.path}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              // Alt + 클릭 시 연결 끊기
              if (e.altKey) {
                disconnect(lp.id)
              }
            }}
          >
            <title>Alt + Click to disconnect</title>
          </path>
          {/* 실제 그려지는 비주얼 패스 */}
          <path
            d={lp.path}
            fill="none"
            stroke={lp.type === "model" ? "#b5a2ff" : lp.type === "latent" ? "#ff8cbb" : "#4ade80"}
            strokeWidth={2.5}
            className="transition-all duration-150 group-hover:stroke-primary group-hover:stroke-[3.5px] cursor-pointer"
            style={{ filter: "url(#glow)" }}
          />
        </g>
      ))}
    </svg>
  )
}
