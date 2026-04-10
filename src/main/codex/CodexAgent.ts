import { EventEmitter } from "node:events";
import type {
  ApplyPatchApprovalResponse,
  ExecCommandApprovalResponse,
  ServerNotification,
  ServerRequest,
  v2,
} from "@/codex-schema";
import { CodexRpc } from "./CodexRpc";
import { logger } from "@/utils/logger";

export type CodexServerRequestResult =
  | ApplyPatchApprovalResponse
  | ExecCommandApprovalResponse
  | v2.CommandExecutionRequestApprovalResponse
  | v2.FileChangeRequestApprovalResponse
  | v2.McpServerElicitationRequestResponse
  | v2.PermissionsRequestApprovalResponse
  | v2.ToolRequestUserInputResponse;

export type CodexAgentSnapshot = {
  cwd: string;
  id: string;
  threadId: string;
};

type StartOptions = {
  approvalPolicy?: v2.AskForApproval;
  cwd: string;
  model?: string | null;
  sandbox?: v2.SandboxMode;
};

export class CodexAgent extends EventEmitter<{
  error: [error: Error];
  event: [event: ServerNotification];
}> {
  readonly id: string;

  private cwd = "";
  private activeModel: string | null = null;
  private readonly rpc: CodexRpc;
  private threadId = "";

  onRequest?: (request: ServerRequest) => Promise<CodexServerRequestResult>;

  constructor(id: string, codexBin = "codex") {
    super();
    this.id = id;
    logger.debug("[Codex][Agent] create", { codexBin, id });
    this.rpc = new CodexRpc(codexBin);
    this.rpc.onNotification = (message) => {
      logger.debug("[Codex][Agent] notification", { id: this.id, method: message.method });
      this.emit("event", message);
    };
    this.rpc.onServerRequest = async (message) => {
      logger.debug("[Codex][Agent] serverRequest", { id: this.id, method: message.method });
      try {
        const result = this.onRequest
          ? await this.onRequest(message)
          : getDefaultRequestResult(message);
        logger.debug("[Codex][Agent] serverRequest:result", { id: this.id });
        this.rpc.respond(message.id, result);
      } catch (error) {
        logger.error("[Codex][Agent] serverRequest:error", { error, id: this.id });
        this.rpc.respondError(
          message.id,
          -32_000,
          error instanceof Error ? error.message : "Failed to resolve request"
        );
      }
    };
    this.rpc.onStderr = (chunk) => {
      logger.error("[Codex][Agent] stderr", { chunk, id: this.id });
      this.emit("error", new Error(chunk.trim() || "Codex emitted stderr output"));
    };
  }

  destroy() {
    this.rpc.kill();
  }

  async listModels() {
    logger.debug("[Codex][Agent] listModels:start", { id: this.id });
    const models: v2.Model[] = [];
    let cursor: string | null = null;

    do {
      const response: v2.ModelListResponse =
        await this.rpc.request<v2.ModelListResponse>("model/list", {
        cursor,
        includeHidden: false,
        limit: 100,
      });
      models.push(...response.data.filter((model: v2.Model) => !model.hidden));
      cursor = response.nextCursor;
    } while (cursor);

    logger.debug("[Codex][Agent] listModels:done", {
      count: models.length,
      id: this.id,
    });
    return models;
  }

  getSnapshot(): CodexAgentSnapshot {
    return {
      cwd: this.cwd,
      id: this.id,
      threadId: this.threadId,
    };
  }

  async send(text: string, options?: { model?: string | null; collaborationMode?: string | null; approvalPolicy?: string | null; effort?: string | null; attachments?: string[] }) {
    if (!this.threadId) {
      throw new Error("Codex agent has not been started yet.");
    }
    const resolvedModel = (options?.model ?? this.activeModel ?? "").trim();
    if (!resolvedModel) {
      throw new Error("Cannot start turn: missing model");
    }

    const collaborationMode = options?.collaborationMode
      ? {
          mode: options.collaborationMode,
          settings: {
            developer_instructions: null,
            model: resolvedModel,
            reasoning_effort: options?.effort ?? null,
          },
        }
      : null;

    logger.debug("[Codex][Agent] send", {
      id: this.id,
      model: resolvedModel,
      threadId: this.threadId,
    });

    // Build input array: text first, then any local image attachments
    const inputItems: unknown[] = [
      {
        text,
        text_elements: [],
        type: "text",
      },
    ];
    for (const filePath of options?.attachments ?? []) {
      inputItems.push({ path: filePath, type: "localImage" });
    }

    const buildParams = (mode: {
      mode: string;
      settings: { developer_instructions: null; model: string; reasoning_effort: string | null };
    } | null) => ({
      approvalPolicy: options?.approvalPolicy ?? null,
      approvalsReviewer: null,
      collaborationMode: mode,
      cwd: null,
      effort: options?.effort ?? null,
      input: inputItems,
      model: resolvedModel,
      outputSchema: null,
      personality: null,
      sandboxPolicy: null,
      serviceTier: null,
      summary: null,
      threadId: this.threadId,
    });
    const firstAttemptParams = buildParams(collaborationMode);
    let response: v2.TurnStartResponse;
    try {
      response = await this.rpc.request<v2.TurnStartResponse>("turn/start", firstAttemptParams);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetryWithoutMode =
        message.includes("missing field `model`") && collaborationMode !== null;
      if (!shouldRetryWithoutMode) {
        throw error;
      }

      const retryParams = buildParams(null);
      logger.warn("[Codex][Agent] turn/start retry without collaborationMode");
      response = await this.rpc.request<v2.TurnStartResponse>("turn/start", retryParams);
    }
    this.activeModel = resolvedModel;
    return response;
  }

  async start(options: StartOptions) {
    logger.debug("[Codex][Agent] start", { id: this.id });
    await this.rpc.initialize("anycode-electron", "0.1.0");

    const response: v2.ThreadStartResponse =
      await this.rpc.request<v2.ThreadStartResponse>("thread/start", {
      approvalPolicy: options.approvalPolicy ?? "on-request",
      approvalsReviewer: null,
      baseInstructions: null,
      config: null,
      cwd: options.cwd,
      developerInstructions: null,
      ephemeral: false,
      experimentalRawEvents: false,
      model: options.model ?? null,
      modelProvider: null,
      persistExtendedHistory: true,
      personality: null,
      sandbox: options.sandbox ?? "workspace-write",
      serviceName: "Anycode",
      serviceTier: null,
    });

    this.cwd = response.cwd;
    this.activeModel = response.model;
    this.threadId = response.thread.id;
    logger.debug("[Codex][Agent] started", {
      cwd: this.cwd,
      id: this.id,
      threadId: this.threadId,
    });
    return response;
  }
}

function getDefaultRequestResult(request: ServerRequest): CodexServerRequestResult {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return { decision: "decline" };
    case "item/fileChange/requestApproval":
      return { decision: "decline" };
    case "item/permissions/requestApproval":
      return {
        permissions: {},
        scope: "turn",
      };
    case "item/tool/requestUserInput":
      return {
        answers: {},
      };
    case "mcpServer/elicitation/request":
      return {
        _meta: null,
        action: "decline",
        content: null,
      };
    case "applyPatchApproval":
      return { decision: "denied" };
    case "execCommandApproval":
      return { decision: "denied" };
    default:
      throw new Error(`Unsupported server request: ${request.method}`);
  }
}
