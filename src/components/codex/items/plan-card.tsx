import { CheckCircle2, Circle, Loader2, ListTodo } from "lucide-react";
import type { PlanItem, PlanStep } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type PlanCardProps = {
  item: PlanItem;
};

export function PlanCard({ item }: PlanCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <ListTodo className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">Plan</span>
      </div>

      {item.explanation && (
        <p className="px-3 pt-2 text-xs text-muted-foreground">{item.explanation}</p>
      )}

      <ul className="px-3 py-2 space-y-1.5">
        {item.steps.map((step, index) => (
          <PlanStepRow key={`${step.step}-${index}`} step={step} />
        ))}
      </ul>
    </div>
  );
}

function PlanStepRow({ step }: { step: PlanStep }) {
  return (
    <li className="flex items-start gap-2">
      <StepIcon status={step.status} />
      <span
        className={cn(
          "text-xs leading-5",
          step.status === "completed" && "text-muted-foreground line-through",
          step.status === "inProgress" && "text-foreground font-medium",
          step.status === "pending" && "text-muted-foreground"
        )}
      >
        {step.step}
      </span>
    </li>
  );
}

function StepIcon({ status }: { status: PlanStep["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-3.5 text-green-500 shrink-0 mt-0.5" />;
  }
  if (status === "inProgress") {
    return <Loader2 className="size-3.5 text-blue-400 shrink-0 mt-0.5 animate-spin" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />;
}
