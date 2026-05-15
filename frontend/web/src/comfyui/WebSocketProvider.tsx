/**
 * 백엔드 WebSocket 클라이언트.
 *
 * 단일 엔드포인트 `${backendUrl}/ws/events`에 연결하여 잡/워커 스냅샷 +
 * 이후 변경 이벤트를 수신한다. 잡 상태와 워커 상태는 이 Provider가
 * 직접 보유 → 자식 컴포넌트는 useBackend()로 읽기만.
 *
 * 자동 재연결(지수 백오프). 백엔드 URL이 바뀌면 끊고 재연결.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { BackendEvent, JobView, WorkerView } from "./Message"
import {
  DEFAULT_BACKEND_URL,
  IS_PACKAGE_MODE,
  PACKAGE_BACKEND_URL,
} from "../lib/runtime"
import { useEffectLog, useRenderLog } from "../lib/renderLogger"
import { BackendContext, type BackendContextValue } from "./BackendContext"

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30_000

const httpToWs = (url: string): string =>
  url.replace(/^http:/, "ws:").replace(/^https:/, "wss:")

interface ProviderProps {
  children: React.ReactNode
  /** 런타임에 변경 가능. 비워두면 localStorage('backendUrl') → 기본값 순으로 폴백. */
  backendUrl?: string
}

const readStoredBackendUrl = (): string => {
  // 패키지 모드: 런처 주입 URL 강제. localStorage 무시 (포트가 매 실행마다 바뀜).
  if (IS_PACKAGE_MODE) return PACKAGE_BACKEND_URL as string
  return localStorage.getItem("backendUrl") || DEFAULT_BACKEND_URL
}

export const WebSocketProvider = ({ children, backendUrl }: ProviderProps) => {
  useRenderLog("WebSocketProvider")
  const [storedUrl, setStoredUrl] = useState<string>(readStoredBackendUrl)
  const url = backendUrl !== undefined ? backendUrl : storedUrl
  const [isConnected, setIsConnected] = useState(false)
  const [jobs, setJobs] = useState<JobView[]>([])
  const [workers, setWorkers] = useState<WorkerView[]>([])
  const [paused, setPaused] = useState(false)
  const [sessionStartedAt] = useState<number>(() => Date.now())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "backendUrl" && e.newValue) setStoredUrl(e.newValue)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const socketRef = useRef<WebSocket | null>(null)
  const shouldReconnectRef = useRef(true)
  const reconnectTimerRef = useRef<number | null>(null)

  const applyEvent = useCallback((event: BackendEvent) => {
    switch (event.type) {
      case "snapshot":
        setJobs(event.jobs)
        setWorkers(event.workers)
        setPaused(event.paused)
        break
      case "job.created":
        setJobs((prev) => [...prev, event.job])
        break
      case "job.updated":
        setJobs((prev) =>
          prev.map((j) => (j.id === event.job.id ? event.job : j))
        )
        break
      case "worker.updated":
        setWorkers((prev) =>
          prev.map((w) => (w.id === event.worker.id ? event.worker : w))
        )
        break
      case "worker.added":
        setWorkers((prev) =>
          prev.some((w) => w.id === event.worker.id)
            ? prev
            : [...prev, event.worker]
        )
        break
      case "worker.removed":
        setWorkers((prev) => prev.filter((w) => w.id !== event.workerId))
        break
      case "control.updated":
        setPaused(event.paused)
        break
      case "job.deleted":
        setJobs((prev) => prev.filter((j) => j.id !== event.jobId))
        break
    }
  }, [])

  useEffectLog(
    "WS 연결",
    () => {
      shouldReconnectRef.current = true
      let backoff = INITIAL_BACKOFF_MS

      const wsUrl = `${httpToWs(url)}/ws/events`

      const connect = () => {
        console.info("[backend] connecting", wsUrl)
        const socket = new WebSocket(wsUrl)
        socketRef.current = socket

        socket.onopen = () => {
          setIsConnected(true)
          backoff = INITIAL_BACKOFF_MS
          console.info("[backend] connected")
        }

        socket.onmessage = (e) => {
          if (typeof e.data !== "string") return
          try {
            const event = JSON.parse(e.data) as BackendEvent
            applyEvent(event)
          } catch (err) {
            console.warn("[backend] bad event", err)
          }
        }

        socket.onerror = () => {
          // close가 따로 호출되니 여기서는 로깅만
        }

        socket.onclose = () => {
          setIsConnected(false)
          socketRef.current = null
          if (!shouldReconnectRef.current) return
          if (reconnectTimerRef.current !== null) {
            clearTimeout(reconnectTimerRef.current)
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null
            connect()
          }, backoff)
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }
      }

      connect()

      return () => {
        shouldReconnectRef.current = false
        if (reconnectTimerRef.current !== null) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        const socket = socketRef.current
        if (socket) {
          socket.onopen = null
          socket.onmessage = null
          socket.onerror = null
          socket.onclose = null
          if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
          ) {
            socket.close()
          }
          socketRef.current = null
        }
        setIsConnected(false)
      }
    },
    [url, applyEvent]
  )

  const value = useMemo<BackendContextValue>(
    () => ({
      isConnected,
      jobs,
      workers,
      paused,
      sessionStartedAt,
    }),
    [isConnected, jobs, workers, paused, sessionStartedAt]
  )

  return (
    <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
  )
}

