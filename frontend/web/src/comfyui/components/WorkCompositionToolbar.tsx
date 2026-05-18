import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { EllipsisVertical, Play } from "lucide-react"

interface WorkCompositionToolbarProps {
  repeatCount: number
  setRepeatCount: (v: number | ((c: number) => number)) => void
  handleRun: () => void
  canRun: boolean
  estimatedRunCount: number | null
  onSelectionOpen: () => void
  hasActiveFilter: boolean
  onAxisFilterOpen: () => void
  onGraphOpen: () => void
  className?: string
}

export function WorkCompositionToolbar({
  repeatCount,
  setRepeatCount,
  handleRun,
  canRun,
  estimatedRunCount,
  onSelectionOpen,
  hasActiveFilter,
  onAxisFilterOpen,
  onGraphOpen,
  className,
}: WorkCompositionToolbarProps) {
  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
    
        
        
 
      <ButtonGroup>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-6 p-0 text-muted-foreground"
          >
          <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onSelectionOpen} disabled={!canRun}>
            선택 실행
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAxisFilterOpen}>
            축 필터
            {hasActiveFilter ? ` (${estimatedRunCount})` : ""}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onGraphOpen}>그래프 보기</DropdownMenuItem>
<DropdownMenuLabel>배치 수</DropdownMenuLabel>
<Input
          type="number"
         
          min={1}
          value={repeatCount}
          onChange={(e) =>
            setRepeatCount(Math.max(1, Number(e.target.value) || 1))
          }
        />

        </DropdownMenuContent>
      </DropdownMenu>
        <Button
        variant="default"
        size="sm"
        className="w-12"
        onClick={handleRun}
        disabled={!canRun}
      >
        <Play />
    
      </Button>
      </ButtonGroup>
    </div>
  )
}
