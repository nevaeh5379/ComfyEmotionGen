export interface NamedPersistedItem {
  id: string
  name: string
  savedAt: number
}

interface UpsertedNamedItem<T> {
  item: T
  items: T[]
}

export function createPersistedId(timestamp = Date.now()): string {
  return `${String(timestamp)}-${Math.random().toString(36).slice(2, 7)}`
}

export function upsertNamedItem<T extends NamedPersistedItem>(
  items: T[],
  name: string,
  buildItem: (fields: NamedPersistedItem, existing?: T) => T
): UpsertedNamedItem<T> {
  const trimmedName = name.trim()
  const existing = items.find((item) => item.name === trimmedName)
  const savedAt = Date.now()
  const fields = {
    id: existing?.id ?? createPersistedId(savedAt),
    name: trimmedName,
    savedAt,
  }
  const item = buildItem(fields, existing)

  return {
    item,
    items:
      existing === undefined
        ? [...items, item]
        : items.map((candidate) =>
            candidate.id === existing.id ? item : candidate
          ),
  }
}
