/**
 * Rate limit indicator for the Codex session header.
 * Shows a usage bar when usedPercent > 0, and a banner with countdown
 * when UsageLimitExceeded error occurs.
 * Requirements: 14.1, 14.2
 */

import { AlertTriangle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import type { RateLimit } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

// ---------------------------------------------------------------------------
// Rate limit indicator (header badge)
// ---------------------------------------------------------------------------

type RateLimitIndicatorProps = {
  rateLimits: RateLimit[];
};

export function RateLimitIndicator({ rateLimits }: RateLimitIndicatorProps) {
  const visible = rateLimits.filter((r) => r.usedPercent > 0);
  if (visible.length === 0) return null;

  // Show the highest usage limit
  const top = visible.reduce((a, b) => (a.usedPercent >= b.usedPercent ? a : b));
  const pct = Math.min(100, Math.round(top.usedPercent));
  const isHigh = pct >= 80;
  const isMed = pct >= 50 && pct < 80;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
        isHigh
          ? "border-red-500/40 bg-red-500/8 text-red-400"
          : isMed
            ? "border-amber-500/40 bg-amber-500/8 text-amber-400"
            : "border-border/60 bg-background/60 text-muted-foreground"
      )}
      title={`${top.limitName ?? top.limitId}: ${pct}% used`}
    >
      <div className="relative h-1.5 w-12 overflow-hidden rounded-full bg-current/20">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            isHigh ? "bg-red-400" : isMed ? "bg-amber-400" : "bg-muted-foreground/60"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage limit exceeded banner (shown in message list area)
// ---------------------------------------------------------------------------

type UsageLimitBannerProps = {
  rateLimits: RateLimit[];
  errorMessage?: string;
};

export function UsageLimitBanner({ rateLimits, errorMessage }: UsageLimitBannerProps) {
  // Only show when the error is UsageLimitExceeded
  if (!errorMessage?.includes("UsageLimitExceeded")) return null;

  // Find the limit with the soonest reset time
  const exceeded = rateLimits.length > 0
    ? rateLimits.reduce((a, b) => (a.resetsAt <= b.resetsAt ? a : b))
    : null;

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-red-300">Usage limit exceeded</div>
          {exceeded ? (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3 shrink-0" />
              <span>Resets in </span>
              <CountdownTimer resetsAt={exceeded.resetsAt} />
              {exceeded.limitName && (
                <span className="text-muted-foreground/70">
                  ({exceeded.limitName}: {Math.round(exceeded.usedPercent)}% used)
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              You have reached your usage limit. Please wait before sending more messages.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Countdown timer
// ---------------------------------------------------------------------------

function CountdownTimer({ resetsAt }: { resetsAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, resetsAt - Date.now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = Math.max(0, resetsAt - Date.now());
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [resetsAt, remaining]);

  const totalSecs = Math.ceil(remaining / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  if (totalSecs <= 0) return <span className="font-medium text-foreground">now</span>;

  return (
    <span className="font-medium text-foreground tabular-nums">
      {mins > 0 ? `${mins}m ` : ""}{secs}s
    </span>
  );
}
