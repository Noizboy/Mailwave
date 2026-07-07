"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type UploadState = "idle" | "dragging" | "uploading" | "success" | "error";

interface UploadResult {
  importId: string;
  filename: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

export function UploadCsvClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrors(["File must be a CSV."]);
      setState("error");
      return;
    }
    setSelectedFile(file);
    setErrors([]);
    setState("uploading");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.errors || [data.error || "Upload failed"]);
        setState("error");
        return;
      }
      setResult(data);
      setState("success");
      toast.success("CSV uploaded", `${data.rowCount} rows detected. Review and confirm before importing.`);
    } catch {
      setErrors(["Network error. Please try again."]);
      setState("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setState("idle");
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleContinue = () => {
    if (result) router.push(`/import/${result.importId}`);
  };

  const handleReset = () => {
    setState("idle");
    setSelectedFile(null);
    setResult(null);
    setErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Import contacts from CSV</CardTitle>
          <CardDescription>
            CSV must include at least one email column. Headers are detected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state !== "success" ? (
            <>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors sm:py-12",
                  state === "dragging"
                    ? "border-primary bg-primary/5"
                    : "border-input bg-muted/30 hover:border-primary hover:bg-primary/5"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setState("dragging");
                }}
                onDragLeave={() => setState("idle")}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                disabled={state === "uploading"}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                <UploadCloud className="h-10 w-10 text-primary" strokeWidth={1.5} />
                <div className="text-sm font-semibold text-foreground">
                  {selectedFile ? selectedFile.name : "Drag & drop your CSV here"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                    : "or click to browse"}
                </div>
                <div className="mt-2 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  {state === "uploading" ? "Uploading…" : "Select CSV"}
                </div>
              </button>

              {errors.length > 0 && (
                <Alert variant="destructive">
                  {errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </Alert>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 sm:contents">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold text-emerald-900">
                    {result?.filename}
                  </div>
                  <div className="text-xs text-emerald-700">
                    {result?.rowCount} rows · {result?.validCount} valid ·{" "}
                    {(result?.invalidCount ?? 0) + (result?.duplicateCount ?? 0)} issues
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:shrink-0">
                <Button variant="outline" onClick={handleReset}>
                  Upload another
                </Button>
                <Button onClick={handleContinue}>
                  Continue to Review
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Required</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground">
            email column · UTF-8 encoding · max 50 MB
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recommended columns</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground">
            first_name · last_name · company · job_title · ai_hint
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
