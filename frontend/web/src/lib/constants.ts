/**
 * 매직 넘버 및 공통 상수 중앙 집중화.
 */

// ── 시간 / 지연 / 간격 ──
export const HEALTH_CHECK_INTERVAL_MS = 5000
export const WS_INITIAL_BACKOFF_MS = 1000
export const WS_MAX_BACKOFF_MS = 30_000
export const WS_RECONNECT_DELAY_MS = 2000
export const CEG_TEMPLATE_DEBOUNCE_MS = 600
export const ASYNC_ACTION_DURATION_MS = 3000
export const TICK_INTERVAL_MS = 1000
export const COPIED_RESET_DELAY_MS = 1500
export const BULK_ACTION_MESSAGE_DURATION_MS = 3000
export const BULK_REGEN_ACTION_DURATION_MS = 4000
export const BULK_TRASH_ACTION_DURATION_MS = 4000
export const TOOLTIP_OPEN_DELAY_MS = 400
export const TOOLTIP_HOVER_DISABLE_DELAY_MS = 99999

// ── 페이지 크기 / 리밋 ──
export const DEFAULT_IMAGE_PAGE_SIZE = 48
export const DEFAULT_GROUP_PAGE_SIZE = 20
export const JOB_PAGE_SIZE = 50
export const COMBINATION_DATA_LIMIT = 5000

// ── 레이아웃 / 그래프 ──
export const GRAPH_LAYER_GAP_X = 280
export const GRAPH_NODE_GAP_Y = 140
export const GALLERY_MIN_HEIGHT = 400
export const RESIZABLE_PANEL_DEFAULT_LEFT = 35
export const RESIZABLE_PANEL_MIN_LEFT = 25
export const RESIZABLE_PANEL_DEFAULT_RIGHT = 65

// ── 이미지 뷰어 ──
export const IMAGE_VIEWER_MAX_ZOOM = 6
export const IMAGE_VIEWER_MIN_ZOOM = 1
export const IMAGE_VIEWER_WHEEL_FACTOR = 1.12
export const IMAGE_VIEWER_LENS_SIZE = 140
export const IMAGE_VIEWER_LENS_ZOOM = 2.5
export const IMAGE_VIEWER_LENS_OFFSET = 18
export const IMAGE_VIEWER_CLICK_THRESHOLD = 6
export const IMAGE_VIEWER_ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6] as const

// ── 시간 포맷 상수 ──
export const MS_PER_SECOND = 1000
export const SECONDS_PER_MINUTE = 60
export const SECONDS_PER_HOUR = 3600

// ── 기타 ──
export const MAX_RANDOM_SEED = 1_000_000_000
export const DEFAULT_SEED_STRATEGY: "random" | "increment" = "random"
export const DEFAULT_DUPLICATE_STRATEGY: "hash" | "number" = "hash"
export const NAME_CONFLICT_START_NUMBER = 2
