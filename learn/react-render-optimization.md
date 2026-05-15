# React 리렌더링 최적화 — 실전 정리

이 프로젝트에서 실제로 발견하고 수정한 병목 현상을 기준으로 정리한 문서입니다.

---

## 1. 리렌더링이란?

React 컴포넌트는 다음 세 가지 중 하나가 발생하면 다시 실행됩니다.

| 원인 | 설명 |
|------|------|
| **state 변경** | `useState`, `useReducer` 의 값이 바뀜 |
| **props 변경** | 부모로부터 받는 값이 바뀜 |
| **Context 변경** | `useContext` 로 구독 중인 context 값이 바뀜 |

리렌더는 그 자체로 나쁜 게 아닙니다. **불필요한** 리렌더가 문제입니다.

---

## 2. 리렌더 측정 방법

### `useRenderLog` — 컴포넌트당 렌더 횟수 + 소요 시간

```tsx
// src/lib/renderLogger.ts
export function useRenderLog(name: string) {
  const count = useRef(0)
  const renderStart = useRef(performance.now())
  const lastEnd = useRef(performance.now())
  const gap = useRef(0)

  count.current++
  gap.current = performance.now() - lastEnd.current
  renderStart.current = performance.now()

  useLayoutEffect(() => {
    const took = performance.now() - renderStart.current
    lastEnd.current = performance.now()
    console.log(`[Render] ${name} #${count.current}  gap:+${gap.current.toFixed(1)}ms  took:${took.toFixed(1)}ms`)
  })
}

// 컴포넌트 첫 줄에 추가
export function App() {
  useRenderLog("App")
  ...
}
```

- **gap**: 직전 렌더가 끝난 후 이번 렌더가 시작될 때까지 걸린 시간
- **took**: 렌더 함수 진입 → DOM 커밋 완료 (`useLayoutEffect` 기준)

### `useWatchValues` — 무엇이 리렌더를 유발했는지

```tsx
export function useWatchValues(label: string, values: Record<string, unknown>) {
  const prev = useRef<Record<string, unknown>>({})

  const changed = Object.entries(values)
    .filter(([k, v]) => !Object.is(prev.current[k], v))
    .map(([k, v]) => { ... })

  if (changed.length > 0) console.log(`[Change] ${label}: ${changed.join(", ")}`)
  prev.current = values
}

// App 함수 안에서 state를 모두 넘김
useWatchValues("App", { jobs, workers, activeTab, templateSaveName, ... })
```

`[Change] App: templateSaveName` 로그가 반복적으로 보이면 그 state가 범인입니다.

---

## 3. 발견한 병목과 해결 방법

### 병목 1 — 부모 리렌더가 자식 전체로 전파됨

```
[Change] App: templateSaveName
[Render] App #107  took: 215ms
[Render] JobManagerPanel #99  took: 92ms   ← templateSaveName 과 무관한데 같이 렌더됨
```

**원인**: React는 기본적으로 부모가 리렌더되면 자식도 **무조건** 리렌더합니다.  
`JobManagerPanel`이 `templateSaveName`을 받지도 않는데 따라서 92ms를 소비했습니다.

**해결**: `React.memo`

```tsx
// 변경 전
export function JobManagerPanel({ jobs, paused, backendUrl }: Props) { ... }

// 변경 후
export const JobManagerPanel = memo(function JobManagerPanel({ jobs, paused, backendUrl }: Props) {
  ...
})
```

`memo`로 감싸면 **props가 실제로 바뀔 때만** 리렌더됩니다.  
`Object.is` 비교로 각 prop을 얕은 비교(shallow compare)합니다.

> **주의**: props로 매번 새로 생성되는 객체/배열/함수를 넘기면 memo가 무력화됩니다.
> 이 경우 `useMemo` / `useCallback` 으로 참조를 안정화해야 합니다.

---

### 병목 2 — state가 너무 높은 곳에 있음 (state lifting 과잉)

```
[Change] App: templateSaveName   ← 키 입력마다 App 전체가 리렌더
[Render] App #32  took: 102ms
```

**원인**: `templateSaveName` (탬플릿 이름 입력 필드의 텍스트)이 `App`의 state였습니다.  
사용자가 키를 한 번 누를 때마다 1977줄짜리 `App` 전체가 리렌더되었습니다.

```tsx
// 변경 전 — App에서 state 관리
const [templateSaveName, setTemplateSaveName] = useState("")
<SavedItemsManager
  saveName={templateSaveName}
  onSaveNameChange={setTemplateSaveName}
  ...
/>
```

**해결**: state를 실제로 사용하는 컴포넌트 안으로 내려보냄 (state colocation)

```tsx
// 변경 후 — SavedItemsManager가 직접 state 관리
function SavedItemsManager({ onSave, ... }) {
  const [name, setName] = useState("")  // 여기서 관리

  const handleSave = () => {
    if (onSave(name.trim())) setName("")  // 저장 성공 시 초기화
  }
  ...
}

// App에서는 key prop으로 외부 reset만 제어
const [templateResetKey, setTemplateResetKey] = useState(0)
<SavedItemsManager
  key={templateResetKey}   // 값이 바뀌면 컴포넌트 remount → state 초기화
  onSave={(name) => {
    if (conflict) { setPendingSave(...); return false }  // false = 초기화 안 함
    saveTemplate(name, cegTemplate)
    return true   // true = 초기화
  }}
  ...
/>
```

이제 키 입력 → `SavedItemsManager` 내부만 리렌더 → App은 침묵.

---

## 4. 핵심 원칙 정리

### State Colocation (state 공동 배치)

> state는 그것을 사용하는 컴포넌트에 최대한 가깝게 두어라.

```
App (전역 state X)
├── SavedItemsManager (name state ✅ — 여기서만 씀)
├── JobManagerPanel   (jobs, paused — WebSocket에서 옴)
└── SavedImagesGallery (filters — 갤러리 내부에서만 씀)
```

state를 위로 올릴수록(lifting) 리렌더 범위가 넓어집니다.

### React.memo 체크리스트

memo를 붙이기 *좋은* 컴포넌트:
- 렌더 비용이 높은 컴포넌트 (100ms 이상)
- 부모의 관계없는 state 변경에 자주 끌려다니는 컴포넌트

memo가 *소용없는* 경우:
- props로 매번 새로운 객체/배열이 내려오는 경우 → `useMemo`로 안정화 필요
- 부모 자체가 빠른 경우 (memo 오버헤드가 이득보다 큼)

### key prop으로 state 초기화

컴포넌트를 완전히 리셋해야 할 때 `useEffect` + `setState` 대신 `key`를 씁니다.

```tsx
// key가 바뀌면 React가 컴포넌트를 unmount → remount → 모든 state 초기화
<Editor key={resetKey} />

// 리셋이 필요할 때
setResetKey(k => k + 1)
```

`useEffect(() => { setState(...) }, [dep])` 패턴은 불필요한 렌더 사이클을 만들고  
`react-compiler` 린트 규칙에도 위배됩니다.

---

## 5. 측정 → 수정 → 검증 흐름

```
1. useRenderLog 추가 → 어떤 컴포넌트가 얼마나 자주, 얼마나 느리게 렌더되는지 확인
2. useWatchValues 추가 → 어떤 state/prop 변경이 트리거인지 찾기
3. state colocation 적용 → state를 사용하는 곳 가까이 내림
4. React.memo 적용 → 무관한 부모 리렌더로부터 자식 보호
5. 로그 재확인 → [Change]와 took이 줄었는지 검증
```

> 측정 없이 최적화하지 마세요. React.memo를 모든 컴포넌트에 붙이는 건 오히려  
> 불필요한 얕은 비교 비용을 더합니다. 문제가 있는 곳만 고치세요.

---

## 참고: 개발 환경에서만 로그 출력

```tsx
const IS_DEV = import.meta.env.DEV   // Vite
// 또는
const IS_DEV = process.env.NODE_ENV === "development"  // CRA / webpack
```

프로덕션 빌드에서는 Vite / webpack의 dead-code elimination이 IS_DEV 분기를 제거합니다.
