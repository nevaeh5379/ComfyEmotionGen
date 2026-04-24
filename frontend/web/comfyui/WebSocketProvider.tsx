import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { z } from "zod"
import { wsLogger, wsInLogger, wsOutLogger } from "../src/lib/logger"
import { WebSocketMessageSchema } from "./Message"
const WS_URL = "ws://127.0.0.1:8188/ws"


export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>
export type StatusData = Extract<WebSocketMessage, { type: "status" }>
export type ProgressStateData = Extract<
  WebSocketMessage,
  { type: "progress_state" }
>
export type ProgressData = Extract<WebSocketMessage, { type: "progress" }>
export type ExecutedData = Extract<WebSocketMessage, { type: "executed" }>
export type ExecutingData = Extract<WebSocketMessage, { type: "executing" }>
export type ExecutionSuccessData = Extract<
  WebSocketMessage,
  { type: "execution_success" }
>
export type ExecutionStartData = Extract<
  WebSocketMessage,
  { type: "execution_start" }
>
export type ExecutionInterruptedData = Extract<
  WebSocketMessage,
  { type: "execution_interrupted" }
>
export type ExecutionCachedData = Extract<
  WebSocketMessage,
  { type: "execution_cached" }
>

interface WebSocketContextValue {
  isConnected: boolean
  clientId: string | undefined
  lastStatus: StatusData | undefined
  sendMessage: (message: string) => void
  subscribe: (listener: (msg: WebSocketMessage) => void) => () => void
  subscribeBinary: (listener: (frame: BinaryFrame) => void) => () => void
  
}
interface BinaryFrame {
  eventType: number
  format: number
  data: ArrayBuffer  // 헤더 제외한 순수 이미지 바이트
}
const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export const WebSocketProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const socketRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [clientId, setClientId] = useState<string>()
  const shouldReconnectRef = useRef(true)
  const [lastStatus, setLastStatus] = useState<StatusData>()
  const reconnectTimeoutRef = useRef<number | null>(null)
  const maxReconnectAttemptsRef = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 10
  const listenersRef = useRef(new Set<(msg: WebSocketMessage) => void>())
  const binaryListenersRef = useRef(new Set<(frame: BinaryFrame) => void>())
const subscribe = useCallback((listener: (msg: WebSocketMessage) => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const subscribeBinary = useCallback((listener: (frame: BinaryFrame) => void) => {
    binaryListenersRef.current.add(listener)
    return () => {
      binaryListenersRef.current.delete(listener)
    }
  }, [])
  useEffect(() => {
    shouldReconnectRef.current = true
    maxReconnectAttemptsRef.current = 0

    const connect = () => {
      wsLogger.info("Attempting to connect to WebSocket...")
      const socket = new WebSocket(WS_URL)
      socket.binaryType = "arraybuffer" 
      socketRef.current = socket

      socket.onopen = () => {
        setIsConnected(true)
        maxReconnectAttemptsRef.current = 0
        wsLogger.info("WebSocket connected successfully")
      }

      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength < 8) return
          const view = new DataView(event.data)
          const frame: BinaryFrame = {
            eventType: view.getUint32(0, false),
            format: view.getUint32(4, false),
            data: event.data.slice(8),
          }
          wsInLogger.debug("binary", {
            eventType: frame.eventType,
            format: frame.format,
            size: frame.data.byteLength,
          })
          binaryListenersRef.current.forEach((l) => l(frame))
          return
        }
        try {
          const message = JSON.parse(event.data)
          wsInLogger.debug(message)
          const result = WebSocketMessageSchema.safeParse(message)
          if (!result.success) {
            wsInLogger.error("parse failed", {
              error: result.error.format(),
              raw: message,
            })
            return
          }
          const normalized = result.data
          if (normalized.type === "status") {
            setLastStatus(normalized)
            if (normalized.sid) setClientId(normalized.sid)  // undefined로 덮어쓰지 않음
          }
          // 리스너들에게 브로드캐스트
          listenersRef.current.forEach((l) => l(normalized))
        } catch (error) {
          wsInLogger.error("JSON parse failed", error)
        }
      }

      socket.onerror = (event) => {
        console.error("WebSocket error occurred:", event)
      }

      socket.onclose = (event) => {
        setIsConnected(false)
        socketRef.current = null
        wsLogger.info(
          `WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`
        )

        if (shouldReconnectRef.current && maxReconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          maxReconnectAttemptsRef.current++
          const delay = Math.min(1000 * Math.pow(2, maxReconnectAttemptsRef.current), 30000) // 지수 백오프 (최대 30초)
          wsLogger.info(
            `Reconnecting in ${delay / 1000} seconds... (Attempt ${maxReconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          )
          
          if (reconnectTimeoutRef.current !== null) {
            clearTimeout(reconnectTimeoutRef.current)
          }
          
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectTimeoutRef.current = null
            connect()
          }, delay)
        } else if (maxReconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          wsLogger.error("Max reconnect attempts reached. Stopping reconnection.")
        }
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      

      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
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
    }
  }, [])

  const sendMessage = useCallback((message: string) => {
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message)
    } else {
      console.warn("WebSocket is not open. Message not sent.")
    }
  }, [])

  const value: WebSocketContextValue = {
    isConnected,
    clientId,
    lastStatus,
    sendMessage,
    subscribe,
    subscribeBinary,
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider")
  }
  return context
}
