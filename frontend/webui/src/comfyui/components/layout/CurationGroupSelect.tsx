import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CurationToolbarValue } from "../combinationpicker/CurationToolbarTypes"
import {
  FREE_GROUP_LABELS,
  type FreeGroupBy,
} from "../combinationpicker/freeCurationGroupers"

interface CurationGroupSelectProps {
  toolbar: CurationToolbarValue
  compact?: boolean
}

const FREE_GROUP_MENU_LABELS: Record<FreeGroupBy, string> = {
  ...FREE_GROUP_LABELS,
  filename: "파일명 기준 (전체)",
  parsedFilename: "파일명 패턴 파싱 (전체)",
  tags: "태그별 분류 (전체)",
  savedTemplate: "템플릿 해시별 (전체)",
}

/**
 * 큐레이션 그룹 선택 목록의 단일 구현이다.
 *
 * 헤더의 모바일/데스크톱 레이아웃은 트리거 크기만 다르고 선택 가능한
 * 항목과 값 규칙은 같아야 한다. 목록을 이 컴포넌트에 모아 두 화면의
 * 옵션이 서로 어긋나는 것을 방지한다.
 */
export function CurationGroupSelect({
  toolbar,
  compact = false,
}: CurationGroupSelectProps): React.JSX.Element {
  const itemClassName = compact
    ? "text-[11px] font-bold"
    : "text-[12px] font-bold"

  return (
    <Select
      value={toolbar.activeGroupId}
      onValueChange={toolbar.selectCurationGroup}
    >
      <SelectTrigger
        className={
          compact
            ? "!h-7 w-[120px] border-line bg-background px-1.5 !py-1 text-[10px] font-bold shadow-none focus:ring-0"
            : "hidden !h-7 w-[150px] border-line bg-background px-1.5 !py-1 text-[11px] font-bold shadow-none focus:ring-0 sm:w-[200px] md:inline-flex"
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-[10px] text-muted-foreground">
            기본 분류
          </SelectLabel>
          <SelectItem
            value="preset:template:__current__"
            className={itemClassName}
          >
            현재 템플릿 축 조합 (전체)
          </SelectItem>
          {toolbar.savedTemplates.map((template) => (
            <SelectItem
              key={template.id}
              value={`preset:template:${template.id}`}
              className={itemClassName}
            >
              {template.name} (축 조합)
            </SelectItem>
          ))}
          {(Object.keys(FREE_GROUP_MENU_LABELS) as FreeGroupBy[]).map(
            (mode) => (
              <SelectItem
                key={mode}
                value={`preset:free:${mode}`}
                className={itemClassName}
              >
                {FREE_GROUP_MENU_LABELS[mode]}
              </SelectItem>
            )
          )}
        </SelectGroup>
        {toolbar.savedGroups.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-[10px] text-muted-foreground">
                저장된 큐레이션 그룹
              </SelectLabel>
              {toolbar.savedGroups.map((group) => (
                <SelectItem
                  key={group.id}
                  value={group.id}
                  className={itemClassName}
                >
                  {group.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
        {toolbar.activeGroupId === "custom" && (
          <>
            <SelectSeparator />
            <SelectItem
              value="custom"
              disabled
              className={`${itemClassName} italic`}
            >
              (수정됨)
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
