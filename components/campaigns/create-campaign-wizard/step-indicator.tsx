import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./model";

export function StepIndicator({ step }: { step: number }) {
  return <ol className="flex items-center gap-0">
    {STEPS.map((item, index) => {
      const isDone = step > item.id;
      const isActive = step === item.id;
      return <li key={item.id} className={cn("flex items-center", index < STEPS.length - 1 && "flex-1")}>
        <div className="flex items-center gap-2">
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", isDone || isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{isDone ? <Check className="h-3.5 w-3.5" /> : item.id}</div>
          <span className={cn("whitespace-nowrap text-xs font-medium", isActive && "text-foreground", isDone && "text-muted-foreground", !isActive && !isDone && "text-muted-foreground/60")}>{item.label}</span>
        </div>
        {index < STEPS.length - 1 && <div className={cn("mx-2 h-px flex-1", isDone ? "bg-foreground" : "bg-border")} />}
      </li>;
    })}
  </ol>;
}
