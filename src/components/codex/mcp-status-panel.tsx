import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Wrench,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { openExternalLink } from "@/actions/shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/tailwind";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type McpAuthStatus = "unsupported" | "notLoggedIn" | "bearerToken" | "oAuth";

type McpServerEntry = {
  name: string;
  toolCount: number;
  authStatus: McpAuthStatus;
  isConnected: boolean;
};

type McpStatusPanelProps = {
  sessionId: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseServers(raw: unknown): McpServerEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const response = raw as { data?: unknown[] };
  if (!Array.isArray(response.data)) return [];

  return response.data.map((server: unknown) => {
    const s = server as {
      name?: string;
      tools?: Record<string, unknown>;
      authStatus?: McpAuthStatus;
    };
    const toolCount = s.tools ? Object.keys(s.tools).length : 0;
    const authStatus: McpAuthStatus = s.authStatus ?? "unsupported";
    // A server is "connected" if it responded (i.e. it's in the list)
    return {
      name: s.name ?? "Unknown",
      toolCount,
      authStatus,
      isConnected: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AuthStatusBadge({ status }: { status: McpAuthStatus }) {
  if (status === "oAuth" || status === "bearerToken") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
        <CheckCircle2 className="size-2.5" />
        Authenticated
      </span>
    );
  }
  if (status === "notLoggedIn") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
        <KeyRound className="size-2.5" />
        Login required
      </span>
    );
  }
  return null;
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full shrink-0",
        connected ? "bg-green-500" : "bg-muted-foreground/40"
      )}
    />
  );
}

type ServerRowProps = {
  server: McpServerEntry;
  sessionId: string;
  onOAuthLogin: (serverName: string) => void;
  isLoggingIn: boolean;
};

function ServerRow({ server, sessionId: _sessionId, onOAuthLogin, isLoggingIn }: ServerRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <ConnectionDot connected={server.isConnected} />
        <Server className="size-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
          {server.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wrench className="size-3" />
            {server.toolCount}
          </span>
          <AuthStatusBadge status={server.authStatus} />
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tools available</span>
            <span className="font-medium text-foreground">{server.toolCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Auth mode</span>
            <span className="font-medium text-foreground capitalize">{server.authStatus}</span>
          </div>

          {server.authStatus === "notLoggedIn" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1 h-7 w-full gap-1.5 text-xs"
              onClick={() => onOAuthLogin(server.name)}
              disabled={isLoggingIn}
              type="button"
            >
              {isLoggingIn ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ExternalLink className="size-3" />
              )}
              Login with OAuth
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function McpStatusPanel({ sessionId }: McpStatusPanelProps) {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingInServer, setLoggingInServer] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.codex.rpcCall(sessionId, "mcpServerStatus/list", {});
      setServers(parseServers(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP servers");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  // Listen for oauthLogin/completed events to refresh server list
  useEffect(() => {
    const unsub = window.codex.onEvent((payload) => {
      if (
        payload.agentId === sessionId &&
        payload.method === "mcpServer/oauthLogin/completed"
      ) {
        void fetchServers();
      }
    });
    return unsub;
  }, [sessionId, fetchServers]);

  async function handleOAuthLogin(serverName: string) {
    setLoggingInServer(serverName);
    try {
      const result = await window.codex.rpcCall(sessionId, "mcpServer/oauth/login", {
        name: serverName,
      });
      const response = result as { authorizationUrl?: string };
      if (response?.authorizationUrl) {
        await openExternalLink(response.authorizationUrl);
      }
    } catch (err) {
      console.error("OAuth login failed", err);
    } finally {
      setLoggingInServer(null);
    }
  }

  async function handleReloadConfig() {
    setIsReloading(true);
    try {
      await window.codex.rpcCall(sessionId, "config/mcpServer/reload", {});
      // Refresh server list after reload
      await fetchServers();
    } catch (err) {
      console.error("Reload MCP config failed", err);
    } finally {
      setIsReloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">MCP Servers</span>
          {servers.length > 0 && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {servers.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => void fetchServers()}
            disabled={isLoading}
            type="button"
            title="Refresh server list"
          >
            <RefreshCw className={cn("size-3", isLoading && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void handleReloadConfig()}
            disabled={isReloading}
            type="button"
          >
            {isReloading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Reload config
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading && servers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-muted/10 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading servers…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-3 text-sm text-red-400">
          <XCircle className="size-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Failed to load MCP servers</div>
            <div className="mt-0.5 text-xs text-red-400/70">{error}</div>
          </div>
        </div>
      ) : servers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-center">
          <AlertCircle className="size-5 text-muted-foreground/50" />
          <div className="text-sm text-muted-foreground">No MCP servers configured</div>
          <div className="text-xs text-muted-foreground/60">
            Add servers to your Codex config to enable additional tools.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((server) => (
            <ServerRow
              key={server.name}
              server={server}
              sessionId={sessionId}
              onOAuthLogin={(name) => void handleOAuthLogin(name)}
              isLoggingIn={loggingInServer === server.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
