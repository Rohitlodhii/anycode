import type {
  ClientNotification,
  ClientRequest,
  InitializeResponse,
  RequestId,
  ServerNotification,
  ServerRequest,
} from "@/codex-schema";
import { CodexProcess } from "./CodexProcess";

type JsonRpcSuccess = {
  id: RequestId;
  result: unknown;
};

type JsonRpcError = {
  error: {
    code: number;
    data?: unknown;
    message: string;
  };
  id: RequestId;
};

type JsonRpcMessage = JsonRpcError | JsonRpcSuccess | ServerNotification | ServerRequest;

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

export class CodexRpc {
  private nextId = 1;
  private readonly pending = new Map<RequestId, PendingRequest>();
  private readonly process: CodexProcess;

  onNotification?: (message: ServerNotification) => void;
  onServerRequest?: (message: ServerRequest) => void | Promise<void>;
  onStderr?: (chunk: string) => void;

  constructor(codexBin = "codex") {
    this.process = new CodexProcess(codexBin);
    this.process.on("message", (message) => {
      void this.route(message as JsonRpcMessage);
    });
    this.process.on("error", (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.onStderr?.(error.message);
    });
    this.process.on("stderr", (chunk) => {
      this.onStderr?.(chunk);
    });
    this.process.on("exit", (code) => {
      const error = new Error(`Codex process exited with code ${code ?? "unknown"}`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
  }

  async initialize(clientName: string, version: string) {
    console.log("[CodexDebug][Rpc] initialize:start", { clientName, version });
    const response = await this.request<InitializeResponse>("initialize", {
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: null,
      },
      clientInfo: {
        name: clientName,
        title: "Anycode",
        version,
      },
    });

    this.notify("initialized");
    console.log("[CodexDebug][Rpc] initialize:done", response);
    return response;
  }

  kill() {
    this.process.kill();
  }

  notify(method: ClientNotification["method"], params?: unknown) {
    console.log("[CodexDebug][Rpc] notify", { method, params });
    if (typeof params === "undefined") {
      this.process.send({ method });
      return;
    }

    this.process.send({ method, params });
  }

  request<TResponse>(
    method: ClientRequest["method"],
    params: Extract<ClientRequest, { method: typeof method }>["params"]
  ) {
    const id = this.nextId++;
    console.log("[CodexDebug][Rpc] request:start", { id, method, params });

    return new Promise<TResponse>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: resolve as (value: unknown) => void,
      });
      this.process.send({ id, method, params });
    });
  }

  respond(id: RequestId, result: unknown) {
    this.process.send({ id, result });
  }

  respondError(id: RequestId, code: number, message: string, data?: unknown) {
    this.process.send({
      error: {
        code,
        data,
        message,
      },
      id,
    });
  }

  private async route(message: JsonRpcMessage) {
    console.log("[CodexDebug][Rpc] route", message);
    if ("method" in message) {
      if ("id" in message) {
        await this.onServerRequest?.(message);
        return;
      }

      this.onNotification?.(message);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if ("error" in message) {
      console.error("[CodexDebug][Rpc] request:error", message);
      pending.reject(new Error(message.error.message));
      return;
    }

    console.log("[CodexDebug][Rpc] request:success", {
      id: message.id,
      result: message.result,
    });
    pending.resolve(message.result);
  }
}
