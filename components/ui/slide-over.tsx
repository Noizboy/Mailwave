"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
}

const widths = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

/**
 * Legacy slide-over kept as a thin wrapper. New code should prefer <Sheet />.
 */
export function SlideOver({ open, onClose, title, children, width = "md" }: SlideOverProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative ml-auto flex flex-col h-full w-full bg-background shadow-xl border-l",
          widths[width]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
          <button
            onClick={onClose}
            className="ml-auto rounded-sm p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
