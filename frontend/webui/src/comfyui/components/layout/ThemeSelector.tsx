import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ThemeName = "light" | "dark" | "system"

const THEME_OPTIONS = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: Monitor },
] as const satisfies readonly {
  value: ThemeName
  label: string
  icon: typeof Sun
}[]

function ThemeIcon({ theme }: { theme: string }): React.JSX.Element {
  if (theme === "light") return <Sun className="h-4 w-4" />
  if (theme === "dark") return <Moon className="h-4 w-4" />
  return <Monitor className="h-4 w-4" />
}

/** 테마 옵션과 현재 테마 아이콘을 같은 데이터 원본에서 관리한다. */
export function ThemeSelector(): React.JSX.Element {
  const { theme, setTheme } = useTheme()

  return (
    <div className="hidden items-center gap-1 md:flex">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <ThemeIcon theme={theme} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>테마 설정</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => {
                  setTheme(option.value)
                }}
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
