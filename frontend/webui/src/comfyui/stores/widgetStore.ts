import type { LGraphNode, WidgetValue } from "../types/lgraphAdapterNode"

export { type WidgetValue }

/** 커스텀 위젯 팩토리가 반환/처리하는 widget 객체 형태 */
export interface CustomWidget {
  type?: string
  name: string
  value?: WidgetValue
  element?: HTMLElement
  callback?: ((v: WidgetValue) => void) | null
  options?: Record<string, unknown>
  y?: number
  width?: number
  height?: number
  last_y?: number
  computedHeight?: number
  [key: string]: unknown
}

/**
 * ComfyUI 확장의 getCustomWidgets가 반환하는 팩토리 시그니처.
 * (node, inputName, inputData, app) => IWidget | undefined
 * inputData 는 [type, config] 튜플.
 */
export type CustomWidgetFactory = (
  node: LGraphNode,
  inputName: string,
  inputData: [string, Record<string, unknown>?],
  app: unknown
) => CustomWidget | undefined

const widgetTypes = new Set<string>()
const customWidgetFactories = new Map<string, CustomWidgetFactory>()

const BASIC_WIDGET_TYPES = ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]
for (const type of BASIC_WIDGET_TYPES) {
  widgetTypes.add(type)
}

export const widgetStore = {
  isWidgetType(type: string | string[]): boolean {
    const normalized = Array.isArray(type) ? "COMBO" : type.toUpperCase()
    return widgetTypes.has(normalized)
  },

  register(type: string): void {
    widgetTypes.add(type.toUpperCase())
  },

  registerMany(types: string[]): void {
    for (const type of types) {
      widgetTypes.add(type.toUpperCase())
    }
  },

  /** 커스텀 위젯 팩토리 등록 (확장의 getCustomWidgets 결과) */
  registerCustomWidgetFactory(
    type: string,
    factory: CustomWidgetFactory
  ): void {
    const key = type.toUpperCase()
    customWidgetFactories.set(key, factory)
    widgetTypes.add(key)
  },

  registerCustomWidgetFactories(
    factories: Record<string, CustomWidgetFactory>
  ): void {
    for (const [type, factory] of Object.entries(factories)) {
      this.registerCustomWidgetFactory(type, factory)
    }
  },

  getCustomWidgetFactory(type: string): CustomWidgetFactory | undefined {
    return customWidgetFactories.get(type.toUpperCase())
  },

  hasCustomWidgetFactory(type: string): boolean {
    return customWidgetFactories.has(type.toUpperCase())
  },
}
