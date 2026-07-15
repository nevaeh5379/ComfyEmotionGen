import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type JsonPrimitive = string | number | boolean | null
// An interface is used here because TypeScript rejects a recursive Record alias.
interface JsonObject {
  [key: string]: JsonValue
}
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
type JsonPath = (string | number)[]

interface JsonTreeEditorProps {
  value: string
  onChange: (value: string) => void
  onBackToCode: () => void
}

function isRecord(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cloneAndUpdate(
  root: JsonValue,
  path: JsonPath,
  update: (value: JsonValue) => JsonValue
): JsonValue {
  if (path.length === 0) return update(root)
  const [head, ...tail] = path
  if (Array.isArray(root) && typeof head === "number") {
    const next = [...root]
    const current = next[head]
    if (current !== undefined)
      next[head] = cloneAndUpdate(current, tail, update)
    return next
  }
  if (isRecord(root) && typeof head === "string") {
    const current = root[head]
    if (current === undefined) return root
    return { ...root, [head]: cloneAndUpdate(current, tail, update) }
  }
  return root
}

function removeAtPath(root: JsonValue, path: JsonPath): JsonValue {
  const parentPath = path.slice(0, -1)
  const key = path.at(-1)
  return cloneAndUpdate(root, parentPath, (parent) => {
    if (Array.isArray(parent) && typeof key === "number") {
      return parent.filter((_, index) => index !== key)
    }
    if (isRecord(parent) && typeof key === "string") {
      return Object.fromEntries(
        Object.entries(parent).filter(([entryKey]) => entryKey !== key)
      )
    }
    return parent
  })
}

function parsePrimitive(text: string, previous: JsonPrimitive): JsonPrimitive {
  if (typeof previous === "string") return text
  if (typeof previous === "number") {
    const number = Number(text)
    return Number.isFinite(number) ? number : previous
  }
  if (typeof previous === "boolean") return text === "true"
  return text === "null" ? null : text
}

function TreeRow({
  value,
  path,
  label,
  depth,
  onUpdate,
  onRemove,
  onRename,
}: {
  value: JsonValue
  path: JsonPath
  label: string
  depth: number
  onUpdate: (path: JsonPath, value: JsonValue) => void
  onRemove?: ((path: JsonPath) => void) | undefined
  onRename?: ((path: JsonPath, key: string) => void) | undefined
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(depth < 2)
  const isContainer = Array.isArray(value) || isRecord(value)
  const entries = isContainer ? Object.entries(value) : []
  const kind = Array.isArray(value) ? "배열" : isRecord(value) ? "객체" : ""

  const addChild = (): void => {
    if (Array.isArray(value)) onUpdate(path, [...value, null])
    else if (isRecord(value)) {
      let key = "newKey"
      let index = 1
      while (key in value) key = `newKey${String(index++)}`
      onUpdate(path, { ...value, [key]: null })
    }
    setExpanded(true)
  }

  return (
    <div>
      <div
        className="group flex min-h-8 items-center gap-1 border-b border-line/35 pr-2 hover:bg-muted/35"
        style={{ paddingLeft: `${String(depth * 16 + 6)}px` }}
      >
        {isContainer ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
            onClick={() => {
              setExpanded((current) => !current)
            }}
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        {onRename && path.length > 0 ? (
          <Input
            value={label}
            aria-label="JSON 키"
            className="h-6 w-36 shrink-0 border-transparent bg-transparent px-1 font-mono text-xs focus-visible:border-input"
            onChange={(event) => {
              onRename(path, event.target.value)
            }}
          />
        ) : (
          <span className="w-36 shrink-0 truncate px-1 font-mono text-xs font-semibold text-primary">
            {label}
          </span>
        )}
        <span className="text-muted-foreground">:</span>

        {isContainer ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground"
            onClick={() => {
              setExpanded((current) => !current)
            }}
          >
            {kind} · {String(entries.length)}개 {expanded ? "" : "…"}
          </button>
        ) : typeof value === "boolean" ? (
          <select
            className="h-7 flex-1 rounded border border-line bg-background px-2 font-mono text-xs"
            value={String(value)}
            onChange={(event) => {
              onUpdate(path, event.target.value === "true")
            }}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <Input
            value={value === null ? "null" : String(value)}
            aria-label={`${label} 값`}
            className={cn(
              "h-7 min-w-0 flex-1 font-mono text-xs",
              typeof value === "number" && "text-sky-500",
              value === null && "text-muted-foreground italic"
            )}
            onChange={(event) => {
              onUpdate(path, parsePrimitive(event.target.value, value))
            }}
          />
        )}

        {isContainer && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-60 group-hover:opacity-100"
            onClick={addChild}
            title="항목 추가"
          >
            <Plus />
          </Button>
        )}
        {onRemove && path.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
            onClick={() => {
              onRemove(path)
            }}
            title="항목 삭제"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {isContainer &&
        expanded &&
        entries.map(([key, child], index) => (
          <TreeRow
            key={`${key}-${String(index)}`}
            value={child}
            path={[...path, Array.isArray(value) ? index : key]}
            label={Array.isArray(value) ? String(index) : key}
            depth={depth + 1}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onRename={Array.isArray(value) ? undefined : onRename}
          />
        ))}
    </div>
  )
}

export function JsonTreeEditor({
  value,
  onChange,
  onBackToCode,
}: JsonTreeEditorProps): React.JSX.Element {
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(value) as JsonValue, error: null }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [value])
  if (parsed.error !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-semibold text-destructive">
          JSON을 트리로 표시할 수 없습니다.
        </p>
        <p className="max-w-lg font-mono text-xs text-muted-foreground">
          {parsed.error}
        </p>
        <Button variant="outline" size="sm" onClick={onBackToCode}>
          코드에서 오류 수정
        </Button>
      </div>
    )
  }

  const commit = (next: JsonValue): void => {
    onChange(JSON.stringify(next, null, 2))
  }
  const update = (path: JsonPath, nextValue: JsonValue): void => {
    commit(cloneAndUpdate(parsed.value, path, () => nextValue))
  }
  const remove = (path: JsonPath): void => {
    commit(removeAtPath(parsed.value, path))
  }
  const rename = (path: JsonPath, nextKey: string): void => {
    const oldKey = path.at(-1)
    if (typeof oldKey !== "string" || nextKey === "" || nextKey === oldKey)
      return
    const parentPath = path.slice(0, -1)
    commit(
      cloneAndUpdate(parsed.value, parentPath, (parent) => {
        if (!isRecord(parent) || (nextKey in parent && nextKey !== oldKey))
          return parent
        return Object.fromEntries(
          Object.entries(parent).map(([key, child]) => [
            key === oldKey ? nextKey : key,
            child,
          ])
        )
      })
    )
  }

  return (
    <div className="h-full overflow-auto bg-background select-text">
      <TreeRow
        value={parsed.value}
        path={[]}
        label="root"
        depth={0}
        onUpdate={update}
        onRemove={remove}
        onRename={rename}
      />
    </div>
  )
}
