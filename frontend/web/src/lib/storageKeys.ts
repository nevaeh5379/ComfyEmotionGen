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
  savedTemplates: "savedTemplates",
  sessions: "ceg_sessions",
  activeState: "ceg_active_state",
  cegTemplate: "cegTemplate",
  activeTemplateId: "activeTemplateId",
  curationSelectedAxis: "comfy.curation.selectedAxis",
} as const
