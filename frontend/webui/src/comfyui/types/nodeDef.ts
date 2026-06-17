/**
 * ComfyUI 노드 정의 타입
 * ComfyUI_frontend: src/schemas/nodeDefSchema.ts
 */

export interface InputSpec {
  [0]: string | string[]
  [1]?: Record<string, unknown>
}

export interface ComfyNodeDef {
  name: string
  display_name?: string
  category: string
  input?: {
    required?: Record<string, InputSpec>
    optional?: Record<string, InputSpec>
  }
  output: string[]
  output_name: string[]
  output_is_list?: boolean[]
  output_tooltips?: string[]
  description?: string
  python_module?: string
  deprecated?: boolean
  experimental?: boolean
}
