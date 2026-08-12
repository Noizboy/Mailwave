"use client";

import { Label } from "@/components/ui/label";

export function SettingField({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}
