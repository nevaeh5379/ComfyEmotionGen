import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Keyboard, Globe, Image, Sparkles } from "lucide-react"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] border-line/60 bg-panel/95 p-4 shadow-2xl backdrop-blur-md sm:w-full sm:max-w-2xl sm:p-6 dark:bg-panel/90">
        <DialogHeader className="border-b border-line/40 pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-black tracking-tight text-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Keyboard className="h-5 w-5" />
            </div>
            키보드 단축키 안내
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="global" className="mt-4 w-full">
          <TabsList className="no-scrollbar flex w-full items-center justify-start overflow-x-auto rounded-lg border border-line/30 bg-muted/40 p-0.5">
            <TabsTrigger
              value="global"
              className="flex flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 px-3 py-1.5 font-bold whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" />
              전역 단축키
            </TabsTrigger>
            <TabsTrigger
              value="gallery"
              className="flex flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 px-3 py-1.5 font-bold whitespace-nowrap"
            >
              <Image className="h-3.5 w-3.5" />
              갤러리 단축키
            </TabsTrigger>
            <TabsTrigger
              value="curation"
              className="flex flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 px-3 py-1.5 font-bold whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              큐레이션 단축키
            </TabsTrigger>
          </TabsList>

          {/* ────────────────── 1. GLOBAL SHORTCUTS ────────────────── */}
          <TabsContent
            value="global"
            className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1"
          >
            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  내비게이션 및 기본 조작
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["?"]}
                  description="단축키 안내 패널 열기 / 닫기"
                  subDescription="어디서나 단축키 패널을 토글합니다."
                />
                <ShortcutRow
                  keys={["Alt", "1..5"]}
                  alternativeKeys={["Ctrl", "Shift", "1..5"]}
                  description="메인 탭 이동"
                  subDescription={
                    "1:\u00a0작업, 2:\u00a0통계, 3:\u00a0갤러리, 4:\u00a0큐레이션, 5:\u00a0설정"
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  작업 및 관리 (작업 탭 전용)
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["Ctrl", "Enter"]}
                  alternativeKeys={["Cmd", "Enter"]}
                  description="큐 생성 및 작업 실행"
                  subDescription="작업 구성 템플릿에 맞추어 생성을 시작합니다."
                />
                <ShortcutRow
                  keys={["Ctrl", "S"]}
                  alternativeKeys={["Cmd", "S"]}
                  description="에디터 빠른 저장"
                  subDescription="현재 작성 중인 템플릿 또는 워크플로우를 저장합니다."
                />
              </div>
            </div>

            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  갤러리 액션
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["Ctrl", "Shift", "R"]}
                  alternativeKeys={["Cmd", "Shift", "R"]}
                  description="갤러리 목록 새로고침"
                  subDescription="갤러리 탭 전용: 이미지 목록을 동기화합니다."
                />
              </div>
            </div>
          </TabsContent>

          {/* ────────────────── 2. GALLERY SHORTCUTS ────────────────── */}
          <TabsContent
            value="gallery"
            className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1"
          >
            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  이미지 탐색 및 선택 (그리드 / 비교 모드)
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["←"]}
                  alternativeKeys={["h"]}
                  description="이전 이미지 포커스"
                  subDescription="갤러리 내에서 포커스를 왼쪽으로 이동합니다."
                />
                <ShortcutRow
                  keys={["→"]}
                  alternativeKeys={["l"]}
                  description="다음 이미지 포커스"
                  subDescription="갤러리 내에서 포커스를 오른쪽으로 이동합니다."
                />
                <ShortcutRow
                  keys={["↑"]}
                  alternativeKeys={["k"]}
                  description="위쪽 이미지 포커스"
                  subDescription="포커스를 위쪽 행의 이미지로 이동합니다."
                />
                <ShortcutRow
                  keys={["↓"]}
                  alternativeKeys={["j"]}
                  description="아래쪽 이미지 포커스"
                  subDescription="포커스를 아래쪽 행의 이미지로 이동합니다."
                />
                <ShortcutRow
                  keys={["Esc"]}
                  description="포커스 초기화"
                  subDescription="이미지 선택을 해제하고 탐색 포커스를 끕니다."
                />
              </div>
            </div>

            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  이미지 액션 & 큐레이션
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["Enter"]}
                  alternativeKeys={["Space"]}
                  description="상세 보기 / 선택 토글"
                  subDescription="일반 모드에서는 상세 보기, 다중 선택 모드에서는 선택 토글합니다."
                />
                <ShortcutRow
                  keys={["1"]}
                  description="이미지 통과 (Approved)"
                  subDescription="포커스된 이미지의 상태를 '통과'로 변경합니다."
                />
                <ShortcutRow
                  keys={["2"]}
                  description="이미지 탈락 (Rejected)"
                  subDescription="포커스된 이미지의 상태를 '탈락'으로 변경합니다."
                />
                <ShortcutRow
                  keys={["3"]}
                  description="휴지통 이동 / 복원"
                  subDescription="이미지를 휴지통으로 버리거나 대기 상태로 복원합니다."
                />
                <ShortcutRow
                  keys={["p"]}
                  description="비교 목록 고정 (Pin)"
                  subDescription="포커스된 이미지를 비교 핀 목록에 추가하거나 제거합니다."
                />
              </div>
            </div>

            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  상세 뷰어 내부
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["Esc"]}
                  description="이미지 상세 뷰어 닫기"
                  subDescription="전체화면 디테일 뷰어를 닫고 그리드로 복귀합니다."
                />
              </div>
            </div>
          </TabsContent>

          {/* ────────────────── 3. CURATION SHORTCUTS ────────────────── */}
          <TabsContent
            value="curation"
            className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1"
          >
            <div className="rounded-xl border border-line/20 bg-background/25 p-1.5">
              <div className="px-3 py-2">
                <h3 className="text-xs font-black tracking-wider text-muted-foreground/75 uppercase">
                  조합 탐색 및 설정 (조합 상세 뷰 전용)
                </h3>
              </div>
              <div className="grid">
                <ShortcutRow
                  keys={["↓"]}
                  alternativeKeys={["j"]}
                  description="다음 조합 이동"
                  subDescription="상세 뷰에서 다음 렌더링 조합 항목으로 이동합니다."
                />
                <ShortcutRow
                  keys={["↑"]}
                  alternativeKeys={["k"]}
                  description="이전 조합 이동"
                  subDescription="상세 뷰에서 이전 렌더링 조합 항목으로 이동합니다."
                />
                <ShortcutRow
                  keys={["1..9"]}
                  description="후보 이미지 승인"
                  subDescription="해당 인덱스 번호의 후보 이미지를 승인(대표 지정) 처리합니다."
                />
                <ShortcutRow
                  keys={["r"]}
                  alternativeKeys={["R"]}
                  description="조합 이미지 재생성"
                  subDescription="현재 조합 조건에 맞추어 생성을 추가 요청합니다."
                />
                <ShortcutRow
                  keys={["Esc"]}
                  description="조합 목록으로 돌아가기"
                  subDescription="상세 보기 창을 닫고 전체 조합 그리드 뷰로 돌아갑니다."
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-5 flex flex-col justify-between gap-2 border-t border-line/40 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>
            * 입력 포커스가 검색 창이나 텍스트 박스에 있을 때는 단축키가
            작동하지 않습니다.
          </span>
          <div className="flex shrink-0 items-center justify-start gap-1.5 sm:justify-end">
            <span>닫기</span>
            <Kbd className="bg-muted px-2 py-0.5">Esc</Kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ShortcutRowProps {
  keys: string[]
  alternativeKeys?: string[]
  description: string
  subDescription?: string
}

function ShortcutRow({
  keys,
  alternativeKeys,
  description,
  subDescription,
}: ShortcutRowProps) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border-b border-line/10 px-4 py-3 text-sm transition-all duration-150 last:border-b-0 hover:bg-muted/15 sm:flex-row sm:items-center">
      {/* Left Column: Description & SubDescription */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-4">
        <span className="leading-normal font-semibold break-keep text-foreground/90 dark:text-foreground/95">
          {description}
        </span>
        {subDescription && (
          <span className="text-[11.5px] leading-relaxed font-medium break-keep text-muted-foreground/80">
            {subDescription}
          </span>
        )}
      </div>

      {/* Right Column: Key combinations laid out horizontally, wrapping cleanly as full blocks */}
      <div className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 text-left sm:justify-end sm:gap-2 sm:text-right">
        {/* Primary combination */}
        <div className="flex shrink-0 items-center gap-1">
          {keys.map((k, i) => (
            <span key={i} className="flex shrink-0 items-center gap-1">
              {i > 0 && (
                <span className="shrink-0 text-[10px] font-black text-muted-foreground/50">
                  +
                </span>
              )}
              <Kbd className="h-6 shrink-0 border-line/60 bg-muted/95 px-1.5 py-0.5 font-mono font-black shadow-xs select-none">
                {k}
              </Kbd>
            </span>
          ))}
        </div>

        {/* Alternative combination */}
        {alternativeKeys && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="px-0.5 text-[10.5px] font-bold whitespace-nowrap text-muted-foreground/45 select-none">
              또는
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {alternativeKeys.map((k, i) => (
                <span key={i} className="flex shrink-0 items-center gap-1">
                  {i > 0 && (
                    <span className="shrink-0 text-[10px] font-black text-muted-foreground/50">
                      +
                    </span>
                  )}
                  <Kbd className="h-6 shrink-0 border-line/45 bg-muted/60 px-1.5 py-0.5 font-mono font-bold text-muted-foreground select-none">
                    {k}
                  </Kbd>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
