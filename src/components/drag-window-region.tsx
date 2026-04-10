import { type ReactNode, useEffect, useState } from "react";
import { getPlatform } from "@/actions/app";
import { closeWindow, maximizeWindow, minimizeWindow } from "@/actions/window";
import ToggleTheme from "@/components/toggle-theme";
import { cn } from "@/utils/tailwind";
import { logger } from "@/utils/logger";

interface DragWindowRegionProps {
  title?: ReactNode;
  center?: ReactNode;
  bottom?: ReactNode;
  className?: string;
  topRowClassName?: string;
  titleClassName?: string;
}

export default function DragWindowRegion({
  title,
  center,
  bottom,
  className,
  topRowClassName,
  titleClassName,
}: DragWindowRegionProps) {
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    logger.debug("[Platform] detect:start");

    getPlatform()
      .then((value) => {
        if (!active) {
          return;
        }

        logger.debug("[Platform] detect:success", value);
        setPlatform(value);
      })
      .catch((error) => {
        logger.error("[Platform] detect:error", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const isMacOS = platform === "darwin";

  return (
    <div className={cn("w-full border-b border-border bg-background", className)}>
      <div
        className={cn(
          "draglayer grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-3 px-3",
          topRowClassName
        )}
      >
        <div
          className={cn(
            "min-w-0 truncate font-display text-xs text-muted-foreground",
            titleClassName
          )}
        >
          {title}
        </div>
        <div className="no-drag flex min-w-0 items-center justify-center">
          {center}
        </div>
        <div className="flex items-center justify-end">
          {!isMacOS && <WindowButtons />}
        </div>
      </div>
      {bottom ? (
        <div className="no-drag border-t border-border">{bottom}</div>
      ) : null}
    </div>
  );
}

function WindowButtons() {
  return (
    <div className="no-drag flex items-center">
      <ToggleTheme />
      <button
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={minimizeWindow}
        title="Minimize"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <rect fill="currentColor" height="1" width="10" x="1" y="6" />
        </svg>
      </button>
      <button
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={maximizeWindow}
        title="Maximize"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <rect
            fill="none"
            height="9"
            stroke="currentColor"
            width="9"
            x="1.5"
            y="1.5"
          />
        </svg>
      </button>
      <button
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
        onClick={closeWindow}
        title="Close"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <polygon
            fill="currentColor"
            fillRule="evenodd"
            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
          />
        </svg>
      </button>
    </div>
  );
}
