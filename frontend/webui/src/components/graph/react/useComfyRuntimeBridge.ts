import { useEffect, useState, type RefObject } from "react"
import type { ComfyNodeDef } from "@/comfyui/types/nodeDef"
import type { ComfyExtension } from "@/comfyui/types/extensionTypes"
import { ComfyAppService } from "@/comfyui/services/appService"
import { useReactGraphStore } from "@/comfyui/stores/reactGraphStore"
import { widgetStore, type WidgetValue } from "@/comfyui/stores/widgetStore"
import { isRootGraphId } from "@/comfyui/utils/workflowGraphModel"

interface UseComfyRuntimeBridgeOptions {
  hiddenCanvasRef: RefObject<HTMLCanvasElement | null>
  hiddenContainerRef: RefObject<HTMLDivElement | null>
  nodeDefs: Record<string, ComfyNodeDef>
}

function isRuntimeNodeLike(instance: unknown): instance is {
  type?: string
  mode?: number
  constructor: { name: string }
} {
  if (typeof instance !== "object" || instance === null) return false
  const record = instance as Record<PropertyKey, unknown>
  const constructorValue = record.constructor
  return typeof constructorValue === "function"
}

function shouldTreatAsLGraphNode(instance: unknown): boolean {
  if (!isRuntimeNodeLike(instance)) return false
  const constructorName = instance.constructor.name
  if (
    instance.type === "Fast Groups Muter (rgthree)" ||
    constructorName.includes("Muter")
  ) {
    return false
  }

  return constructorName.includes("Node") || typeof instance.mode === "number"
}

export function useComfyRuntimeBridge({
  hiddenCanvasRef,
  hiddenContainerRef,
  nodeDefs,
}: UseComfyRuntimeBridgeOptions): boolean {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function initApp(): Promise<void> {
      const rawApp = window.app
      console.log(
        "[CEG:DEBUG ReactGraphEditor] useEffect START, hiddenCanvas=" +
          String(!!hiddenCanvasRef.current),
        "hiddenContainer=" + String(!!hiddenContainerRef.current),
        "extensionsLoaded=" + String(rawApp.extensionsLoaded ?? false),
        "app.graph=" + String(true),
        "nodeDefs=" + String(Object.keys(nodeDefs).length),
        "extensions=" + String(rawApp.extensions.length)
      )

      if (!hiddenCanvasRef.current || !hiddenContainerRef.current) {
        console.log("[CEG:DEBUG ReactGraphEditor] SKIPPED: refs null")
        return
      }

      console.log(
        "[CEG:DEBUG ReactGraphEditor] Step 1: Creating ComfyAppService with nodeDefs count:",
        String(Object.keys(nodeDefs).length)
      )

      const appService = new ComfyAppService({
        canvas: hiddenCanvasRef.current,
        container: hiddenContainerRef.current,
        nodeDefs,
      })

      if (typeof window.LGraphNode === "function") {
        Object.defineProperty(window.LGraphNode, Symbol.hasInstance, {
          value(instance: unknown): boolean {
            return shouldTreatAsLGraphNode(instance)
          },
          configurable: true,
        })
      }

      rawApp.graph = appService.graph as unknown as LGraph
      rawApp.canvas = appService.canvas
      rawApp.extensionManager = appService.extensionManager
      rawApp.api = appService.api
      rawApp.syncGraphNode = (nodeId: number): void => {
        const liveNode = appService.graph.getNodeById(nodeId)
        if (liveNode === null) return
        const widgetsValues =
          (liveNode as { widgets?: { value: unknown }[] }).widgets?.map(
            (widget) => widget.value as WidgetValue
          ) ?? []


        useReactGraphStore.setState({
          nodes: useReactGraphStore
            .getState()
            .nodes.map((node) => {
              const ln = appService.graph.getNodeById(node.id)
              if (node.id === nodeId) {
                return {
                  ...node,
                  widgets_values: widgetsValues,
                  mode: ln ? ln.mode : node.mode,
                }
              }
              return ln ? { ...node, mode: ln.mode } : node
            }),
        })
      }
      ;(rawApp.graph as unknown as Record<string, unknown>)._canvas =
        appService.canvas
      appService.canvas.app = rawApp

      window.__comfyAppService = appService
      window.__useReactGraphStore = useReactGraphStore

      if (rawApp.extensionsLoaded !== true) {
        const apiClient: {
          getExtensions(): Promise<string[]>
          api_base: string
        } = window.api
        try {
          const extensionUrls = await apiClient.getExtensions()
          console.log(
            "[CEG:DEBUG ReactGraphEditor] Step 2a: Got extension URLs:",
            String(extensionUrls.length),
            extensionUrls
          )
          const fullUrls = extensionUrls.map((url) =>
            url.startsWith("http") ? url : `${apiClient.api_base}${url}`
          )
          console.log(
            "[CEG:DEBUG ReactGraphEditor] Importing extensions in parallel:",
            fullUrls.length
          )
          const importPromises = fullUrls.map((fullUrl) =>
            import(/* @vite-ignore */ fullUrl)
              .then(() => fullUrl)
              .catch((err: unknown) => {
                console.error(`Failed to load extension: ${fullUrl}`, err)
                return null
              })
          )
          for (const promise of importPromises) {
            const result = await promise
            if (result !== null) {
              console.log(
                "[CEG:DEBUG ReactGraphEditor] Import success:",
                result
              )
            }
          }
        } catch (err) {
          console.error("Failed to fetch extension list:", err)
        }
        rawApp.extensionsLoaded = true

        console.log(
          "[CEG:DEBUG ReactGraphEditor] Step 2b: Extensions registered:",
          String(rawApp.extensions.length),
          rawApp.extensions.map((extension) => extension.name)
        )

        for (const extension of rawApp.extensions) {
          if (extension.init !== undefined) {
            try {
              console.log(
                "[CEG:DEBUG ReactGraphEditor] Calling ext.init for:",
                extension.name
              )
              await extension.init(rawApp)
              ;(
                extension as ComfyExtension & { __cegInitDone?: boolean }
              ).__cegInitDone = true
            } catch (err) {
              console.error(`Extension init failed for ${extension.name}:`, err)
            }
          }
        }

        for (const extension of rawApp.extensions) {
          if (extension.addCustomNodeDefs !== undefined) {
            try {
              console.log(
                "[CEG:DEBUG ReactGraphEditor] Calling ext.addCustomNodeDefs for:",
                extension.name
              )
              await extension.addCustomNodeDefs(nodeDefs, rawApp)
            } catch (err) {
              console.error(
                `Extension addCustomNodeDefs failed for ${extension.name}:`,
                err
              )
            }
          }
        }

        console.log(
          "[CEG:DEBUG ReactGraphEditor] Step 2c: Re-registering node defs with extensions available"
        )
        appService.registerNodeDefs(nodeDefs)

        for (const extension of rawApp.extensions) {
          if (extension.getCustomWidgets !== undefined) {
            try {
              const customWidgets = await extension.getCustomWidgets(rawApp)
              if (customWidgets !== undefined && customWidgets !== null) {
                const factories = customWidgets
                const typeNames = Object.keys(factories)
                widgetStore.registerMany(typeNames)
                for (const [typeName, factory] of Object.entries(factories)) {
                  if (typeof factory === "function") {
                    widgetStore.registerCustomWidgetFactory(
                      typeName,
                      factory as Parameters<
                        typeof widgetStore.registerCustomWidgetFactory
                      >[1]
                    )
                    if (rawApp.widgets === undefined) {
                      ;(
                        rawApp as unknown as {
                          widgets: Record<string, unknown>
                        }
                      ).widgets = {}
                    }
                    ;(
                      rawApp as unknown as { widgets: Record<string, unknown> }
                    ).widgets[typeName] = factory
                  }
                }
                if (typeNames.length > 0) {
                  console.log(
                    "[CEG:DEBUG ReactGraphEditor] Registered custom widgets from",
                    extension.name,
                    typeNames
                  )
                }
              }
            } catch (err) {
              console.error(
                `Extension getCustomWidgets failed for ${extension.name}:`,
                err
              )
            }
          }
        }

        for (const extension of rawApp.extensions) {
          if (extension.registerCustomNodes !== undefined) {
            try {
              console.log(
                "[CEG:DEBUG ReactGraphEditor] Calling ext.registerCustomNodes for:",
                extension.name
              )
              await extension.registerCustomNodes(rawApp)
            } catch (err) {
              console.error(
                `Extension registerCustomNodes failed for ${extension.name}:`,
                err
              )
            }
          }
        }
      }

      for (const extension of rawApp.extensions) {
        const extensionState = extension as ComfyExtension & {
          __cegInitDone?: boolean
        }
        if (extension.init === undefined) continue
        if (extensionState.__cegInitDone === true) continue
        try {
          console.log(
            "[CEG:DEBUG ReactGraphEditor] Ensuring ext.init for:",
            extension.name
          )
          await extension.init(rawApp)
          extensionState.__cegInitDone = true
        } catch (err) {
          console.error(`Extension init failed for ${extension.name}:`, err)
        }
      }

      if (cancelled) return

      for (const extension of rawApp.extensions) {
        if (extension.setup !== undefined) {
          try {
            console.log(
              "[CEG:DEBUG ReactGraphEditor] Calling ext.setup for:",
              extension.name
            )
            await extension.setup(rawApp)
          } catch (err) {
            console.error(`Extension setup failed for ${extension.name}:`, err)
          }
        }
      }

      const state = useReactGraphStore.getState()
      console.log(
        "[CEG:DEBUG ReactGraphEditor] Step 3: Syncing initial state, nodes in store:",
        String(state.nodes.length)
      )
      if (state.nodes.length > 0) {
        const workflow = {
          last_node_id: Math.max(0, ...state.nodes.map((node) => node.id)),
          last_link_id: Math.max(0, ...state.links.map((link) => link.id)),
          nodes: state.nodes,
          links: state.links,
          groups: state.groups.filter((group) => isRootGraphId(group.graphId)),
          version: 0.4,
        }
        console.log(
          "[CEG:DEBUG ReactGraphEditor] Calling loadGraphData with",
          String(workflow.nodes.length),
          "nodes"
        )
        appService.loadGraphData(workflow)
        console.log(
          "[CEG:DEBUG ReactGraphEditor] loadGraphData complete, graph now has",
          String(
            (appService.graph as unknown as { nodes: unknown[] }).nodes.length
          ),
          "nodes"
        )
      }

      setIsReady(true)
    }

    void initApp()

    return (): void => {
      cancelled = true
    }
  }, [hiddenCanvasRef, hiddenContainerRef, nodeDefs])

  return isReady
}
