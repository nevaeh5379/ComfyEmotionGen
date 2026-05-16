export type ObjectInfoInputSpec = [string[] | string, Record<string, unknown>?]
export type ObjectInfo = Record<
  string,
  {
    input: {
      required?: Record<string, ObjectInfoInputSpec>
      optional?: Record<string, ObjectInfoInputSpec>
    }
  }
>

export interface RenderItem {
  filename: string
  prompt: string
  meta: Record<string, string>
}

export interface AxisValueOut {
  key: string
  value: string
  props: Record<string, string>
}

export interface AxisOut {
  include?: string
  values: AxisValueOut[]
}

export interface ExcludeConditionOut {
  axis: string
  op: string
  values: string[]
}

export interface ExcludeRuleOut {
  conditions: ExcludeConditionOut[]
  connective: string
}

export interface RenderItemsResponse {
  count: number
  items: RenderItem[]
  axes: Record<string, AxisOut>
  sets: Record<string, string>
  excludes: ExcludeRuleOut[]
}
