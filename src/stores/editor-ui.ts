import { create } from "zustand";

export type EditorView = "chat" | "editor";

export type EditorTab = {
  path: string;
  name: string;
  relativePath: string;
  language: string;
  originalContent: string;
  content: string;
  isDirty: boolean;
};

type EditorUiState = {
  activeView: EditorView;
  tabs: EditorTab[];
  activeTabPath: string | null;
  setActiveView: (view: EditorView) => void;
  setActiveTabPath: (path: string | null) => void;
  openTab: (tab: EditorTab) => void;
  closeTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  markTabSaved: (path: string) => void;
  renameTab: (
    previousPath: string,
    nextPath: string,
    nextName: string,
    nextRelativePath?: string
  ) => void;
  removeTabsByPrefix: (targetPath: string, isFolder: boolean) => void;
  reset: () => void;
};

const initialState = {
  activeView: "chat" as EditorView,
  tabs: [] as EditorTab[],
  activeTabPath: null as string | null,
};

export const useEditorUiStore = create<EditorUiState>((set) => ({
  ...initialState,
  setActiveView: (activeView) => set({ activeView }),
  setActiveTabPath: (activeTabPath) => set({ activeTabPath }),
  openTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find((item) => item.path === tab.path);

      return {
        activeTabPath: tab.path,
        tabs: existing
          ? state.tabs.map((item) => (item.path === tab.path ? tab : item))
          : [...state.tabs, tab],
      };
    }),
  closeTab: (path) =>
    set((state) => {
      const remainingTabs = state.tabs.filter((tab) => tab.path !== path);
      const activeTabPath =
        state.activeTabPath === path
          ? remainingTabs.at(-1)?.path ?? null
          : state.activeTabPath;

      return {
        activeTabPath,
        tabs: remainingTabs,
      };
    }),
  updateTabContent: (path, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              content,
              isDirty: content !== tab.originalContent,
            }
          : tab
      ),
    })),
  markTabSaved: (path) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              originalContent: tab.content,
              isDirty: false,
            }
          : tab
      ),
    })),
  renameTab: (previousPath, nextPath, nextName, nextRelativePath) =>
    set((state) => ({
      activeTabPath:
        state.activeTabPath === previousPath ? nextPath : state.activeTabPath,
      tabs: state.tabs.map((tab) =>
        tab.path === previousPath
          ? {
              ...tab,
              path: nextPath,
              name: nextName,
              relativePath: nextRelativePath ?? tab.relativePath,
            }
          : tab
      ),
    })),
  removeTabsByPrefix: (targetPath, isFolder) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) =>
        isFolder ? !tab.path.startsWith(targetPath) : tab.path !== targetPath
      );

      return {
        activeTabPath:
          state.activeTabPath &&
          (isFolder
            ? state.activeTabPath.startsWith(targetPath)
            : state.activeTabPath === targetPath)
            ? tabs.at(-1)?.path ?? null
            : state.activeTabPath,
        tabs,
      };
    }),
  reset: () => set(initialState),
}));
