import fs from "node:fs/promises";
import path from "node:path";
import type { RequestId, ServerRequest } from "@codex/index";
import { app, BrowserWindow, dialog } from "electron";
import { ipcMain } from "electron/main";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import { UpdateSourceType, updateElectronApp } from "update-electron-app";
import { IPC_CHANNELS, inDevelopment } from "./constants";
import { ipcContext } from "./ipc/context";
import { AgentManager } from "./main/codex/AgentManager";
import type { CodexServerRequestResult } from "./main/codex/CodexAgent";
import { buildFileTreeSync } from "./main/filesystem";
import {
  getLastProjectPath,
  getRecentProjects,
  rememberProject,
} from "./main/project-store";
import type {
  CodexRequestPayload,
  CodexRequestResponse,
  CodexRpcCallPayload,
  CodexSessionCreatePayload,
  CodexTurnInterruptPayload,
  CodexTurnSteerPayload,
} from "./types/codex-bridge";
import { getBasePath } from "./utils/path";

const editorFolders = new Map<number, string>();
const codexManager = new AgentManager();
const codexAgentOwners = new Map<string, number>();
const codexPendingRequests = new Map<
  string,
  {
    reject: (error: Error) => void;
    resolve: (response: CodexRequestResponse) => void;
  }
>();

async function createEditorWindow(folderPath?: string | null) {
  const normalizedFolderPath = folderPath ? path.resolve(folderPath) : null;
  if (normalizedFolderPath) {
    await rememberProject(normalizedFolderPath);
  }

  const basePath = getBasePath();
  const preload = path.join(basePath, "preload.js");
  const editorWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      contextIsolation: true,
      devTools: inDevelopment,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload,
    },
  });

  // Register the BrowserWindow in IPC context before ORPC handler setup/import.
  ipcContext.setMainWindow(editorWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const targetUrl = normalizedFolderPath
      ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/editor?folder=${encodeURIComponent(normalizedFolderPath)}`
      : `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/editor`;
    editorWindow.loadURL(targetUrl);
  } else {
    editorWindow.loadFile(
      path.join(basePath, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      {
        hash: normalizedFolderPath
          ? `/editor?folder=${encodeURIComponent(normalizedFolderPath)}`
          : "/editor",
      }
    );
  }

  if (normalizedFolderPath) {
    editorFolders.set(editorWindow.id, normalizedFolderPath);
  }

  editorWindow.on("closed", () => {
    editorFolders.delete(editorWindow.id);

    for (const [agentId, ownerId] of codexAgentOwners.entries()) {
      if (ownerId === editorWindow.id) {
        codexManager.kill(agentId);
        codexAgentOwners.delete(agentId);
      }
    }
  });

  if (normalizedFolderPath) {
    editorWindow.webContents.on("did-finish-load", () => {
      editorWindow.webContents.send("editor:setFolder", normalizedFolderPath);
    });
  }

  return editorWindow;
}

async function switchEditorProject(
  targetWindow: BrowserWindow,
  folderPath: string
) {
  const normalizedFolderPath = path.resolve(folderPath);

  await rememberProject(normalizedFolderPath);
  editorFolders.set(targetWindow.id, normalizedFolderPath);
  targetWindow.webContents.send("editor:setFolder", normalizedFolderPath);
}

function registerIpcHandlers() {
  console.log("[CodexDebug][Main] registerIpcHandlers");
  ipcMain.handle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("editor:openProject", async (event, folderPath: string) => {
    if (!folderPath) {
      return;
    }

    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return;
    }

    await switchEditorProject(targetWindow, folderPath);
  });

  ipcMain.handle("editor:getFolder", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return null;
    }
    return editorFolders.get(window.id) ?? null;
  });

  ipcMain.handle("projects:getRecent", async () => {
    return getRecentProjects();
  });

  ipcMain.handle(
    "codex:agent:ensure",
    async (event, payload: { agentId: string; cwd: string }) => {
      console.log("[CodexDebug][Main] codex:agent:ensure", payload);
      const targetWindow = BrowserWindow.fromWebContents(event.sender);
      if (!targetWindow) {
        throw new Error("Unable to resolve the active window for Codex.");
      }

      const session = await codexManager.ensure(payload.agentId, {
        cwd: payload.cwd,
      });

      codexAgentOwners.set(payload.agentId, targetWindow.id);
      return session;
    }
  );

  ipcMain.handle(
    "codex:agent:send",
    async (
      _event,
      payload: { agentId: string; model?: string | null; text: string }
    ) => {
      console.log("[CodexDebug][Main] codex:agent:send", payload);
      await codexManager.send(payload.agentId, payload.text, {
        model: payload.model ?? null,
      });
    }
  );

  ipcMain.handle("codex:agent:list", async () => {
    return codexManager.list();
  });

  ipcMain.handle("codex:agent:kill", async (_event, agentId: string) => {
    console.log("[CodexDebug][Main] codex:agent:kill", { agentId });
    codexManager.kill(agentId);
    codexAgentOwners.delete(agentId);
  });

  ipcMain.handle(
    "codex:request:respond",
    async (_event, response: CodexRequestResponse) => {
      console.log("[CodexDebug][Main] codex:request:respond", response);
      const key = getCodexRequestKey(response.agentId, response.requestId);
      const pending = codexPendingRequests.get(key);
      if (!pending) {
        throw new Error("The requested Codex prompt is no longer pending.");
      }

      codexPendingRequests.delete(key);
      pending.resolve(response);
    }
  );

  ipcMain.handle(
    "codex:session:create",
    async (event, payload: CodexSessionCreatePayload) => {
      console.log("[CodexDebug][Main] codex:session:create", payload);
      const targetWindow = BrowserWindow.fromWebContents(event.sender);
      if (!targetWindow) {
        throw new Error("Unable to resolve the active window for Codex.");
      }

      const session = await codexManager.ensure(payload.sessionId, {
        cwd: payload.cwd,
      });

      codexAgentOwners.set(payload.sessionId, targetWindow.id);
      return session;
    }
  );

  ipcMain.handle(
    "codex:rpc:call",
    async (_event, payload: CodexRpcCallPayload) => {
      console.log("[CodexDebug][Main] codex:rpc:call", payload);
      const agent = codexManager["agents"].get(payload.agentId);
      if (!agent) {
        throw new Error(`No Codex agent found for ${payload.agentId}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (agent["rpc"] as any).request(payload.method, payload.params);
    }
  );

  ipcMain.handle(
    "codex:turn:interrupt",
    async (_event, payload: CodexTurnInterruptPayload) => {
      console.log("[CodexDebug][Main] codex:turn:interrupt", payload);
      const agent = codexManager["agents"].get(payload.agentId);
      if (!agent) {
        throw new Error(`No Codex agent found for ${payload.agentId}`);
      }

      return agent["rpc"].request("turn/interrupt", {
        threadId: payload.threadId,
        turnId: payload.turnId,
      });
    }
  );

  ipcMain.handle(
    "codex:turn:steer",
    async (_event, payload: CodexTurnSteerPayload) => {
      console.log("[CodexDebug][Main] codex:turn:steer", payload);
      const agent = codexManager["agents"].get(payload.agentId);
      if (!agent) {
        throw new Error(`No Codex agent found for ${payload.agentId}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (agent["rpc"] as any).request("turn/steer", {
        expectedTurnId: payload.expectedTurnId,
        input: payload.input,
        threadId: payload.threadId,
      });
    }
  );

  ipcMain.handle("fs:readDirectory", (_event, folderPath: string) => {
    if (!folderPath) {
      return null;
    }
    return buildFileTreeSync(folderPath);
  });

  ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
    return fs.readFile(filePath, "utf-8");
  });

  ipcMain.handle(
    "fs:writeFile",
    async (_event, filePath: string, content: string) => {
      await fs.writeFile(filePath, content, "utf-8");
    }
  );

  ipcMain.handle(
    "fs:createFile",
    async (_event, parentPath: string, name: string) => {
      const fullPath = path.join(parentPath, name);
      await fs.writeFile(fullPath, "", "utf-8");
      return fullPath;
    }
  );

  ipcMain.handle(
    "fs:createFolder",
    async (_event, parentPath: string, name: string) => {
      const fullPath = path.join(parentPath, name);
      await fs.mkdir(fullPath, { recursive: true });
      return fullPath;
    }
  );

  ipcMain.handle(
    "fs:rename",
    async (_event, targetPath: string, newName: string) => {
      const newPath = path.join(path.dirname(targetPath), newName);
      await fs.rename(targetPath, newPath);
      return newPath;
    }
  );

  ipcMain.handle("fs:delete", async (_event, targetPath: string) => {
    await fs.rm(targetPath, { recursive: true, force: true });
  });

  ipcMain.handle(
    "fs:move",
    async (_event, sourcePath: string, destinationFolder: string) => {
      const newPath = path.join(destinationFolder, path.basename(sourcePath));
      await fs.rename(sourcePath, newPath);
      return newPath;
    }
  );

  ipcMain.handle("window:minimize", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    targetWindow?.minimize();
  });

  ipcMain.handle("window:toggleMaximize", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return;
    }
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
    } else {
      targetWindow.maximize();
    }
  });

  ipcMain.handle("window:close", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    targetWindow?.close();
  });
}

async function restoreLastProjectOrShowHome() {
  const lastProjectPath = await getLastProjectPath();
  const editorWindow = await createEditorWindow(lastProjectPath);

  if (!lastProjectPath) {
    // No last project — skip silently per Requirement 1.2
    return;
  }

  // Pre-warm the default session (index 1) for the last project path.
  // The session ID convention is `{projectPath}:1` for the first session.
  const defaultSessionId = `${lastProjectPath}:1`;

  // Start the agent and wait for the renderer to be ready, then emit the event.
  // We race both concurrently so neither blocks the other unnecessarily.
  const [sessionResult] = await Promise.allSettled([
    codexManager.ensure(defaultSessionId, { cwd: lastProjectPath }),
  ]);

  if (sessionResult.status === "rejected") {
    console.error("[CodexDebug][Main] startup session failed:", sessionResult.reason);
    // Silently swallow — renderer will show "idle" until the user reconnects.
    return;
  }

  const session = sessionResult.value;
  codexAgentOwners.set(defaultSessionId, editorWindow.id);

  // Send once the renderer has finished loading (may already be done).
  const sendReady = () => {
    editorWindow.webContents.send("codex:session:ready", {
      sessionId: defaultSessionId,
      session,
    });
  };

  if (editorWindow.webContents.isLoading()) {
    editorWindow.webContents.once("did-finish-load", sendReady);
  } else {
    sendReady();
  }
}

async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Extensions installed successfully: ${result.name}`);
  } catch {
    console.error("Failed to install extensions");
  }
}

function checkForUpdates() {
  updateElectronApp({
    updateSource: {
      repo: "LuanRoger/electron-shadcn",
      type: UpdateSourceType.ElectronPublicUpdateService,
    },
  });
}

async function setupORPC() {
  console.log("[Debug][ORPC][Main] setup:start");
  const { rpcHandler } = await import("./ipc/handler");

  ipcMain.on(IPC_CHANNELS.START_ORPC_SERVER, (event) => {
    console.log("[Debug][ORPC][Main] setup:port-received");
    const [serverPort] = event.ports;

    serverPort.start();
    rpcHandler.upgrade(serverPort);
  });
}

function registerCodexManagerEvents() {
  console.log("[CodexDebug][Main] registerCodexManagerEvents");
  codexManager.onEvent = (agentId, event) => {
    console.log("[CodexDebug][Main] manager:event", { agentId, event });
    const ownerId = codexAgentOwners.get(agentId);
    if (!ownerId) {
      return;
    }

    const targetWindow = BrowserWindow.fromId(ownerId);
    targetWindow?.webContents.send("codex:event", {
      agentId,
      method: event.method,
      params: event.params,
    });
  };

  codexManager.onRequest = async (agentId, request) => {
    console.log("[CodexDebug][Main] manager:request", { agentId, request });
    const ownerId = codexAgentOwners.get(agentId);
    const targetWindow = ownerId ? BrowserWindow.fromId(ownerId) : null;
    if (!targetWindow) {
      throw new Error("No window is available to review the Codex request.");
    }

    const requestPayload = toCodexRequestPayload(agentId, request);
    const response = await new Promise<CodexRequestResponse>((resolve, reject) => {
      const key = getCodexRequestKey(agentId, requestPayload.requestId);
      codexPendingRequests.set(key, { reject, resolve });
      console.log("[CodexDebug][Main] manager:request:forward", requestPayload);
      targetWindow.webContents.send("codex:request", requestPayload);
    });

    console.log("[CodexDebug][Main] manager:request:resolved", response);
    return resolveCodexRequest(request, response);
  };
}

app.whenReady().then(async () => {
  try {
    console.log("[Debug][Main] app.whenReady");
    registerIpcHandlers();
    registerCodexManagerEvents();
    // Create window first, which registers it with IPC context
    await restoreLastProjectOrShowHome();
    // Now setup ORPC after window is registered
    await setupORPC();
    await installExtensions();
    checkForUpdates();
  } catch (error) {
    console.error("Error during app initialization:", error);
  }
});

app.on("before-quit", () => {
  codexManager.killAll();
});

//osX only
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void restoreLastProjectOrShowHome();
  }
});
//osX only ends

function getCodexRequestKey(agentId: string, requestId: string) {
  return `${agentId}:${requestId}`;
}

function stringifyRequestId(requestId: RequestId) {
  return String(requestId);
}

function toCodexRequestPayload(
  agentId: string,
  request: ServerRequest
): CodexRequestPayload {
  const requestId = stringifyRequestId(request.id);

  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return {
        agentId,
        details: [
          request.params.cwd ? `Working directory: ${request.params.cwd}` : "",
          request.params.reason ? `Reason: ${request.params.reason}` : "",
        ].filter(Boolean),
        message:
          request.params.command ??
          "Codex wants approval to run a command for this project.",
        method: request.method,
        requestId,
        title: "Approve command execution",
      };
    case "item/fileChange/requestApproval":
      return {
        agentId,
        details: [
          request.params.grantRoot ? `Requested root: ${request.params.grantRoot}` : "",
          request.params.reason ? `Reason: ${request.params.reason}` : "",
        ].filter(Boolean),
        message: "Codex wants approval to write files in the current project.",
        method: request.method,
        requestId,
        title: "Approve file changes",
      };
    case "item/permissions/requestApproval":
      return {
        agentId,
        details: [
          request.params.reason ? `Reason: ${request.params.reason}` : "",
          request.params.permissions.fileSystem
            ? "Includes additional filesystem permissions."
            : "",
          request.params.permissions.network ? "Includes network permissions." : "",
        ].filter(Boolean),
        message: "Codex is requesting extra permissions for this turn.",
        method: request.method,
        requestId,
        title: "Approve permissions",
      };
    case "item/tool/requestUserInput":
      return {
        agentId,
        details: [],
        message: "Codex needs a little more information to continue.",
        method: request.method,
        questions: request.params.questions.map((question) => ({
          header: question.header,
          id: question.id,
          isOther: question.isOther,
          isSecret: question.isSecret,
          options: question.options?.map((option) => option.label) ?? [],
          question: question.question,
        })),
        requestId,
        title: "Input required",
      };
    case "mcpServer/elicitation/request":
      return {
        agentId,
        details: [
          `Server: ${request.params.serverName}`,
          request.params.mode === "url" ? `Open URL: ${request.params.url}` : "",
        ].filter(Boolean),
        message: request.params.message,
        method: request.method,
        requestId,
        title: "MCP request",
      };
    case "applyPatchApproval":
      return {
        agentId,
        details: [
          request.params.grantRoot ? `Requested root: ${request.params.grantRoot}` : "",
          request.params.reason ? `Reason: ${request.params.reason}` : "",
        ].filter(Boolean),
        message: `Codex wants to apply changes to ${Object.keys(request.params.fileChanges).length} file(s).`,
        method: request.method,
        requestId,
        title: "Approve patch",
      };
    case "execCommandApproval":
      return {
        agentId,
        details: [
          `Working directory: ${request.params.cwd}`,
          request.params.reason ? `Reason: ${request.params.reason}` : "",
        ].filter(Boolean),
        message: request.params.command.join(" "),
        method: request.method,
        requestId,
        title: "Approve command",
      };
    default:
      return {
        agentId,
        details: [],
        message: "Codex needs approval for an unsupported request type.",
        method: request.method,
        requestId,
        title: "Codex request",
      };
  }
}

function resolveCodexRequest(
  request: ServerRequest,
  response: CodexRequestResponse
): CodexServerRequestResult {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return {
        decision:
          response.action === "approveSession"
            ? "acceptForSession"
            : response.action === "approve"
              ? "accept"
              : response.action === "cancel"
                ? "cancel"
                : "decline",
      };
    case "item/fileChange/requestApproval":
      return {
        decision:
          response.action === "approveSession"
            ? "acceptForSession"
            : response.action === "approve"
              ? "accept"
              : response.action === "cancel"
                ? "cancel"
                : "decline",
      };
    case "item/permissions/requestApproval":
      return {
        permissions:
          response.action === "approve" || response.action === "approveSession"
            ? {
                fileSystem: request.params.permissions.fileSystem ?? undefined,
                network: request.params.permissions.network ?? undefined,
              }
            : {},
        scope: response.action === "approveSession" ? "session" : "turn",
      };
    case "item/tool/requestUserInput":
      return {
        answers: Object.fromEntries(
          Object.entries(response.answers ?? {}).map(([id, answers]) => [
            id,
            { answers },
          ])
        ),
      };
    case "mcpServer/elicitation/request":
      return {
        _meta: null,
        action:
          response.action === "approve" || response.action === "submit"
            ? "accept"
            : response.action === "cancel"
              ? "cancel"
              : "decline",
        content: null,
      };
    case "applyPatchApproval":
      return {
        decision:
          response.action === "approveSession"
            ? "approved_for_session"
            : response.action === "approve"
              ? "approved"
              : response.action === "cancel"
                ? "abort"
                : "denied",
      };
    case "execCommandApproval":
      return {
        decision:
          response.action === "approveSession"
            ? "approved_for_session"
            : response.action === "approve"
              ? "approved"
              : response.action === "cancel"
                ? "abort"
                : "denied",
      };
    default:
      throw new Error(`Unsupported Codex request: ${request.method}`);
  }
}
