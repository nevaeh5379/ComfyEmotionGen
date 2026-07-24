import { useMemo } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useGalleryToolbar } from "../../contexts/GalleryToolbarContext"
import { TagInputSearch } from "../TagInputSearch"

interface GalleryFiltersProps {
  active: boolean
}

/**
 * 갤러리 검색 조건의 표시와 편집만 담당한다.
 *
 * `@`, `#`, `$` 접두사는 각각 파일명, 태그, 메타데이터 검색을 뜻한다.
 * 후보 필터링을 렌더 JSX 밖에서 계산해 입력 규칙을 한곳에서 확인할 수 있게
 * 한다.
 */
export function GalleryFilters({
  active,
}: GalleryFiltersProps): React.JSX.Element | null {
  const toolbar = useGalleryToolbar()
  const filteredCandidates = useMemo(() => {
    const query = toolbar.searchInput.replace(/^[@#$]/, "").toLowerCase()
    return toolbar.candidates.filter((candidate) =>
      candidate.value.toLowerCase().includes(query)
    )
  }, [toolbar.candidates, toolbar.searchInput])

  if (!active || !toolbar.showFilters) return null

  return (
    <div className="border-t border-line/60 bg-panel/80 px-3 py-2 md:px-4 md:py-2.5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <span className="shrink-0 text-[11px] font-bold text-muted-foreground uppercase">
            검색
          </span>
          <div className="max-w-lg flex-1">
            <TagInputSearch
              value={toolbar.searchInput}
              tags={toolbar.searchTags}
              candidates={filteredCandidates}
              placeholder="검색어 입력 (@파일명, #태그, $메타데이터)"
              onValueChange={toolbar.setSearchInput}
              onAddTag={(tag) => {
                if (!toolbar.searchTags.includes(tag)) {
                  toolbar.setSearchTags([...toolbar.searchTags, tag])
                }
                toolbar.setSearchInput("")
              }}
              onRemoveTag={(tag) => {
                toolbar.setSearchTags(
                  toolbar.searchTags.filter((current) => current !== tag)
                )
              }}
              size="sm"
            />
          </div>
        </div>

        <div className="hidden h-4 w-px shrink-0 bg-line md:block" />

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line/40 pt-2 md:border-0 md:pt-0">
          <div className="flex cursor-pointer items-center gap-2">
            <Checkbox
              id="gallery-hide-rejected"
              checked={toolbar.hideRejected}
              onCheckedChange={(value) => {
                toolbar.setHideRejected(value === true)
              }}
            />
            <Label
              htmlFor="gallery-hide-rejected"
              className="cursor-pointer text-[11px] font-bold text-muted-foreground"
            >
              리젝 숨기기
            </Label>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px] font-bold text-muted-foreground"
            onClick={toolbar.clearAllFilters}
          >
            <XIcon className="mr-1 h-3 w-3" />
            필터 초기화
          </Button>
        </div>
      </div>
    </div>
  )
}
