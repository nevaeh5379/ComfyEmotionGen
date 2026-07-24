type CounterName =
  | "blob"
  | "objectUrlCreate"
  | "objectUrlRevoke"
  | "imageData"
  | "webSocketArrayBuffer"
  | "webSocketBlob"
  | "webSocketText"
  | "imgSrc"
  | "resourceImage"
  | "resourceFetch"
  | "resourceOther"

interface Counter {
  count: number
  bytes: number
}

interface MemoryProbeState {
  enabled: boolean
  startedAt: number
  counters: Record<CounterName, Counter>
  bySite: Record<string, Counter>
  liveObjectUrls: Map<string, { size: number; site: string; createdAt: number }>
  seenResourceNames: Set<string>
  lastReportAt: number
  intervalId: number | null
  reset(): void
  report(): void
  stop(): void
}

type NativeWebSocketConstructor = typeof WebSocket

const COUNTER_NAMES: CounterName[] = [
  "blob",
  "objectUrlCreate",
  "objectUrlRevoke",
  "imageData",
  "webSocketArrayBuffer",
  "webSocketBlob",
  "webSocketText",
  "imgSrc",
  "resourceImage",
  "resourceFetch",
  "resourceOther",
]

function createCounters(): Record<CounterName, Counter> {
  return Object.fromEntries(
    COUNTER_NAMES.map((name) => [name, { count: 0, bytes: 0 }])
  ) as Record<CounterName, Counter>
}

function shouldEnableMemoryProbe(): boolean {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get("cegMemProbe") === "1") return true
    if (window.localStorage.getItem("ceg_memory_probe") === "1") return true
  } catch {
    return false
  }
  return false
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getCallSite(): string {
  const stack = new Error().stack ?? ""
  const line =
    stack
      .split("\n")
      .map((entry) => entry.trim())
      .find(
        (entry) =>
          entry.includes("/src/") && !entry.includes("/src/lib/memoryProbe.ts")
      ) ?? "unknown"
  return line.replace(window.location.origin, "")
}

function getBlobPartsSize(blobParts: BlobPart[] | undefined): number {
  if (blobParts === undefined) return 0
  let total = 0
  for (const part of blobParts) {
    if (typeof part === "string") {
      total += part.length * 2
    } else {
      const sizedPart = part as { size?: unknown; byteLength?: unknown }
      if (typeof sizedPart.size === "number") {
        total += sizedPart.size
      } else if (typeof sizedPart.byteLength === "number") {
        total += sizedPart.byteLength
      }
    }
  }
  return total
}

function getBlobLikeSize(object: Blob | MediaSource): number {
  const maybeSized = object as { size?: unknown }
  return typeof maybeSized.size === "number" ? maybeSized.size : 0
}

function increment(
  state: MemoryProbeState,
  name: CounterName,
  bytes: number,
  site?: string
): void {
  if (!state.enabled) return
  const resolvedSite = site ?? getCallSite()
  state.counters[name].count += 1
  state.counters[name].bytes += bytes
  const key = `${name} ${resolvedSite}`
  state.bySite[key] ??= { count: 0, bytes: 0 }
  state.bySite[key].count += 1
  state.bySite[key].bytes += bytes
}

function getJsHeapInfo(): string {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
  }
  if (perf.memory === undefined) return "heap n/a"
  return `heap ${formatBytes(perf.memory.usedJSHeapSize)} / ${formatBytes(
    perf.memory.totalJSHeapSize
  )}`
}

function collectDomMemorySnapshot(): {
  images: number
  blobImages: number
  canvases: number
  canvasBytes: number
} {
  const images = Array.from(document.images)
  const canvases = Array.from(document.querySelectorAll("canvas"))
  return {
    images: images.length,
    blobImages: images.filter((img) => img.currentSrc.startsWith("blob:"))
      .length,
    canvases: canvases.length,
    canvasBytes: canvases.reduce(
      (sum, canvas) => sum + canvas.width * canvas.height * 4,
      0
    ),
  }
}

function collectResourceTiming(state: MemoryProbeState): void {
  const entries = performance.getEntriesByType("resource")
  for (const entry of entries) {
    const resource = entry as PerformanceResourceTiming
    if (state.seenResourceNames.has(resource.name)) continue
    state.seenResourceNames.add(resource.name)
    const bytes = Math.max(resource.decodedBodySize, resource.transferSize, 0)
    if (bytes === 0) continue
    if (resource.initiatorType === "img") {
      increment(state, "resourceImage", bytes, resource.name)
    } else if (
      resource.initiatorType === "fetch" ||
      resource.initiatorType === "xmlhttprequest"
    ) {
      increment(state, "resourceFetch", bytes, resource.name)
    } else {
      increment(state, "resourceOther", bytes, resource.name)
    }
  }
}

function createState(): MemoryProbeState {
  return {
    enabled: true,
    startedAt: performance.now(),
    counters: createCounters(),
    bySite: {},
    liveObjectUrls: new Map(),
    seenResourceNames: new Set(),
    lastReportAt: performance.now(),
    intervalId: null,
    reset(): void {
      this.counters = createCounters()
      this.bySite = {}
      this.seenResourceNames.clear()
      performance.clearResourceTimings()
      this.lastReportAt = performance.now()
    },
    report(): void {
      collectResourceTiming(this)
      const now = performance.now()
      const seconds = Math.max(0.001, (now - this.lastReportAt) / 1000)
      const rows = COUNTER_NAMES.map((name) => ({
        kind: name,
        count: this.counters[name].count,
        total: formatBytes(this.counters[name].bytes),
        perSecond: `${formatBytes(this.counters[name].bytes / seconds)}/s`,
      })).filter((row) => row.count > 0)
      const liveObjectUrlBytes = Array.from(
        this.liveObjectUrls.values()
      ).reduce((sum, item) => sum + item.size, 0)
      const dom = collectDomMemorySnapshot()
      console.groupCollapsed(
        `[CEG memory] ${getJsHeapInfo()} liveObjectUrls=${String(
          this.liveObjectUrls.size
        )} (${formatBytes(liveObjectUrlBytes)}) images=${String(
          dom.images
        )} blobImages=${String(dom.blobImages)} canvases=${String(
          dom.canvases
        )} canvas=${formatBytes(dom.canvasBytes)}`
      )
      console.table(rows)
      console.table(
        Object.entries(this.bySite)
          .sort(([, a], [, b]) => b.bytes - a.bytes)
          .slice(0, 12)
          .map(([site, counter]) => ({
            site,
            count: counter.count,
            total: formatBytes(counter.bytes),
            perSecond: `${formatBytes(counter.bytes / seconds)}/s`,
          }))
      )
      console.groupEnd()
      this.reset()
    },
    stop(): void {
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId)
        this.intervalId = null
      }
      this.enabled = false
      this.liveObjectUrls.clear()
      this.seenResourceNames.clear()
      performance.clearResourceTimings()
    },
  }
}

function installBlobProbe(state: MemoryProbeState): void {
  const NativeBlob = window.Blob
  class InstrumentedBlob extends NativeBlob {
    constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
      super(blobParts, options)
      if (state.enabled) {
        increment(state, "blob", getBlobPartsSize(blobParts))
      }
    }
  }
  window.Blob = InstrumentedBlob
}

function installObjectUrlProbe(state: MemoryProbeState): void {
  const nativeCreate = URL.createObjectURL.bind(URL)
  const nativeRevoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = nativeCreate(object)
    if (!state.enabled) return url
    const site = getCallSite()
    const size = getBlobLikeSize(object)
    state.liveObjectUrls.set(url, { size, site, createdAt: performance.now() })
    increment(state, "objectUrlCreate", size, site)
    return url
  }
  URL.revokeObjectURL = (url: string): void => {
    if (state.enabled) {
      const tracked = state.liveObjectUrls.get(url)
      increment(state, "objectUrlRevoke", tracked?.size ?? 0)
      state.liveObjectUrls.delete(url)
    }
    nativeRevoke(url)
  }
}

function installCanvasProbe(state: MemoryProbeState): void {
  const proto = CanvasRenderingContext2D.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, "getImageData")
  const nativeGetImageData = descriptor?.value as
    | CanvasRenderingContext2D["getImageData"]
    | undefined
  if (nativeGetImageData === undefined) return
  proto.getImageData = function (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    settings?: ImageDataSettings
  ): ImageData {
    const result =
      settings === undefined
        ? nativeGetImageData.call(this, sx, sy, sw, sh)
        : nativeGetImageData.call(this, sx, sy, sw, sh, settings)
    if (state.enabled) {
      increment(state, "imageData", result.data.byteLength)
    }
    return result
  }
}

function installImageProbe(state: MemoryProbeState): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src"
  )
  if (descriptor?.set === undefined || descriptor.get === undefined) return
  const srcDescriptor = descriptor as {
    enumerable?: boolean
    get(this: HTMLImageElement): string
    set(this: HTMLImageElement, value: string): void
  }
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    enumerable: srcDescriptor.enumerable === true,
    get(this: HTMLImageElement): string {
      return srcDescriptor.get.call(this)
    },
    set(this: HTMLImageElement, value: string): void {
      if (state.enabled) {
        increment(state, "imgSrc", value.length * 2)
      }
      srcDescriptor.set.call(this, value)
    },
  })
}

function installWebSocketProbe(state: MemoryProbeState): void {
  const NativeWebSocket: NativeWebSocketConstructor = window.WebSocket
  class InstrumentedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      super.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (!state.enabled) return
        const data = event.data
        if (data instanceof ArrayBuffer) {
          increment(state, "webSocketArrayBuffer", data.byteLength)
        } else if (data instanceof Blob) {
          increment(state, "webSocketBlob", data.size)
        } else if (typeof data === "string") {
          increment(state, "webSocketText", data.length * 2)
        }
      })
    }
  }
  window.WebSocket = InstrumentedWebSocket
}

declare global {
  interface Window {
    __cegMemProbe?: MemoryProbeState
    __cegStartMemProbe?: () => MemoryProbeState
    __cegMemProbeStatus?: () => {
      loaded: boolean
      enabled: boolean
      href: string
      queryFlag: string | null
      storageFlag: string | null
      intervalRunning: boolean
    }
  }
}

function startMemoryProbe(): MemoryProbeState {
  const existing = window.__cegMemProbe
  if (existing !== undefined) {
    existing.enabled = true
    existing.lastReportAt = performance.now()
    existing.intervalId ??= window.setInterval(() => {
      existing.report()
    }, 1000)
    console.info(
      "[CEG memory] probe enabled. Use window.__cegMemProbe.report(), reset(), stop()."
    )
    return existing
  }

  const state = createState()
  window.__cegMemProbe = state
  installBlobProbe(state)
  installObjectUrlProbe(state)
  installCanvasProbe(state)
  installImageProbe(state)
  installWebSocketProbe(state)
  state.intervalId = window.setInterval(() => {
    state.report()
  }, 1000)
  console.info(
    "[CEG memory] probe enabled. Use window.__cegMemProbe.report(), reset(), stop()."
  )
  return state
}

function getMemoryProbeStatus(): {
  loaded: boolean
  enabled: boolean
  href: string
  queryFlag: string | null
  storageFlag: string | null
  intervalRunning: boolean
} {
  let queryFlag: string | null = null
  let storageFlag: string | null = null
  try {
    queryFlag = new URL(window.location.href).searchParams.get("cegMemProbe")
    storageFlag = window.localStorage.getItem("ceg_memory_probe")
  } catch {
    // ignore
  }
  const intervalId = window.__cegMemProbe?.intervalId
  return {
    loaded: true,
    enabled: window.__cegMemProbe?.enabled === true,
    href: window.location.href,
    queryFlag,
    storageFlag,
    intervalRunning: intervalId !== undefined && intervalId !== null,
  }
}

if (typeof window !== "undefined") {
  window.__cegStartMemProbe = startMemoryProbe
  window.__cegMemProbeStatus = getMemoryProbeStatus
  if (shouldEnableMemoryProbe()) {
    startMemoryProbe()
  }
}
