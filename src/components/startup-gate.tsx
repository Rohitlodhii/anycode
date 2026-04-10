import type React from "react";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/utils/tailwind";

export function StartupGate({
  isReady,
  children,
}: {
  isReady: boolean;
  children: React.ReactNode;
}) {
  const [minDelayDone, setMinDelayDone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMinDelayDone(true), 450);
    return () => window.clearTimeout(t);
  }, []);

  if (!isReady || !minDelayDone) {
    return (
      <div className="h-screen w-screen bg-background text-foreground">
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-3xl border border-border/60 bg-muted/10 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-background/80 shadow-sm">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight">
                  Anycode is starting…
                </div>
                <div className="text-xs text-muted-foreground">
                  Loading Codex and restoring sessions
                </div>
              </div>
              <Loader2 className={cn("ml-auto size-4 animate-spin text-muted-foreground")} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

