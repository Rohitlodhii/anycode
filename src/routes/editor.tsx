import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Copy,
  File as FileIcon,
  FilePlus2,
  Folder as FolderIcon,
  History,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Scissors,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import "monaco-editor/min/vs/editor/editor.main.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CodexChatPanel } from "@/components/codex/codex-chat-panel";
import { useSessionStore } from "@/stores/session-store";
import DragWindowRegion from "@/components/drag-window-region";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import nodeGlobals from "@/monaco/node-globals";
import {
  useEditorUiStore,
  type EditorTab,
  type EditorView,
} from "@/stores/editor-ui";
import type { FileNode } from "@/types/file-tree";
import type { RecentProject } from "@/types/project-history";
import { cn } from "@/utils/tailwind";
import { FileConflictDialog } from "@/components/editor/file-conflict-dialog";

type DialogMode = "rename" | "newFile" | "newFolder";

type DialogState = {
  mode: DialogMode;
  node: FileNode;
  value: string;
};

type ConfirmDeleteSessionState = {
  sessionId: string;
  sessionName: string;
};

type MonacoWorkerEnvironment = typeof self & {
  MonacoEnvironment?: {
    getWorker: (_workerId: unknown, label: string) => Worker;
  };
};

type MonacoDefaults = {
  addExtraLib: (content: string, filePath?: string) => unknown;
  setCompilerOptions: (options: Record<string, unknown>) => void;
  setDiagnosticsOptions: (options: Record<string, unknown>) => void;
};

type MonacoTypescriptApi = {
  typescriptDefaults?: MonacoDefaults;
  javascriptDefaults?: MonacoDefaults;
  ModuleKind?: Record<string, number>;
  ModuleResolutionKind?: Record<string, number>;
  JsxEmit?: Record<string, number>;
  ScriptTarget?: Record<string, number>;
};

type TreeNodeProps = {
  node: FileNode;
  depth: number;
  activeTabPath: string | null;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onDelete: (node: FileNode) => Promise<void>;
  onMove: (sourcePath: string, destinationFolder: string) => Promise<void>;
  onOpenDialog: (mode: DialogMode, node: FileNode) => void;
  onOpenFile: (node: FileNode) => Promise<void>;
  onSelectPath: (path: string | null) => void;
  onToggleFolder: (node: FileNode) => void;
};

const SUBSEQUENCE_LIMIT = 50;
const DIRECTORY_TIMEOUT_MS = 5000;

let monacoConfigured = false;
let nodeTypesInjected = false;

if (typeof self !== "undefined" && !((self as MonacoWorkerEnvironment).MonacoEnvironment)) {
  (self as MonacoWorkerEnvironment).MonacoEnvironment = {
    getWorker: (_workerId, label) => {
      if (label === "json") {
        return new jsonWorker();
      }
      if (label === "css" || label === "scss" || label === "less") {
        return new cssWorker();
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new htmlWorker();
      }
      if (label === "typescript" || label === "javascript") {
        return new tsWorker();
      }
      return new editorWorker();
    },
  };
}

loader.config({ monaco });

function EditorPage() {
  const { folder } = Route.useSearch();
  const [resolvedFolderPath, setResolvedFolderPath] = useState(() =>
    getFolderPathFromRoute(folder)
  );
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [isTreeLoading, setIsTreeLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteSession, setConfirmDeleteSession] =
    useState<ConfirmDeleteSessionState | null>(null);

  // State for file conflict dialog (external change vs unsaved local edits)
  const [fileConflictPath, setFileConflictPath] = useState<string | null>(null);

  const activeView = useEditorUiStore((state) => state.activeView);
  const setActiveView = useEditorUiStore((state) => state.setActiveView);

  // Ref to the Monaco editor instance for cursor navigation
  const monacoEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const tabs = useEditorUiStore((state) => state.tabs);
  const activeTabPath = useEditorUiStore((state) => state.activeTabPath);
  const setActiveTabPath = useEditorUiStore((state) => state.setActiveTabPath);
  const openTab = useEditorUiStore((state) => state.openTab);
  const closeTab = useEditorUiStore((state) => state.closeTab);
  const markTabSaved = useEditorUiStore((state) => state.markTabSaved);
  const renameTab = useEditorUiStore((state) => state.renameTab);
  const removeTabsByPrefix = useEditorUiStore((state) => state.removeTabsByPrefix);
  const updateTabContent = useEditorUiStore((state) => state.updateTabContent);
  const resetEditorUi = useEditorUiStore((state) => state.reset);

  // Session store — ensure a session exists for the current project
  const createSession = useSessionStore((state) => state.createSession);
  const setSessionReady = useSessionStore((state) => state.setSessionReady);
  const setSessionError = useSessionStore((state) => state.setSessionError);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const sessions = useSessionStore((state) => state.sessions);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const renameSession = useSessionStore((state) => state.renameSession);
  const hasStreamingSession = useSessionStore((state) => state.hasStreamingSession);
  const getSessionsForProject = useSessionStore((state) => state.getSessionsForProject);
  const archiveSessionsForProject = useSessionStore((state) => state.archiveSessionsForProject);

  // Derive the session ID to show for the current project
  const currentProjectSessionId = useMemo(() => {
    if (!resolvedFolderPath) return null;
    // If the active session belongs to this project, use it
    if (activeSessionId && sessions[activeSessionId]?.projectPath === resolvedFolderPath) {
      return activeSessionId;
    }
    // Otherwise find any session for this project
    const found = Object.values(sessions).find(
      (s) => s.projectPath === resolvedFolderPath && !s.isArchived
    );
    return found?.id ?? null;
  }, [resolvedFolderPath, activeSessionId, sessions]);

  // When the project changes, ensure a session exists and connect it
  useEffect(() => {
    if (!hasHydrated || !resolvedFolderPath) return;

    if (!resolvedFolderPath) return;

    let cancelled = false;

    const ensureSession = async () => {
      const store = useSessionStore.getState();

      // Find or create a session for this project
      let sessionId = Object.values(store.sessions).find(
        (s) => s.projectPath === resolvedFolderPath && !s.isArchived
      )?.id;

      if (!sessionId) {
        sessionId = createSession(resolvedFolderPath);
      }

      setActiveSession(sessionId);

      const sess = useSessionStore.getState().sessions[sessionId];
      // Only connect if idle or not yet connected
      if (sess && sess.status !== "idle" && sess.status !== "connecting") return;

      try {
        const agentSession = await window.codex.ensureAgent(sessionId, resolvedFolderPath);
        if (!cancelled) {
          setSessionReady(sessionId, agentSession);
        }
      } catch (err) {
        if (!cancelled) {
          setSessionError(
            sessionId,
            err instanceof Error ? err.message : "Failed to connect"
          );
        }
      }
    };

    void ensureSession();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, resolvedFolderPath]);

  const activeTab = tabs.find((tab) => tab.path === activeTabPath) ?? null;
  const folderName = getBaseName(resolvedFolderPath) || "Workspace";
  const selectedNode = useMemo(() => {
    if (!fileTree || !selectedPath) {
      return null;
    }
    return findNodeByPath(fileTree, selectedPath);
  }, [fileTree, selectedPath]);
  const allFiles = useMemo(() => flattenFiles(fileTree), [fileTree]);
  const quickResults = useMemo(() => {
    if (!quickQuery) {
      return allFiles.slice(0, SUBSEQUENCE_LIMIT);
    }

    const loweredQuery = quickQuery.toLowerCase();
    return allFiles
      .filter((node) => isSubsequence(loweredQuery, node.relativePath.toLowerCase()))
      .slice(0, SUBSEQUENCE_LIMIT);
  }, [allFiles, quickQuery]);

  useEffect(() => {
    const routeFolderPath = getFolderPathFromRoute(folder);
    if (routeFolderPath) {
      setResolvedFolderPath(routeFolderPath);
    }
  }, [folder]);

  useEffect(() => {
    let active = true;

    if (!resolvedFolderPath) {
      window.api
        .getEditorFolder()
        .then((value) => {
          if (active && value) {
            setResolvedFolderPath(value);
          }
        })
        .catch((error) => {
          console.error("Failed to resolve editor folder", error);
        });
    }

    const unsubscribe = window.api.onEditorFolder((value) => {
      if (active && value) {
        setResolvedFolderPath(value);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [resolvedFolderPath]);

  useEffect(() => {
    resetEditorUi();
    setSelectedPath(null);
    setExpandedPaths(new Set());
    setFileTree(null);
    setTreeError(null);
  }, [resolvedFolderPath, resetEditorUi]);

  useEffect(() => {
    if (!resolvedFolderPath) {
      setTreeError("No folder path was provided to the editor.");
      setFileTree(null);
      return;
    }

    void loadTree(resolvedFolderPath);
  }, [resolvedFolderPath]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommand = event.metaKey || event.ctrlKey;

      if (isCommand && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setQuickOpen(true);
        setQuickQuery("");
        return;
      }

      if (isCommand && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSaveActive();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab]);

  useEffect(() => {
    void loadRecentProjects();
  }, [resolvedFolderPath]);

  // Subscribe to editor:openFile IPC events from the diff viewer / main process
  useEffect(() => {
    const unsubscribe = window.editor.onOpenFile(async ({ path, line }) => {
      // Switch to editor view
      setActiveView("editor");

      // Build a minimal FileNode to reuse the existing openFile logic
      const name = path.split("/").pop() ?? path.split("\\").pop() ?? path;
      const relativePath = resolvedFolderPath
        ? path.replace(resolvedFolderPath, "").replace(/^[/\\]/, "")
        : name;

      await openFile({
        children: undefined,
        name,
        parentPath: resolvedFolderPath ?? undefined,
        path,
        relativePath,
        type: "file",
      });

      // Navigate to the requested line after the editor has mounted/updated
      if (line !== undefined && line > 0) {
        // Use a short timeout to allow the editor to render the new file
        window.setTimeout(() => {
          const editor = monacoEditorRef.current;
          if (!editor) return;
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: 1 });
          editor.focus();
        }, 100);
      }
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedFolderPath, setActiveView]);

  // Subscribe to file:changed IPC events from the file watcher (main process)
  useEffect(() => {
    const unsubscribe = window.editor.onFileChanged(async ({ path }) => {
      // Only react if this file is currently open in a tab
      const openTab = useEditorUiStore.getState().tabs.find((t) => t.path === path);
      if (!openTab) return;

      // If the tab has unsaved changes, show the conflict dialog
      if (openTab.isDirty) {
        setFileConflictPath(path);
        return;
      }

      // No unsaved changes — silently reload
      await reloadFile(path);
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTree(folderPath: string) {
    setIsTreeLoading(true);
    setTreeError(null);

    try {
      const tree = await readDirectoryWithTimeout(folderPath);
      if (!tree) {
        setFileTree(null);
        setTreeError("No folder data returned from the main process.");
        return;
      }

      setFileTree(tree);
      setExpandedPaths((current) =>
        current.size > 0 ? current : new Set([tree.path])
      );
    } catch (error) {
      console.error("Failed to load folder", error);
      setTreeError("Failed to load folder contents.");
      setFileTree(null);
    } finally {
      setIsTreeLoading(false);
    }
  }

  async function loadRecentProjects() {
    setIsProjectsLoading(true);

    try {
      const projects = await window.api.getRecentProjects();
      setRecentProjects(projects);
    } catch (error) {
      console.error("Failed to load recent projects", error);
      setRecentProjects([]);
    } finally {
      setIsProjectsLoading(false);
    }
  }

  async function openFile(node: FileNode) {
    if (node.type !== "file") {
      return;
    }

    setSelectedPath(node.path);
    if (fileTree) {
      setExpandedPaths((current) => expandPathChain(current, fileTree, node.path));
    }

    const existingTab = tabs.find((tab) => tab.path === node.path);
    if (existingTab) {
      setActiveTabPath(existingTab.path);
      return;
    }

    try {
      const content = await window.api.readFile(node.path);
      const nextTab: EditorTab = {
        content,
        isDirty: false,
        language: inferLanguage(node.name),
        name: node.name,
        originalContent: content,
        path: node.path,
        relativePath: node.relativePath,
      };

      openTab(nextTab);
    } catch (error) {
      console.error("Failed to open file", error);
    }
  }

  async function handleSaveActive() {
    if (!activeTab) {
      return;
    }

    try {
      await window.api.writeFile(activeTab.path, activeTab.content);
      markTabSaved(activeTab.path);
    } catch (error) {
      console.error("Failed to save file", error);
    }
  }

  async function reloadFile(filePath: string) {
    try {
      const content = await window.api.readFile(filePath);

      // Save cursor and scroll position before updating content
      const editor = monacoEditorRef.current;
      const position = editor?.getPosition();
      const scrollTop = editor?.getScrollTop() ?? 0;

      // Update the tab content and mark it as saved (matches disk)
      const store = useEditorUiStore.getState();
      const tab = store.tabs.find((t) => t.path === filePath);
      if (!tab) return;

      // Use openTab to replace the tab with fresh content
      store.openTab({
        ...tab,
        content,
        originalContent: content,
        isDirty: false,
      });

      // Restore cursor and scroll after React re-renders
      window.setTimeout(() => {
        if (!editor) return;
        const lineCount = editor.getModel()?.getLineCount() ?? 0;
        if (position && position.lineNumber <= lineCount) {
          editor.setPosition(position);
          editor.setScrollTop(scrollTop);
        }
      }, 50);
    } catch (error) {
      console.error("Failed to reload file", error);
    }
  }

  function handleEditorChange(value: string | undefined) {
    if (!activeTab) {
      return;
    }

    updateTabContent(activeTab.path, value ?? "");
  }

  function handleViewChange(value: string) {
    if (value === "chat" || value === "editor") {
      setActiveView(value as EditorView);
    }
  }

  function toggleFolder(node: FileNode) {
    if (node.type !== "folder") {
      return;
    }

    setSelectedPath(node.path);
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  }

  function openDialog(mode: DialogMode, node: FileNode) {
    setDialogState({
      mode,
      node,
      value: mode === "rename" ? node.name : "",
    });
  }

  function closeDialog() {
    setDialogState(null);
  }

  async function moveNode(sourcePath: string, destinationFolder: string) {
    if (!resolvedFolderPath || !sourcePath || !destinationFolder) {
      return;
    }

    if (destinationFolder === getParentPath(sourcePath)) {
      return;
    }

    const sourcePrefix = `${normalizePath(sourcePath)}/`;
    if (normalizePath(destinationFolder).startsWith(sourcePrefix)) {
      return;
    }

    try {
      const nextPath = await window.api.move(sourcePath, destinationFolder);
      renameTab(
        sourcePath,
        nextPath,
        getBaseName(nextPath),
        getRelativePath(resolvedFolderPath, nextPath)
      );

      if (selectedPath === sourcePath) {
        setSelectedPath(nextPath);
      }

      await loadTree(resolvedFolderPath);
    } catch (error) {
      console.error("Failed to move node", error);
    }
  }

  async function deleteNode(node: FileNode) {
    const confirmed = window.confirm(
      `Delete ${node.name}? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    try {
      await window.api.delete(node.path);
      removeTabsByPrefix(node.path, node.type === "folder");

      if (selectedPath?.startsWith(node.path)) {
        setSelectedPath(null);
      }

      if (resolvedFolderPath) {
        await loadTree(resolvedFolderPath);
      }
    } catch (error) {
      console.error("Failed to delete node", error);
    }
  }

  async function submitDialog() {
    if (!dialogState || !resolvedFolderPath) {
      closeDialog();
      return;
    }

    const value = dialogState.value.trim();
    if (!value) {
      return;
    }

    try {
      if (dialogState.mode === "rename") {
        const nextPath = await window.api.rename(dialogState.node.path, value);
        const nextRelativePath = getRelativePath(resolvedFolderPath, nextPath);

        if (dialogState.node.type === "file") {
          renameTab(dialogState.node.path, nextPath, value, nextRelativePath);
        } else {
          removeTabsByPrefix(dialogState.node.path, true);
        }

        setSelectedPath(nextPath);
      }

      if (dialogState.mode === "newFile") {
        const parentPath =
          dialogState.node.type === "folder"
            ? dialogState.node.path
            : dialogState.node.parentPath;

        if (parentPath) {
          const nextPath = await window.api.createFile(parentPath, value);
          await loadTree(resolvedFolderPath);
          await openFile({
            children: undefined,
            name: value,
            parentPath,
            path: nextPath,
            relativePath: getRelativePath(resolvedFolderPath, nextPath),
            type: "file",
          });
          closeDialog();
          return;
        }
      }

      if (dialogState.mode === "newFolder") {
        const parentPath =
          dialogState.node.type === "folder"
            ? dialogState.node.path
            : dialogState.node.parentPath;

        if (parentPath) {
          const nextPath = await window.api.createFolder(parentPath, value);
          setSelectedPath(nextPath);
        }
      }

      await loadTree(resolvedFolderPath);
      closeDialog();
    } catch (error) {
      console.error("Dialog action failed", error);
    }
  }

  async function handleQuickOpenSelect(node: FileNode) {
    await openFile(node);
    setQuickOpen(false);
    setQuickQuery("");
  }

  async function handleOpenProjectPicker() {
    try {
      const projectPath = await window.api.openFolder();
      if (!projectPath) {
        return;
      }

      if (projectPath === resolvedFolderPath) {
        setActiveView("editor");
        await loadRecentProjects();
        return;
      }

      await window.api.openProject(projectPath);
      await loadRecentProjects();
    } catch (error) {
      console.error("Failed to open new project", error);
    }
  }

  async function handleOpenRecentProject(project: RecentProject) {
    try {
      if (project.path === resolvedFolderPath) {
        setActiveView("editor");
        return;
      }

      await window.api.openProject(project.path);
      await loadRecentProjects();
    } catch (error) {
      console.error("Failed to open recent project", error);
    }
  }

  async function handleRemoveRecentProject(project: RecentProject) {
    try {
      await window.api.removeRecentProject(project.path);
      // Per requirement: removing a project from recents archives all its sessions.
      archiveSessionsForProject(project.path);
      await loadRecentProjects();
      toast.success("Project removed from recents");
    } catch (error) {
      console.error("Failed to remove recent project", error);
      toast.error("Failed to remove project from recents");
    }
  }

  const dialogTitle =
    dialogState?.mode === "rename"
      ? "Rename"
      : dialogState?.mode === "newFile"
        ? "New file"
        : "New folder";

  const dialogActionLabel =
    dialogState?.mode === "rename"
      ? "Rename"
      : dialogState?.mode === "newFile"
        ? "Create file"
        : "Create folder";

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <DragWindowRegion
        className="shrink-0"
        title="Anycode"
        titleClassName="font-pixel text-[11px] uppercase tracking-[0.16em] text-foreground"
        topRowClassName="min-h-11 gap-4"
        center={
          <Tabs
            className="gap-0"
            onValueChange={handleViewChange}
            value={activeView}
          >
            <TabsList
              className="h-8 rounded-full border border-border bg-muted/60 p-0.5"
              variant="default"
            >
              <TabsTrigger
                className="h-7 min-w-18 rounded-full px-4 text-xs data-active:bg-background"
                value="chat"
              >
                Chat
              </TabsTrigger>
              <TabsTrigger
                className="h-7 min-w-18 rounded-full px-4 text-xs data-active:bg-background"
                value="editor"
              >
                Editor
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="min-h-0 flex-1">
        {activeView === "chat" ? (
          <div className="flex h-full min-h-0 border-t border-border bg-background">
            <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-border bg-card/20">
              <div className="flex h-12 items-center border-b border-border px-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <History className="size-4 text-muted-foreground" />
                  <span>Projects</span>
                </div>
              </div>

              <div className="border-b border-border p-3">
                <Button
                  className="w-full justify-start gap-2"
                  onClick={() => void handleOpenProjectPicker()}
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-4" />
                  New Project
                </Button>
              </div>

              <div className="editor-sidebar-scroll min-h-0 flex-1 overflow-auto">
                <div className="border-b border-border px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Recent
                  </div>
                </div>

                {isProjectsLoading ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Loading projects...
                  </div>
                ) : recentProjects.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    No recent projects yet.
                  </div>
                ) : (
                  <div className="py-1">
                    {recentProjects.map((project) => {
                      const isCurrentProject = project.path === resolvedFolderPath;
                      const isStreaming = hasStreamingSession(project.path);
                      const projectSessions = isCurrentProject
                        ? getSessionsForProject(project.path).filter((s) => !s.isArchived)
                        : [];

                      return (
                        <div key={project.path}>
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              <div className="group relative">
                                <button
                                  className={cn(
                                    "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                                    isCurrentProject
                                      ? "bg-muted text-foreground"
                                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                  )}
                                  onClick={() => void handleOpenRecentProject(project)}
                                  type="button"
                                >
                                  <div className="relative mt-0.5 shrink-0">
                                    <FolderOpen className="size-4 text-muted-foreground" />
                                    {isStreaming && (
                                      <Loader2 className="absolute -right-1.5 -top-1.5 size-3 animate-spin text-blue-400" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1 pr-8">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-sm font-medium text-foreground">
                                        {project.name}
                                      </span>
                                      {isCurrentProject ? (
                                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                          Current
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                      {project.path}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                                      {formatLastOpened(project.lastOpenedAt)}
                                    </p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  title="Remove from recents"
                                  className="absolute right-2 top-2 rounded p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRemoveRecentProject(project);
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48">
                              <ContextMenuItem
                                onSelect={() => void handleRemoveRecentProject(project)}
                              >
                                <Trash2 className="size-3.5" />
                                Remove from Recents
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>

                          {/* Sessions list under the active project */}
                          {isCurrentProject && projectSessions.length > 0 && (
                            <div className="border-b border-border/50 pb-1">
                              {projectSessions.map((sess) => {
                                const isActive = sess.id === activeSessionId;
                                const isRenaming = renamingSessionId === sess.id;

                                const sessionStatusLabel = (() => {
                                  if (sess.status === "streaming") return "Thinking…";
                                  if (sess.status === "connecting") return "Connecting…";
                                  if (sess.status === "error") return "Error";
                                  if (sess.status === "connected") return "Connected";
                                  return "Idle";
                                })();

                                return (
                                  <div
                                    key={sess.id}
                                    className={cn(
                                      "group flex items-center gap-2 pl-8 pr-2 py-1.5 transition-colors",
                                      isActive
                                        ? "bg-accent/60 text-foreground"
                                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                    )}
                                  >
                                    {/* Status dot */}
                                    <div className="shrink-0">
                                      {sess.status === "streaming" || sess.status === "connecting" ? (
                                        <Loader2 className="size-3 animate-spin text-blue-400" />
                                      ) : sess.status === "error" ? (
                                        <AlertCircle className="size-3 text-red-400" />
                                      ) : (
                                        <div className={cn(
                                          "size-1.5 rounded-full",
                                          isActive ? "bg-green-400" : "bg-muted-foreground/40"
                                        )} />
                                      )}
                                    </div>

                                    {/* Name — inline edit on double-click */}
                                    {isRenaming ? (
                                      <input
                                        autoFocus
                                        className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground outline-none"
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => {
                                          const trimmed = renameValue.trim();
                                          if (trimmed) renameSession(sess.id, trimmed);
                                          setRenamingSessionId(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            const trimmed = renameValue.trim();
                                            if (trimmed) renameSession(sess.id, trimmed);
                                            setRenamingSessionId(null);
                                          } else if (e.key === "Escape") {
                                            setRenamingSessionId(null);
                                          }
                                        }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className="min-w-0 flex-1 text-left"
                                        onClick={() => {
                                          setActiveSession(sess.id);
                                        }}
                                        onDoubleClick={() => {
                                          setRenamingSessionId(sess.id);
                                          setRenameValue(sess.name);
                                        }}
                                      >
                                        <span className="block truncate text-xs font-medium">
                                          {sess.name}
                                        </span>
                                        <span className="block truncate text-[10px] text-muted-foreground">
                                          {sessionStatusLabel}
                                        </span>
                                      </button>
                                    )}

                                    {/* Actions — visible on hover */}
                                    {!isRenaming && (
                                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <button
                                          type="button"
                                          title="Rename session"
                                          className="rounded p-0.5 hover:bg-muted"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRenamingSessionId(sess.id);
                                            setRenameValue(sess.name);
                                          }}
                                        >
                                          <Pencil className="size-3" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Delete session"
                                          className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-400"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmDeleteSession({
                                              sessionId: sess.id,
                                              sessionName: sess.name,
                                            });
                                          }}
                                        >
                                          <Trash2 className="size-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 bg-background">
              {activeSessionId && sessions[activeSessionId] ? (
                <CodexChatPanel
                  sessionId={activeSessionId}
                  projectPath={sessions[activeSessionId].projectPath}
                />
              ) : currentProjectSessionId ? (
                <CodexChatPanel
                  sessionId={currentProjectSessionId}
                  projectPath={resolvedFolderPath ?? ""}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Open a project to start chatting with Codex.
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="flex h-full min-h-0">
            <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-card/20">
              <div className="flex h-10 items-center border-b border-border">
                <div className="px-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
                  {folderName}
                </div>
                <div className="ml-auto flex items-center">
                  <Button
                    className="size-8 rounded-none border-0"
                    onClick={() => {
                      if (resolvedFolderPath) {
                        void loadTree(resolvedFolderPath);
                      }
                    }}
                    size="icon"
                    title="Reload"
                    type="button"
                    variant="ghost"
                  >
                    <RotateCw className="size-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="size-8 rounded-none border-0"
                        size="icon"
                        title="Create"
                        type="button"
                        variant="ghost"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onSelect={() => {
                          if (fileTree) {
                            openDialog("newFile", selectedNode ?? fileTree);
                          }
                        }}
                      >
                        <FilePlus2 className="size-3.5" />
                        New file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          if (fileTree) {
                            openDialog("newFolder", selectedNode ?? fileTree);
                          }
                        }}
                      >
                        <FolderPlus className="size-3.5" />
                        New folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <button
                className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                onClick={() => setQuickOpen(true)}
                type="button"
              >
                <Search className="size-3.5" />
                <span className="flex-1 text-left">Quick open</span>
                <span className="text-[10px] uppercase tracking-[0.18em]">
                  Ctrl+P
                </span>
              </button>

              <div className="editor-sidebar-scroll min-h-0 flex-1 overflow-auto py-1">
                {isTreeLoading ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    Loading files...
                  </div>
                ) : treeError ? (
                  <div className="space-y-3 px-3 py-3 text-xs text-muted-foreground">
                    <p>{treeError}</p>
                    <Button
                      onClick={() => {
                        if (resolvedFolderPath) {
                          void loadTree(resolvedFolderPath);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Retry
                    </Button>
                  </div>
                ) : fileTree ? (
                  <TreeNode
                    activeTabPath={activeTabPath}
                    depth={0}
                    expandedPaths={expandedPaths}
                    node={fileTree}
                    onDelete={deleteNode}
                    onMove={moveNode}
                    onOpenDialog={openDialog}
                    onOpenFile={openFile}
                    onSelectPath={setSelectedPath}
                    onToggleFolder={toggleFolder}
                    selectedPath={selectedPath}
                  />
                ) : (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    No folder data loaded.
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
              <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-white/10 bg-[#181818]">
                {tabs.length === 0 ? (
                  <div className="flex items-center px-3 text-xs text-zinc-500">
                    No file open
                  </div>
                ) : (
                  tabs.map((tab) => {
                    const isActive = tab.path === activeTabPath;
                    return (
                      <div
                        className={cn(
                          "group flex h-full min-w-0 shrink-0 items-center gap-2 border-r border-white/10 px-3 text-xs transition-colors",
                          isActive
                            ? "bg-[#1e1e1e] text-zinc-100"
                            : "bg-[#181818] text-zinc-400 hover:bg-[#202020] hover:text-zinc-100"
                        )}
                        key={tab.path}
                        onClick={() => setActiveTabPath(tab.path)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveTabPath(tab.path);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title={tab.relativePath}
                      >
                        <FileIcon className="size-3.5 shrink-0 text-zinc-500" />
                        <span className="max-w-48 truncate font-mono">
                          {tab.name}
                        </span>
                        {tab.isDirty ? (
                          <span className="text-[10px] leading-none text-zinc-500">
                            *
                          </span>
                        ) : null}
                        <span
                          className="inline-flex size-4 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            closeTab(tab.path);
                          }}
                        >
                          <X className="size-3" />
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="min-h-0 flex-1">
                {activeTab ? (
                  <Editor
                    beforeMount={configureMonaco}
                    height="100%"
                    language={activeTab.language}
                    loading={
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Loading editor...
                      </div>
                    }
                    onChange={handleEditorChange}
                    onMount={(editor) => {
                      monacoEditorRef.current = editor;
                    }}
                    options={{
                      automaticLayout: true,
                      bracketPairColorization: { enabled: true },
                      contextmenu: true,
                      cursorBlinking: "blink",
                      fontFamily:
                        "'Geist Mono VF', 'Cascadia Code', 'Fira Code', monospace",
                      fontLigatures: true,
                      fontSize: 13,
                      folding: true,
                      glyphMargin: false,
                      hover: { enabled: true, delay: 250 },
                      inlayHints: { enabled: "on" },
                      lineNumbers: "on",
                      links: true,
                      minimap: { enabled: true },
                      padding: { top: 12 },
                      parameterHints: { enabled: true },
                      quickSuggestions: {
                        comments: false,
                        other: true,
                        strings: true,
                      },
                      renderLineHighlight: "all",
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      suggest: {
                        insertMode: "insert",
                        localityBonus: true,
                        preview: true,
                        showIcons: true,
                        showStatusBar: true,
                      },
                      suggestOnTriggerCharacters: true,
                      tabCompletion: "on",
                      wordBasedSuggestions: "currentDocument",
                      wordWrap: "on",
                    }}
                    path={activeTab.path}
                    theme="vs-dark"
                    value={activeTab.content}
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
                      <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
                        <FileIcon className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-sm font-medium text-white">
                          Pick a file to start editing
                        </h2>
                        <p className="text-xs text-zinc-400">
                          Use the explorer or press Ctrl+P for quick open.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        open={Boolean(dialogState)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            onChange={(event) => {
              if (dialogState) {
                setDialogState({
                  ...dialogState,
                  value: event.target.value,
                });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitDialog();
              }
            }}
            value={dialogState?.value ?? ""}
          />
          <DialogFooter>
            <Button onClick={closeDialog} type="button" variant="ghost">
              Cancel
            </Button>
            <Button onClick={() => void submitDialog()} type="button">
              {dialogActionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: delete session */}
      <Dialog
        open={Boolean(confirmDeleteSession)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteSession(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will remove{" "}
            <span className="font-medium text-foreground">
              {confirmDeleteSession?.sessionName ?? "this session"}
            </span>
            . This can’t be undone.
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDeleteSession(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!confirmDeleteSession) return;
                deleteSession(confirmDeleteSession.sessionId);
                setConfirmDeleteSession(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File conflict dialog — shown when an externally-changed file has unsaved local edits */}
      <FileConflictDialog
        open={Boolean(fileConflictPath)}
        filePath={fileConflictPath ?? ""}
        onKeepLocal={() => setFileConflictPath(null)}
        onReloadFromDisk={async () => {
          if (fileConflictPath) {
            await reloadFile(fileConflictPath);
          }
          setFileConflictPath(null);
        }}
        onShowDiff={() => {
          // Switch to editor view so the user can see their local changes
          // alongside the external change notification
          setActiveView("editor");
          setFileConflictPath(null);
        }}
        onClose={() => setFileConflictPath(null)}
      />

      <CommandDialog
        description="Search files by name or path."
        onOpenChange={(open) => {
          setQuickOpen(open);
          if (!open) {
            setQuickQuery("");
          }
        }}
        open={quickOpen}
        shouldFilter={false}
        title="Quick Open"
      >
        <CommandInput
          autoFocus
          onValueChange={setQuickQuery}
          placeholder="Search files by path..."
          value={quickQuery}
        />
        <CommandList className="editor-sidebar-scroll">
          <CommandEmpty>No files match your search.</CommandEmpty>
          <CommandGroup heading="Files">
            {quickResults.map((node) => (
              <CommandItem
                className="items-start"
                key={node.path}
                onSelect={() => void handleQuickOpenSelect(node)}
                value={`${node.name} ${node.relativePath}`}
              >
                <FileIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {node.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {node.relativePath}
                  </div>
                </div>
                <CommandShortcut>{getParentLabel(node.relativePath)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  activeTabPath,
  selectedPath,
  expandedPaths,
  onDelete,
  onMove,
  onOpenDialog,
  onOpenFile,
  onSelectPath,
  onToggleFolder,
}: TreeNodeProps) {
  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isActiveFile = activeTabPath === node.path;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            className={cn(
              "flex h-8 w-full items-center gap-1.5 pr-2 text-left text-xs transition-colors",
              isSelected || isActiveFile
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
            draggable={depth > 0 && !isFolder}
            onClick={() => {
              if (isFolder) {
                onToggleFolder(node);
              } else {
                void onOpenFile(node);
              }
            }}
            onDragOver={(event) => {
              if (isFolder) {
                event.preventDefault();
              }
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", node.path);
            }}
            onDrop={(event) => {
              if (!isFolder) {
                return;
              }

              event.preventDefault();
              const sourcePath = event.dataTransfer.getData("text/plain");
              if (sourcePath) {
                void onMove(sourcePath, node.path);
              }
            }}
            onFocus={() => onSelectPath(node.path)}
            style={{ paddingLeft: depth * 14 + 8 }}
            title={node.relativePath || node.path}
            type="button"
          >
            {isFolder ? (
              <>
                <ChevronMark expanded={Boolean(isExpanded)} />
                {isExpanded ? (
                  <FolderOpen className="size-3.5 shrink-0" />
                ) : (
                  <FolderIcon className="size-3.5 shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="inline-flex w-3 shrink-0" />
                <FileIcon className="size-3.5 shrink-0" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onSelect={() => onOpenDialog("rename", node)}>
            <Pencil className="size-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              // TODO: implement copy
            }}
          >
            <Copy className="size-3.5" />
            Copy
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              // TODO: implement cut
            }}
          >
            <Scissors className="size-3.5" />
            Cut
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyNodePath(node)}>
            <Copy className="size-3.5" />
            Copy path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOpenDialog("newFile", node)}>
            <FilePlus2 className="size-3.5" />
            New file
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenDialog("newFolder", node)}>
            <FolderPlus className="size-3.5" />
            New folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => void onDelete(node)}
            variant="destructive"
          >
            <Trash2 className="size-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isFolder && isExpanded
        ? node.children?.map((child) => (
            <TreeNode
              activeTabPath={activeTabPath}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              key={child.path}
              node={child}
              onDelete={onDelete}
              onMove={onMove}
              onOpenDialog={onOpenDialog}
              onOpenFile={onOpenFile}
              onSelectPath={onSelectPath}
              onToggleFolder={onToggleFolder}
              selectedPath={selectedPath}
            />
          ))
        : null}
    </div>
  );
}

function ChevronMark({ expanded }: { expanded: boolean }) {
  return (
    <span className="inline-flex w-3 shrink-0 items-center justify-center">
      <span
        className={cn(
          "transition-transform",
          expanded ? "rotate-90" : "rotate-0"
        )}
      >
        <svg
          aria-hidden="true"
          className="size-3"
          viewBox="0 0 16 16"
        >
          <path
            d="M6 4.5 10 8l-4 3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.25"
          />
        </svg>
      </span>
    </span>
  );
}

function configureMonaco(monacoInstance: Monaco) {
  if (monacoConfigured) {
    return;
  }

  monacoConfigured = true;
  const typescriptApi =
    monacoInstance.languages.typescript as unknown as MonacoTypescriptApi;
  const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    baseUrl: "file:///",
    esModuleInterop: true,
    isolatedModules: true,
    jsx: typescriptApi.JsxEmit?.ReactJSX ?? 4,
    module: typescriptApi.ModuleKind?.ESNext ?? 99,
    moduleResolution: typescriptApi.ModuleResolutionKind?.NodeJs ?? 2,
    noEmit: true,
    resolveJsonModule: true,
    strict: true,
    target: typescriptApi.ScriptTarget?.ESNext ?? 99,
  };
  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: false,
  };

  typescriptApi.typescriptDefaults?.setCompilerOptions(compilerOptions);
  typescriptApi.javascriptDefaults?.setCompilerOptions(compilerOptions);
  typescriptApi.typescriptDefaults?.setDiagnosticsOptions(diagnosticsOptions);
  typescriptApi.javascriptDefaults?.setDiagnosticsOptions(diagnosticsOptions);

  if (!nodeTypesInjected) {
    nodeTypesInjected = true;
    typescriptApi.typescriptDefaults?.addExtraLib(
      nodeGlobals,
      "file:///node-globals.d.ts"
    );
    typescriptApi.javascriptDefaults?.addExtraLib(
      nodeGlobals,
      "file:///node-globals.d.ts"
    );
  }
}

async function readDirectoryWithTimeout(folderPath: string) {
  return Promise.race([
    window.api.readDirectory(folderPath),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("readDirectory timeout"));
      }, DIRECTORY_TIMEOUT_MS);
    }),
  ]);
}

function getFolderPathFromRoute(folder: string | undefined) {
  return decodePath(folder) || getFolderPathFromHash();
}

function getFolderPathFromHash() {
  if (typeof window === "undefined") {
    return "";
  }

  const queryIndex = window.location.hash.indexOf("?");
  if (queryIndex === -1) {
    return "";
  }

  const params = new URLSearchParams(window.location.hash.slice(queryIndex + 1));
  return decodePath(params.get("folder") ?? "");
}

function decodePath(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function flattenFiles(root: FileNode | null) {
  if (!root) {
    return [];
  }

  const nodes: FileNode[] = [];
  const stack: FileNode[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.type === "file") {
      nodes.push(current);
      continue;
    }

    const children = current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) {
        stack.push(child);
      }
    }
  }

  return nodes;
}

function getParentLabel(relativePath: string) {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "Root";
  }

  return segments.slice(0, -1).join("/");
}

function findNodeByPath(root: FileNode, targetPath: string): FileNode | null {
  if (root.path === targetPath) {
    return root;
  }

  for (const child of root.children ?? []) {
    const match = findNodeByPath(child, targetPath);
    if (match) {
      return match;
    }
  }

  return null;
}

function expandPathChain(
  current: Set<string>,
  tree: FileNode,
  targetPath: string
) {
  const next = new Set(current);
  let node = findNodeByPath(tree, targetPath);

  while (node) {
    if (node.type === "folder") {
      next.add(node.path);
    }

    if (!node.parentPath) {
      break;
    }

    node = findNodeByPath(tree, node.parentPath);
  }

  return next;
}

function isSubsequence(query: string, candidate: string) {
  if (!query) {
    return true;
  }

  let queryIndex = 0;
  for (const character of candidate) {
    if (character === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}

function inferLanguage(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const languageMap: Record<string, string> = {
    c: "c",
    cpp: "cpp",
    css: "css",
    go: "go",
    htm: "html",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rs: "rust",
    scss: "scss",
    sh: "shell",
    sql: "sql",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };

  return languageMap[extension] ?? "plaintext";
}

function getBaseName(targetPath: string | null | undefined) {
  if (!targetPath) {
    return "";
  }

  const normalized = normalizePath(targetPath);
  const segments = normalized.split("/");
  return segments.at(-1) ?? normalized;
}

function getParentPath(targetPath: string) {
  const normalized = normalizePath(targetPath);
  const segments = normalized.split("/");
  segments.pop();
  return segments.join("/");
}

function getRelativePath(rootPath: string, targetPath: string) {
  const normalizedRoot = normalizePath(rootPath);
  const normalizedTarget = normalizePath(targetPath);

  if (normalizedTarget === normalizedRoot) {
    return "";
  }

  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length + 1);
  }

  return getBaseName(targetPath);
}

function normalizePath(targetPath: string) {
  return targetPath.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function formatLastOpened(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "Opened recently";
  }

  const diffMs = timestamp - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (Math.abs(diffMinutes) < 60) {
    return relativeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return relativeFormatter.format(diffDays, "day");
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

async function copyNodePath(node: FileNode) {
  try {
    await navigator.clipboard.writeText(node.path);
  } catch (error) {
    console.error("Failed to copy path", error);
  }
}

export const Route = createFileRoute("/editor")({
  component: EditorPage,
  validateSearch: (search) => ({
    folder: typeof search.folder === "string" ? search.folder : "",
  }),
});
