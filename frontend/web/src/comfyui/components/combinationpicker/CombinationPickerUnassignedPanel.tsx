import {
  AlertTriangleIcon,
  XIcon,
  FolderIcon,
  RefreshCwIcon,
  CheckSquareIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { SavedImage } from "../../types/Message"
import { LoadingButton } from "./CombinationPickerComponents"

interface UnassignedPanelProps {
  backendUrl: string
  unassignedGroupsSize: number
  unassignedTotalCount: number
  filteredUnassignedGroups: Map<string, SavedImage[]>
  templateAffiliationCache: Map<string, string[]>
  showTrueOrphansOnly: boolean
  setShowTrueOrphansOnly: (v: boolean) => void
  checkingTemplates: boolean
  checkTemplateAffiliation: () => void
  unassignedSelectedFilenames: Set<string>
  handleUnassignedToggleSelect: (filename: string) => void
  handleUnassignedSelectAll: () => void
  handleBulkTrash: () => void
  bulkTrashActionIsLoading: boolean
  bulkTrashActionMessage: string | null
  closeUnassignedPanel: () => void
}

export function CombinationPickerUnassignedPanel({
  backendUrl,
  unassignedGroupsSize,
  unassignedTotalCount,
  filteredUnassignedGroups,
  templateAffiliationCache,
  showTrueOrphansOnly,
  setShowTrueOrphansOnly,
  checkingTemplates,
  checkTemplateAffiliation,
  unassignedSelectedFilenames,
  handleUnassignedToggleSelect,
  handleUnassignedSelectAll,
  handleBulkTrash,
  bulkTrashActionIsLoading,
  bulkTrashActionMessage,
  closeUnassignedPanel,
}: UnassignedPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-400/60 bg-amber-50/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-bold text-amber-800">
            미할당 이미지: {unassignedGroupsSize}개 파일 ({unassignedTotalCount}
            장)
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LoadingButton
            variant="outline"
            size="sm"
            onClick={checkTemplateAffiliation}
            isLoading={checkingTemplates}
            icon={RefreshCwIcon}
            className="h-7 gap-1.5 text-[10px] font-bold"
          >
            템플릿 연결 확인
          </LoadingButton>
          <div className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              id="cp-true-orphans"
              checked={showTrueOrphansOnly}
              onCheckedChange={(v) => {
                setShowTrueOrphansOnly(v === true)
              }}
            />
            <Label
              htmlFor="cp-true-orphans"
              className="cursor-pointer text-[10px] font-bold text-muted-foreground"
            >
              ⚠ 완전 고아만 보기
            </Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-[10px] font-bold text-muted-foreground"
            onClick={closeUnassignedPanel}
          >
            <XIcon className="h-3.5 w-3.5" />
            닫기
          </Button>
        </div>
      </div>

      {/* 액션 바 */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] font-bold"
          onClick={handleUnassignedSelectAll}
        >
          {unassignedSelectedFilenames.size === filteredUnassignedGroups.size &&
          filteredUnassignedGroups.size > 0
            ? "전체 해제"
            : "전체 선택"}
        </Button>
        <LoadingButton
          size="sm"
          className="h-7 gap-1.5 bg-red-600 text-[10px] font-bold hover:bg-red-700"
          onClick={handleBulkTrash}
          isLoading={bulkTrashActionIsLoading}
          disabled={unassignedSelectedFilenames.size === 0}
          icon={Trash2Icon}
        >
          선택 항목 휴지통으로 ({unassignedSelectedFilenames.size}개)
        </LoadingButton>
        {bulkTrashActionMessage && (
          <span className="text-xs font-bold text-red-600">
            {bulkTrashActionMessage}
          </span>
        )}
      </div>

      {/* 미할당 이미지 그리드 */}
      <div className="max-h-96 overflow-y-auto">
        {filteredUnassignedGroups.size === 0 ? (
          <div className="py-8 text-center text-[11px] font-bold text-muted-foreground">
            {showTrueOrphansOnly
              ? "완전 고아 이미지가 없습니다. 모든 미할당 이미지가 다른 템플릿에 속해 있습니다."
              : "미할당 이미지가 없습니다."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from(filteredUnassignedGroups.entries()).map(
              ([filename, imgs]) => {
                const preview = imgs[0]
                const isSelected = unassignedSelectedFilenames.has(filename)
                const affiliations = templateAffiliationCache.get(filename)
                const isTrueOrphan = !affiliations || affiliations.length === 0

                return (
                  <button
                    key={filename}
                    onClick={() => handleUnassignedToggleSelect(filename)}
                    className={`group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                      isSelected
                        ? "bg-red-50/30 ring-2 ring-red-500"
                        : isTrueOrphan && templateAffiliationCache.size > 0
                          ? "border-red-300/60 bg-red-50/20 hover:border-red-400"
                          : "border-muted bg-card hover:border-amber-400/60"
                    }`}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                      {preview ? (
                        <img
                          src={`${backendUrl}/saved-images/${preview.hash}`}
                          className="h-full w-full object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <FolderIcon className="h-8 w-8 text-muted-foreground/20" />
                        </div>
                      )}
                      {/* 선택 체크 */}
                      <div className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded">
                        {isSelected ? (
                          <CheckSquareIcon className="h-5 w-5 text-red-500 drop-shadow-sm" />
                        ) : (
                          <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
                        )}
                      </div>
                      {/* 완전 고아 표시 */}
                      {isTrueOrphan && templateAffiliationCache.size > 0 && (
                        <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded bg-red-500 text-white shadow-sm">
                          <AlertTriangleIcon className="h-3 w-3" />
                        </div>
                      )}
                      <div className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                        {imgs.length}장
                      </div>
                    </div>

                    <div className="min-w-0 px-0.5">
                      <div className="truncate font-mono text-[10px] font-bold">
                        {filename}
                      </div>
                      {/* 템플릿 소속 정보 */}
                      {templateAffiliationCache.size > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {isTrueOrphan ? (
                            <span className="rounded bg-red-100 px-1 py-0.5 text-[8px] font-bold text-red-700">
                              완전 고아
                            </span>
                          ) : (
                            affiliations!.map((name, i) => (
                              <span
                                key={i}
                                className="rounded bg-green-100 px-1 py-0.5 text-[8px] font-bold text-green-700"
                              >
                                ✅ {name}
                              </span>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                )
              }
            )}
          </div>
        )}
      </div>
    </div>
  )
}
