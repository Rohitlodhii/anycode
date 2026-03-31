/**
 * Authentication status badge and login panel for the Codex session header.
 * Requirements: 16.1–16.4
 */

import { KeyRound, LogIn, User, UserX } from "lucide-react";
import { useState } from "react";
import { openExternalLink } from "@/actions/shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type AuthStatusBadgeProps = {
  sessionId: string;
  authState: AuthState;
  onSetAuthState: (auth: AuthState) => void;
};

export function AuthStatusBadge({
  sessionId,
  authState,
  onSetAuthState,
}: AuthStatusBadgeProps) {
  const [loginOpen, setLoginOpen] = useState(false);

  const label = getAuthLabel(authState);
  const isAuthenticated = authState !== null;

  return (
    <>
      <button
        type="button"
        onClick={() => setLoginOpen(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          isAuthenticated
            ? "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
            : "border-amber-500/40 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15"
        )}
        title={isAuthenticated ? "Auth status — click to manage" : "Not logged in — click to authenticate"}
      >
        <AuthIcon authState={authState} />
        <span>{label}</span>
      </button>

      <AuthLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        sessionId={sessionId}
        authState={authState}
        onSetAuthState={onSetAuthState}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Auth icon
// ---------------------------------------------------------------------------

function AuthIcon({ authState }: { authState: AuthState }) {
  if (authState === null) return <UserX className="size-3" />;
  if (authState.type === "apiKey") return <KeyRound className="size-3" />;
  return <User className="size-3" />;
}

// ---------------------------------------------------------------------------
// Label helper
// ---------------------------------------------------------------------------

function getAuthLabel(authState: AuthState): string {
  if (authState === null) return "Not logged in";
  if (authState.type === "apiKey") return "API Key";
  if (authState.type === "chatgpt") return authState.email || "ChatGPT";
  if (authState.type === "chatgptAuthTokens") return "ChatGPT";
  return "Unknown";
}

// ---------------------------------------------------------------------------
// Login dialog
// ---------------------------------------------------------------------------

type AuthLoginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  authState: AuthState;
  onSetAuthState: (auth: AuthState) => void;
};

function AuthLoginDialog({
  open,
  onOpenChange,
  sessionId,
  authState,
  onSetAuthState,
}: AuthLoginDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setError(null);
    setIsLoggingIn(true);
    try {
      // Store the API key via rpcCall — the agent will pick it up
      await window.codex.rpcCall(sessionId, "config/value/write", {
        key: "apiKey",
        value: apiKey.trim(),
      });
      onSetAuthState({ type: "apiKey" });
      setApiKey("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleChatGptLogin() {
    setError(null);
    setIsLoggingIn(true);
    try {
      const result = await window.codex.rpcCall(sessionId, "account/login/start", {
        type: "chatgpt",
      });
      const authUrl = (result as { authUrl?: string })?.authUrl;
      if (authUrl) {
        await openExternalLink(authUrl);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start ChatGPT login");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="size-4" />
            Authentication
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Current status */}
          {authState !== null && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Currently authenticated as:{" "}
              <span className="font-medium text-foreground">{getAuthLabel(authState)}</span>
            </div>
          )}

          {/* API key form */}
          <form onSubmit={(e) => void handleApiKeySubmit(e)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-input" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                OpenAI API Key
              </Label>
              <Input
                id="api-key-input"
                type="password"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={!apiKey.trim() || isLoggingIn}
            >
              <KeyRound className="size-3.5" />
              Save API Key
            </Button>
          </form>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-border/60" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border/60" />
          </div>

          {/* ChatGPT login */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void handleChatGptLogin()}
            disabled={isLoggingIn}
          >
            <User className="size-3.5" />
            Login with ChatGPT
          </Button>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
