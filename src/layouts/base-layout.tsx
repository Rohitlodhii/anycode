import type React from "react";
import { useRouterState } from "@tanstack/react-router";
import DragWindowRegion from "@/components/drag-window-region";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const showDragRegion = !pathname.startsWith("/editor");

  return (
    <>
      {showDragRegion && (
        <DragWindowRegion
          title="Anycode"
          titleClassName="font-pixel text-[11px] uppercase tracking-[0.16em] text-foreground"
        />
      )}
      <main className={showDragRegion ? "h-screen p-2 pb-20" : "h-screen"}>
        {children}
      </main>
    </>
  );
}
