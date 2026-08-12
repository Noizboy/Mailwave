"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportReportButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open("/api/reports/export", "_blank")}
    >
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  );
}
