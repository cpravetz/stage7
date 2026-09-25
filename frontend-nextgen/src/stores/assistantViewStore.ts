import { create } from 'zustand';

export type TabKey = 'overview' | 'tools' | 'configuration' | 'memory' | 'missions' | 'hitl' | 'artifacts';

export type LastRunStatus = 'running' | 'completed' | 'failed' | null;

export interface AssistantViewModel {
  activeTab: TabKey;
  missionInput: string;
  runInputs: Record<string, Record<string, unknown>>;
  runResults: Record<string, string>;
  runningMap: Record<string, boolean>;
  runToolName: string | null;
  runResult: string | null;
  runningTool: boolean;
  selectedToolForPreviewName: string | null;
  previewInputs: Record<string, unknown>;
  workspaceId: string | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  savingDraft: boolean;
  startingFresh: boolean;
  approving: boolean;
  useResultBusy: boolean;
  lastRunToolName: string | null;
  lastRunStatus: LastRunStatus;
}

interface AssistantViewState {
  currentAssistantId: string | null;
  assistantViews: Record<string, AssistantViewModel>;
  getOrCreate: (assistantId: string) => AssistantViewModel;
  setField: <Field extends keyof AssistantViewModel>(
    assistantId: string,
    field: Field,
    value: AssistantViewModel[Field],
  ) => void;
  setModel: (assistantId: string, model: Partial<AssistantViewModel>) => void;
  resetModel: (assistantId: string) => void;
  setCurrent: (assistantId: string) => void;
}

const createDefaultAssistantViewModel = (): AssistantViewModel => ({
  activeTab: 'overview',
  missionInput: '',
  runInputs: {},
  runResults: {},
  runningMap: {},
  runToolName: null,
  runResult: null,
  runningTool: false,
  selectedToolForPreviewName: null,
  previewInputs: {},
  workspaceId: null,
  workspaceLoading: false,
  workspaceError: null,
  savingDraft: false,
  startingFresh: false,
  approving: false,
  useResultBusy: false,
  lastRunToolName: null,
  lastRunStatus: null,
});

export const useAssistantViewStore = create<AssistantViewState>((set, get) => ({
  currentAssistantId: null,
  assistantViews: {},
  getOrCreate: (assistantId) => {
    const existingView = get().assistantViews[assistantId];
    if (existingView) {
      return existingView;
    }

    const view = createDefaultAssistantViewModel();
    set((state) => ({
      assistantViews: {
        ...state.assistantViews,
        [assistantId]: view,
      },
    }));
    return view;
  },
  setField: (assistantId, field, value) => {
    set((state) => {
      const currentView = state.assistantViews[assistantId] ?? createDefaultAssistantViewModel();
      return {
        assistantViews: {
          ...state.assistantViews,
          [assistantId]: {
            ...currentView,
            [field]: value,
          },
        },
      };
    });
  },
  setModel: (assistantId, model) => {
    set((state) => {
      const currentView = state.assistantViews[assistantId] ?? createDefaultAssistantViewModel();
      return {
        assistantViews: {
          ...state.assistantViews,
          [assistantId]: {
            ...currentView,
            ...model,
          },
        },
      };
    });
  },
  resetModel: (assistantId) => {
    set((state) => ({
      assistantViews: {
        ...state.assistantViews,
        [assistantId]: createDefaultAssistantViewModel(),
      },
    }));
  },
  setCurrent: (assistantId) => {
    set({ currentAssistantId: assistantId });
  },
}));

export default useAssistantViewStore;
