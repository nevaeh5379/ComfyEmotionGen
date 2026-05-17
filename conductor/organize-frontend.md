# Frontend Source Code Organization Plan

## Objective
`frontend/web/src/comfyui` 폴더 내에 혼재되어 있는 파일들을 역할별(Type-based) 디렉토리 구조(components, hooks, contexts, types, utils)로 재배치하고, 변경된 경로에 맞게 모든 import 문을 업데이트합니다.

## Key Files & Context
- 대상 디렉토리: `frontend/web/src/comfyui/`
- 영향을 받는 파일: `frontend/web/src/App.tsx` 및 `comfyui` 폴더 내의 모든 소스코드 파일

## Implementation Steps

1. **디렉토리 생성 및 구조화**
   - `frontend/web/src/comfyui/components/`
   - `frontend/web/src/comfyui/types/`
   - `frontend/web/src/comfyui/utils/`
   - (이미 존재하는 `hooks/`, `contexts/` 폴더 활용)

2. **파일 이동**
   - **Components (`components/`)**:
     - `AxisFilterSheet.tsx`, `CegTemplatePanel.tsx`, `CombinationPicker.tsx`, `CombinationPickerComponents.tsx`, `ImageViewer.tsx`, `JobManagerPanel.tsx`, `JobStatusPopup.tsx`, `NameConflictDialog.tsx`, `NodeMappingSection.tsx`, `ParserPreviewDialog.tsx`, `PresetSelectionDialog.tsx`, `PreviewTable.tsx`, `SavedImagesGallery.tsx`, `SavedItemsManager.tsx`, `SelectionSheet.tsx`, `SettingsPanel.tsx`, `StatusIndicators.tsx`, `WorkCompositionPanel.tsx`, `WorkerManager.tsx`, `WorkflowGraphViewer.tsx`
   - **Hooks (`hooks/`)**:
     - `useBackend.ts`, `useJobRunner.ts`, `useLocalStorage.ts`, `useSavedImages.ts`, `useSavedTemplates.ts`, `useSavedWorkflows.ts`, `useSettings.ts`
   - **Contexts & Providers (`contexts/`)**:
     - `BackendContext.ts`, `WebSocketProvider.tsx`
   - **Types (`types/`)**:
     - `Message.ts`, `renderTypes.ts`
   - **Utils (`utils/`)**:
     - `workflowGraphCategories.ts`, `workflowGraphLayout.ts`

3. **Import 경로 업데이트**
   - 파일 이동으로 인해 깨지는 내부 참조 및 `App.tsx` 등 외부 참조를 일괄 수정합니다.
   - 유지보수를 용이하게 하기 위해 가능한 경우 `@/comfyui/...` 형태의 절대 경로 별칭(Alias)을 활용하거나 올바른 상대 경로로 수정합니다.

## Verification & Testing
1. `npm run typecheck` 명령어를 통해 타입/import 오류가 없는지 확인합니다.
2. `npm run lint`로 구문 오류를 점검합니다.
3. `npm run build`가 성공적으로 수행되는지 검증합니다.