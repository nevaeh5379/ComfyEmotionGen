/**
 * BackendUrl Context
 *
 * backendUrl은 jobs/workers/workerPreviews와 달리 거의 변경되지 않는 값이다.
 * WebSocketProvider에서 BackendContext value가 자주 변경되면 모든 consumer가
 * 불필요하게 리렌더링되므로, backendUrl 전용 context로 분리한다.
 */

import { createContext } from "react"

export const BackendUrlContext = createContext<string | null>(null)
