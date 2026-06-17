import { SavedImagesGallery } from "../SavedImagesGallery"
import type { GalleryToolbarValue } from "../../contexts/GalleryToolbarContext"
import type { AppSettings } from "../../hooks/useSettings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryTabProps {
  backendUrl: string
  enableHover: AppSettings["enableHover"]
  imagePageSize: AppSettings["imagePageSize"]
  imageLazyLoad: AppSettings["imageLazyLoad"]
  singleDownloadMode: AppSettings["singleDownloadMode"]
  fluidGridLayout: AppSettings["fluidGridLayout"]
  tb: GalleryToolbarValue
}

// ---------------------------------------------------------------------------
// GalleryTab
// ---------------------------------------------------------------------------

export function GalleryTab({
  backendUrl,
  enableHover,
  imagePageSize,
  imageLazyLoad,
  singleDownloadMode,
  fluidGridLayout,
  tb,
}: GalleryTabProps) {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <SavedImagesGallery
        backendUrl={backendUrl}
        enableHover={enableHover}
        imagePageSize={imagePageSize}
        imageLazyLoad={imageLazyLoad}
        singleDownloadMode={singleDownloadMode}
        filenameFilter={tb.filenameFilter}
        tagFilter={tb.tagFilter}
        metadataFilter={tb.metadataFilter}
        generalFilters={tb.generalFilters}
        onTokensExtracted={tb.setCandidates}
        onReloadReady={(reload) => {
          tb.registerReload(reload)
        }}
        toolbarState={tb}
        fluidGridLayout={fluidGridLayout}
      />
    </div>
  )
}