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
import { EllipsisVertical, Play, Shuffle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface WorkCompositionToolbarProps {
  repeatCount: number
  setRepeatCount: (v: number | ((c: number) => number)) => void
  handleRun: () => void
  handleRandomRun: (count: number) => void
  handleRunUnapproved: () => void
  randomRunCount: number
  setRandomRunCount: (v: number | ((c: number) => number)) => void
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
  handleRandomRun,
  handleRunUnapproved,
  randomRunCount,
  setRandomRunCount,
  canRun,
  estimatedRunCount,
  onSelectionOpen,
  hasActiveFilter,
  onAxisFilterOpen,
  onGraphOpen,
  className,
}: WorkCompositionToolbarProps) {
  return (
    <div className={` ${className || ""}`}>
      <ButtonGroup>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-6 p-0 text-muted-foreground"
                >
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>실행 옵션 더보기</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSelectionOpen} disabled={!canRun}>
              선택 실행
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRunUnapproved} disabled={!canRun}>
              전체 미완료 실행
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleRandomRun(randomRunCount)}
              disabled={!canRun}
            >
              <Shuffle className="mr-2 h-4 w-4" /> 랜덤 실행
            </DropdownMenuItem>
            <DropdownMenuLabel>랜덤 개수</DropdownMenuLabel>
            <Input
              type="number"
              min={1}
              value={randomRunCount}
              onChange={(e) =>
                setRandomRunCount(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAxisFilterOpen}>
              축 필터
              {hasActiveFilter ? ` (${estimatedRunCount})` : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onGraphOpen}>
              그래프 보기
            </DropdownMenuItem>
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
        <Button variant="outline" onClick={handleRun} disabled={!canRun}>
          <Play /> <p>실행</p>
        </Button>
      </ButtonGroup>
    </div>
  )
}
