import { forwardRef } from "react"
import { FilterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCurationToolbar } from "../combinationpicker/useCurationToolbar"
import { CurationGroupSelect } from "./CurationGroupSelect"

interface CurationHeaderControlsProps {
  active: boolean
}

/** 큐레이션의 모바일·데스크톱 진입점을 같은 toolbar 상태에 연결한다. */
export const CurationHeaderControls = forwardRef<
  HTMLDivElement,
  CurationHeaderControlsProps
>(function CurationHeaderControls({ active }, ref) {
  const toolbar = useCurationToolbar()
  if (!active) return null

  return (
    <>
      <div ref={ref} className="hidden items-center gap-1.5 md:flex">
        <div className="hidden h-4 w-px shrink-0 bg-line/60 md:block" />
        <CurationGroupSelect toolbar={toolbar} />
      </div>
      <div className="flex items-center gap-1 md:hidden">
        <CurationGroupSelect toolbar={toolbar} compact />
        <Button
          size="sm"
          variant={toolbar.filtersExpanded ? "secondary" : "outline"}
          className="!h-7 !w-7 shrink-0 p-0"
          onClick={() => {
            toolbar.setFiltersExpanded(!toolbar.filtersExpanded)
          }}
        >
          <FilterIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  )
})
