"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingField } from "./setting-field";
import { toast } from "@/hooks/use-toast";

interface AiData {
  id?: string;
  provider?: string;
  model?: string | null;
  baseUrl?: string | null;
  status?: string;
  testedAt?: string | null;
}

type AiApiProvider = "openai" | "anthropic" | "google_gemini" | "openrouter" | "custom";

const AI_PROVIDERS: { value: AiApiProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google_gemini", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

export function AiSettings() {
  const queryClient = useQueryClient();

  const [selecting, setSelecting] = useState(false);
  const [setupProvider, setSetupProvider] = useState<AiApiProvider | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await fetch("/api/settings/ai", { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["settings-ai"] });
    queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    setDisconnecting(false);
  };

  const { data: config, isLoading } = useQuery<AiData | null>({
    queryKey: ["settings-ai"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai");
      if (!res.ok) return null;
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No provider configured yet, or user clicked "Switch provider"
  if (!config || selecting) {
    return (
      <>
        <AiProviderCards onSelectApiKey={(p) => setSetupProvider(p)} />
        <Dialog open={!!setupProvider} onOpenChange={(open) => !open && setSetupProvider(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {setupProvider
                  ? (AI_PROVIDERS.find((p) => p.value === setupProvider)?.label ?? "AI Provider")
                  : "Configure AI Provider"}
              </DialogTitle>
              <DialogDescription>
                Enter your API credentials to connect this provider.
              </DialogDescription>
            </DialogHeader>
            {setupProvider && (
              <AiApiKeyForm
                provider={setupProvider}
                existingConfig={config?.provider === setupProvider ? config : null}
                onSaved={() => {
                  setSetupProvider(null);
                  setSelecting(false);
                  queryClient.invalidateQueries({ queryKey: ["settings-ai"] });
                  queryClient.invalidateQueries({ queryKey: ["ai-status"] });
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const providerLabel =
    AI_PROVIDERS.find((p) => p.value === config.provider)?.label ?? config.provider;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Integration</CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect an AI provider to generate personalized emails for your campaigns.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-muted p-2 text-foreground">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">{providerLabel}</p>
                <p className="text-xs text-muted-foreground">API key</p>
              </div>
            </div>
            {config.status ? <StatusBadge status={config.status} /> : null}
          </div>

          {config.status === "connected" && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Connection verified
              {config.testedAt && (
                <span className="text-muted-foreground">
                  — {new Date(config.testedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
          {config.status === "failed" && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle className="h-4 w-4 shrink-0" />
              Last test failed — check your credentials and try again.
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setSetupProvider(config.provider as AiApiProvider)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Disconnecting...</>
                : "Disconnect"}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!setupProvider} onOpenChange={(open) => !open && setSetupProvider(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {setupProvider
                ? (AI_PROVIDERS.find((p) => p.value === setupProvider)?.label ?? "AI Provider")
                : "Configure AI Provider"}
            </DialogTitle>
            <DialogDescription>
              Enter your API credentials to connect this provider.
            </DialogDescription>
          </DialogHeader>
          {setupProvider && (
            <AiApiKeyForm
              provider={setupProvider}
              existingConfig={config?.provider === setupProvider ? config : null}
              onSaved={() => {
                setSetupProvider(null);
                queryClient.invalidateQueries({ queryKey: ["settings-ai"] });
                queryClient.invalidateQueries({ queryKey: ["ai-status"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AiProviderCards({
  onSelectApiKey,
}: {
  onSelectApiKey: (p: AiApiProvider) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Choose an AI provider</CardTitle>
        <p className="text-sm text-muted-foreground">
          No AI provider is configured yet. Select one to get started.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {AI_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.value}
              icon={<Server className="h-5 w-5" />}
              title={p.label}
              description="Connect with an API key"
              onClick={() => onSelectApiKey(p.value)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-lg border p-4 text-left hover:bg-muted/50 hover:border-foreground/20 transition-colors w-full"
    >
      <div className="rounded-md bg-muted p-2 text-foreground">{icon}</div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

function AiApiKeyForm({
  provider,
  existingConfig,
  onSaved,
}: {
  provider: AiApiProvider;
  existingConfig: AiData | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(existingConfig?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(existingConfig?.baseUrl ?? "");
  const [replaceKey, setReplaceKey] = useState(!existingConfig);
  const [savingStep, setSavingStep] = useState<"idle" | "saving" | "testing">("idle");

  const busy = savingStep !== "idle";

  const handleSave = async () => {
    if (!existingConfig && !apiKey) {
      toast.error("API key required", "Please enter your API key.");
      return;
    }
    setSavingStep("saving");
    const saveRes = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
        ...(replaceKey && apiKey ? { apiKey } : {}),
      }),
    });
    if (!saveRes.ok) {
      toast.error("Could not save AI settings", "Check your inputs and try again.");
      setSavingStep("idle");
      return;
    }

    setSavingStep("testing");
    const testRes = await fetch("/api/settings/ai/test", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["settings-ai"] });
    queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    setSavingStep("idle");

    if (testRes.ok) {
      toast.success("AI connected", "Connection verified. Your AI provider is ready.");
      onSaved();
    } else {
      const err = await testRes.json();
      toast.error("AI connection failed", err.error ?? "Check your provider, model, and API key.");
    }
  };

  return (
    <div className="space-y-4">
      <SettingField label="API Key">
        {!replaceKey ? (
          <div className="flex gap-2">
            <Input value="••••••••••••••••" disabled className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setReplaceKey(true)}>
              Replace
            </Button>
          </div>
        ) : (
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            autoFocus={!!existingConfig}
          />
        )}
      </SettingField>
      <SettingField label="Model">
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. gpt-4o-mini"
        />
      </SettingField>
      {(provider === "custom" || provider === "openrouter") && (
        <SettingField label="Base URL">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://..."
          />
        </SettingField>
      )}
      <div className="pt-1">
        <Button onClick={handleSave} disabled={busy} className="w-full">
          {savingStep === "saving" ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...</>
          ) : savingStep === "testing" ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Testing connection...</>
          ) : (
            "Save & Test Connection"
          )}
        </Button>
      </div>
    </div>
  );
}
