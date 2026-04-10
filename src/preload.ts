import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./constants";
import type {
  CodexAgentSession,
  CodexEventPayload,
  CodexRequestPayload,
  CodexRequestResponse,
  CodexRpcCallPayload,
  CodexSessionReadyPayload,
  CodexTurnInterruptPayload,
  CodexTurnSteerPayload,
  EditorOpenFilePayload,
} from "./types/codex-bridge";

window.addEventListener("message", (event) => {
  if (event.data === IPC_CHANNELS.START_ORPC_SERVER) {
    const [serverPort] = event.ports;

    ipcRenderer.postMessage(IPC_CHANNELS.START_ORPC_SERVER, null, [serverPort]);
  }
});

contextBridge.exposeInMainWorld("api", {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  openProject: (folderPath: string) =>
    ipcRenderer.invoke("editor:openProject", folderPath),
  getEditorFolder: () => ipcRenderer.invoke("editor:getFolder"),
  getRecentProjects: () => ipcRenderer.invoke("projects:getRecent"),
  removeRecentProject: (projectPath: string) =>
    ipcRenderer.invoke("projects:removeRecent", projectPath),
  onEditorFolder: (callback: (folderPath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, folderPath: string) => {
      callback(folderPath);
    };
    ipcRenderer.on("editor:setFolder", handler);
    return () => {
      ipcRenderer.removeListener("editor:setFolder", handler);
    };
  },
  readDirectory: (folderPath: string) =>
    ipcRenderer.invoke("fs:readDirectory", folderPath),
  readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  createFile: (parentPath: string, name: string) =>
    ipcRenderer.invoke("fs:createFile", parentPath, name),
  createFolder: (parentPath: string, name: string) =>
    ipcRenderer.invoke("fs:createFolder", parentPath, name),
  rename: (targetPath: string, newName: string) =>
    ipcRenderer.invoke("fs:rename", targetPath, newName),
  delete: (targetPath: string) => ipcRenderer.invoke("fs:delete", targetPath),
  move: (sourcePath: string, destinationFolder: string) =>
    ipcRenderer.invoke("fs:move", sourcePath, destinationFolder),
  listFiles: (rootPath: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listFiles", rootPath),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
});

contextBridge.exposeInMainWorld("codex", {
  ensureAgent: (agentId: string, cwd: string): Promise<CodexAgentSession> =>
    ipcRenderer.invoke("codex:agent:ensure", { agentId, cwd }),
  killAgent: (agentId: string) => ipcRenderer.invoke("codex:agent:kill", agentId),
  listAgents: (): Promise<string[]> => ipcRenderer.invoke("codex:agent:list"),
  onEvent: (callback: (payload: CodexEventPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CodexEventPayload) => {
      callback(payload);
    };

    ipcRenderer.on("codex:event", handler);
    return () => {
      ipcRenderer.removeListener("codex:event", handler);
    };
  },
  onRequest: (callback: (payload: CodexRequestPayload) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: CodexRequestPayload
    ) => {
      callback(payload);
    };

    ipcRenderer.on("codex:request", handler);
    return () => {
      ipcRenderer.removeListener("codex:request", handler);
    };
  },
  respondToRequest: (response: CodexRequestResponse) =>
    ipcRenderer.invoke("codex:request:respond", response),
  sendMessage: (agentId: string, text: string, model?: string | null, collaborationMode?: string | null, approvalPolicy?: string | null, effort?: string | null, attachments?: string[]) =>
    ipcRenderer.invoke("codex:agent:send", { agentId, model, text, collaborationMode, approvalPolicy, effort, attachments }),
  createSession: (sessionId: string, cwd: string): Promise<CodexAgentSession> =>
    ipcRenderer.invoke("codex:session:create", { sessionId, cwd }),
  rpcCall: (agentId: string, method: string, params: unknown): Promise<unknown> =>
    ipcRenderer.invoke("codex:rpc:call", { agentId, method, params } satisfies CodexRpcCallPayload),
  interruptTurn: (agentId: string, threadId: string, turnId: string): Promise<unknown> =>
    ipcRenderer.invoke("codex:turn:interrupt", { agentId, threadId, turnId } satisfies CodexTurnInterruptPayload),
  steerTurn: (agentId: string, threadId: string, input: unknown[], expectedTurnId: string): Promise<unknown> =>
    ipcRenderer.invoke("codex:turn:steer", { agentId, expectedTurnId, input, threadId } satisfies CodexTurnSteerPayload),
  onSessionReady: (callback: (payload: CodexSessionReadyPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CodexSessionReadyPayload) => {
      callback(payload);
    };
    ipcRenderer.on("codex:session:ready", handler);
    return () => {
      ipcRenderer.removeListener("codex:session:ready", handler);
    };
  },
});

contextBridge.exposeInMainWorld("editor", {
  openFile: (payload: EditorOpenFilePayload): Promise<void> =>
    ipcRenderer.invoke("editor:openFile", payload),
  onOpenFile: (callback: (payload: EditorOpenFilePayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: EditorOpenFilePayload) => {
      callback(payload);
    };
    ipcRenderer.on("editor:openFile", handler);
    return () => {
      ipcRenderer.removeListener("editor:openFile", handler);
    };
  },
  onFileChanged: (callback: (payload: { path: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { path: string }) => {
      callback(payload);
    };
    ipcRenderer.on("file:changed", handler);
    return () => {
      ipcRenderer.removeListener("file:changed", handler);
    };
  },
});
