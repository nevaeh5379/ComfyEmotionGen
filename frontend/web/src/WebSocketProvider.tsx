import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

// ---- Types ----
interface ExecInfo {
    queueRemaining: number;
}

interface StatusData {
    execInfo: ExecInfo;
    sid: string;
}

interface RawStatusData {
    status: {
        exec_info: {
            queue_remaining: number;
        };
    };
    sid: string;
}

interface WebSocketMessage<T = unknown> {
    type: string;
    data: T;
}

interface WebSocketContextValue {
    isConnected: boolean;
    clientId?: string;
    lastStatus?: StatusData;
    sendMessage: (message: string) => void;
}

// ---- Constants ----
const WS_URL = "ws://localhost:8000/ws";

// ---- Helpers ----
const normalizeStatusData = (raw: RawStatusData): StatusData => ({
    execInfo: {
        queueRemaining: raw.status.exec_info.queue_remaining,
    },
    sid: raw.sid,
});

// ---- Context ----
const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export const WebSocketProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const socketRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [clientId, setClientId] = useState<string>();
    const [lastStatus, setLastStatus] = useState<StatusData>();

    useEffect(() => {
        const socket = new WebSocket(WS_URL);
        socketRef.current = socket;

        socket.onopen = () => {
            setIsConnected(true);
            console.log("WebSocket connected");
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as WebSocketMessage;

                if (message.type === "status") {
                    const status = normalizeStatusData(
                        message.data as RawStatusData,
                    );
                    setLastStatus(status);
                    setClientId(status.sid);
                }
            } catch (error) {
                console.error("Failed to parse WebSocket message:", error);
            }
        };

        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

        socket.onclose = () => {
            setIsConnected(false);
            console.log("WebSocket disconnected");
        };

        return () => {
            socket.close();
            socketRef.current = null;
        };
    }, []);

    const sendMessage = useCallback((message: string) => {
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(message);
        } else {
            console.warn("WebSocket is not open. Message not sent.");
        }
    }, []);

    const value: WebSocketContextValue = {
        isConnected,
        clientId,
        lastStatus,
        sendMessage,
    };

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within a WebSocketProvider");
    }
    return context;
};