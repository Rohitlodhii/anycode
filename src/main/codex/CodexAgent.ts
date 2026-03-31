import { EventEmitter } from "node:events";
import type {
  ApplyPatchApprovalResponse,
  ExecCommandApprovalResponse,
  ServerNotification,
  ServerRequest,
  v2,
} from "@/codex-schema";
import { CodexRpc } from "./CodexRpc";

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
  private readonly rpc: CodexRpc;
  private threadId = "";

  onRequest?: (request: ServerRequest) => Promise<CodexServerRequestResult>;

  constructor(id: string, codexBin = "codex") {
    super();
    this.id = id;
    console.log("[CodexDebug][Agent] create", { codexBin, id });
    this.rpc = new CodexRpc(codexBin);
    this.rpc.onNotification = (message) => {
      console.log("[CodexDebug][Agent] notification", { id: this.id, message });
      this.emit("event", message);
    };
    this.rpc.onServerRequest = async (message) => {
      console.log("[CodexDebug][Agent] serverRequest", { id: this.id, message });
      try {
        const result = this.onRequest
          ? await this.onRequest(message)
          : getDefaultRequestResult(message);
        console.log("[CodexDebug][Agent] serverRequest:result", {
          id: this.id,
          result,
        });
        this.rpc.respond(message.id, result);
      } catch (error) {
        console.error("[CodexDebug][Agent] serverRequest:error", {
          error,
          id: this.id,
        });
        this.rpc.respondError(
          message.id,
          -32_000,
          error instanceof Error ? error.message : "Failed to resolve request"
        );
      }
    };
    this.rpc.onStderr = (chunk) => {
      console.error("[CodexDebug][Agent] stderr", { chunk, id: this.id });
      this.emit("error", new Error(chunk.trim() || "Codex emitted stderr output"));
    };
  }

  destroy() {
    this.rpc.kill();
  }

  async listModels() {
    console.log("[CodexDebug][Agent] listModels:start", { id: this.id });
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

    console.log("[CodexDebug][Agent] listModels:done", {
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

  async send(text: string, options?: { model?: string | null }) {
    if (!this.threadId) {
      throw new Error("Codex agent has not been started yet.");
    }

    console.log("[CodexDebug][Agent] send", {
      id: this.id,
      model: options?.model ?? null,
      text,
      threadId: this.threadId,
    });
    return this.rpc.request<v2.TurnStartResponse>("turn/start", {
      approvalPolicy: null,
      approvalsReviewer: null,
      collaborationMode: null,
      cwd: null,
      effort: null,
      input: [
        {
          text,
          text_elements: [],
          type: "text",
        },
      ],
      model: options?.model ?? null,
      outputSchema: null,
      personality: null,
      sandboxPolicy: null,
      serviceTier: null,
      summary: null,
      threadId: this.threadId,
    });
  }

  async start(options: StartOptions) {
    console.log("[CodexDebug][Agent] start", { id: this.id, options });
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
    this.threadId = response.thread.id;
    console.log("[CodexDebug][Agent] started", {
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
