/**
 * localStorage 키 이름 중앙 집중화.
 */

export const STORAGE_KEYS = {
  backendUrl: "backendUrl",
  theme: "theme",
  nodeMappings: "nodeMappings",
  activeNodeMappingPresetId: "activeNodeMappingPresetId",
  workflow: "workflow",
  activeWorkflowId: "activeWorkflowId",
  appSettings: "appSettings",
  savedWorkflows: "savedWorkflows",
  editorWorkflows: "editorWorkflows",
  savedTemplates: "savedTemplates",
  sessions: "ceg_sessions",
  activeState: "ceg_active_state",
  cegTemplate: "cegTemplate",
  activeTemplateId: "activeTemplateId",
  curationSelectedAxis: "comfy.curation.selectedAxis",
  curationThumbnailSize: "comfy.curation.thumbnailSize",
  galleryThumbnailSize: "comfy.gallery.thumbnailSize",
  activeTab: "ceg_activeTab",
  regenCount: "ceg_regenCount",
  regenTemplateId: "ceg_regenTemplateId",
  regenWorkflowId: "ceg_regenWorkflowId",
  regenNodeMappings: "ceg_regenNodeMappings",
  curationSelectedFilename: "comfy.curation.selectedFilename",
  curationViewMode: "comfy.curation.viewMode",
  curationListLayout: "comfy.curation.listLayout",
  curationGridSubMode: "comfy.curation.gridSubMode",
} as const

