import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/utils/tailwind";

interface LoadingScreenProps {
  status: string;
  error?: string;
  onRetry?: () => void;
  isVisible?: boolean;
}

export function LoadingScreen({
  status,
  error,
  onRetry,
  isVisible = true,
}: LoadingScreenProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-500",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <div className="flex flex-col items-center gap-4">
        {/* App logo - using Sparkles icon as placeholder */}
        <Sparkles className="h-16 w-16 text-primary" />

        {error ? (
          <>
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-destructive text-center max-w-md">{error}</p>
            {onRetry && (
              <Button onClick={onRetry} variant="default">
                Retry
              </Button>
            )}
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground text-center">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
