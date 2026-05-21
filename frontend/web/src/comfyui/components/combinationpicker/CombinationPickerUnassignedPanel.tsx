import { useState } from "react"
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
import { LoadingButton } from "./CombinationPickerComponents"
import { useCurationContext } from "./CurationContext"
import type { SavedImage } from "../../types/Message"

interface UnassignedPanelProps {
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

function UnassignedGridItem({
  filename,
  imgs,
  backendUrl,
  isSelected,
  isTrueOrphan,
  templateAffiliationCache,
  affiliations,
  handleUnassignedToggleSelect,
}: {
  filename: string
  imgs: SavedImage[]
  backendUrl: string
  isSelected: boolean
  isTrueOrphan: boolean
  templateAffiliationCache: Map<string, string[]>
  affiliations: string[] | undefined
  handleUnassignedToggleSelect: (filename: string) => void
}) {
  const preview = imgs[0]
  const [aspect, setAspect] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  return (
    <button
      onClick={() => handleUnassignedToggleSelect(filename)}
      className={`group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
        isSelected
          ? "bg-red-50/30 ring-2 ring-red-500"
          : isTrueOrphan && templateAffiliationCache.size > 0
            ? "border-red-300/60 bg-red-50/20 hover:border-red-400"
            : "border-muted bg-card hover:border-amber-400/60"
      }`}
    >
      <div
        className="relative overflow-hidden rounded-md bg-muted w-full"
        style={{ aspectRatio: aspect ?? 1 }}
      >
        {preview ? (
          <>
            {loading && (
              <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
                <FolderIcon className="h-6 w-6 text-muted-foreground/15" />
              </div>
            )}
            <img
              src={`${backendUrl}/saved-images/${preview.hash}`}
              className={`w-full h-full object-cover transition-all duration-300 ${
                loading ? "opacity-0" : "opacity-100"
              }`}
              alt=""
              onLoad={(e) => {
                setLoading(false)
                const img = e.currentTarget
                if (img.naturalWidth && img.naturalHeight) {
                  setAspect(img.naturalWidth / img.naturalHeight)
                }
              }}
              loading="lazy"
            />
          </>
        ) : (
          <div className="flex aspect-square h-full w-full items-center justify-center">
            <FolderIcon className="h-8 w-8 text-muted-foreground/20" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded">
          {isSelected ? (
            <CheckSquareIcon className="h-5 w-5 text-red-500 drop-shadow-sm" />
          ) : (
            <SquareIcon className="h-5 w-5 text-white/60 drop-shadow-sm" />
          )}
        </div>
        {isTrueOrphan && templateAffiliationCache.size > 0 && (
          <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded bg-red-500 text-white shadow-sm">
            <AlertTriangleIcon className="h-3 w-3" />
          </div>
        )}
        <div className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
          {imgs.length}장
        </div>
      </div>

      <div className="min-w-0 px-0.5 w-full">
        <div className="truncate font-mono text-[10px] font-bold">
          {filename}
        </div>
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

export function CombinationPickerUnassignedPanel({
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
  const { backendUrl, data } = useCurationContext()
  const { unassignedGroups, unassignedTotalCount } = data

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-400/60 bg-amber-50/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-bold text-amber-800">
            미할당 이미지: {unassignedGroups.size}개 파일 ({unassignedTotalCount}
            장)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="showTrueOrphansOnly"
              checked={showTrueOrphansOnly}
              onCheckedChange={(checked) =>
                setShowTrueOrphansOnly(!!checked)
              }
            />
            <Label
              htmlFor="showTrueOrphansOnly"
              className="cursor-pointer text-xs font-bold text-amber-800"
            >
              완전 고아(소속 없음)만 보기
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkTemplateAffiliation}
            disabled={checkingTemplates}
            className="border-amber-300 text-amber-900 bg-amber-100/50 hover:bg-amber-100 hover:text-amber-950 font-bold h-7 text-[10px]"
          >
            <RefreshCwIcon
              className={`mr-1 h-3.5 w-3.5 ${
                checkingTemplates ? "animate-spin" : ""
              }`}
            />
            템플릿 소속 확인
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnassignedSelectAll}
            className="text-amber-900 hover:bg-amber-100 font-bold h-7 text-[10px]"
          >
            전체 선택/해제
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LoadingButton
            variant="destructive"
            size="sm"
            onClick={handleBulkTrash}
            isLoading={bulkTrashActionIsLoading}
            disabled={unassignedSelectedFilenames.size === 0}
            icon={Trash2Icon}
            className="h-7 text-[10px] font-bold"
          >
            선택 항목 휴지통으로 ({unassignedSelectedFilenames.size}개)
          </LoadingButton>
          {bulkTrashActionMessage && (
            <span className="text-xs font-bold text-red-600">
              {bulkTrashActionMessage}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={closeUnassignedPanel}
            className="h-7 gap-1 text-[10px] font-bold text-muted-foreground"
          >
            <XIcon className="h-3.5 w-3.5" />
            닫기
          </Button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {filteredUnassignedGroups.size === 0 ? (
          <div className="py-8 text-center text-[11px] font-bold text-muted-foreground">
            {showTrueOrphansOnly
              ? "완전 고아 이미지가 없습니다. 모든 미할당 이미지가 다른 템플릿에 속해 있습니다."
              : "미할당 이미지가 없습니다."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 items-start sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from(filteredUnassignedGroups.entries()).map(
              ([filename, imgs]) => {
                const isSelected = unassignedSelectedFilenames.has(filename)
                const affiliations = templateAffiliationCache.get(filename)
                const isTrueOrphan = !affiliations || affiliations.length === 0

                return (
                  <UnassignedGridItem
                    key={filename}
                    filename={filename}
                    imgs={imgs}
                    backendUrl={backendUrl}
                    isSelected={isSelected}
                    isTrueOrphan={isTrueOrphan}
                    templateAffiliationCache={templateAffiliationCache}
                    affiliations={affiliations}
                    handleUnassignedToggleSelect={handleUnassignedToggleSelect}
                  />
                )
              }
            )}
          </div>
        )}
      </div>
    </div>
  )
}
