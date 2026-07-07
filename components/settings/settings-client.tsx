"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, Server, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "@/hooks/use-toast";

const TABS = [
  { key: "account", label: "Account" },
  { key: "smtp", label: "Mail Server" },
  { key: "ai", label: "AI Integration" },
  { key: "limits", label: "Sending Limits" },
  { key: "notifications", label: "Notifications" },
];

export function SettingsClient() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "account";
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Settings</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure your sending and AI integrations.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="smtp" forceMount className="hidden data-[state=active]:block"><SmtpSettings /></TabsContent>
        <TabsContent value="ai" forceMount className="hidden data-[state=active]:block"><AiSettings /></TabsContent>
        <TabsContent value="limits" forceMount className="hidden data-[state=active]:block"><SendingLimitsSettings /></TabsContent>
        <TabsContent value="notifications" forceMount className="hidden data-[state=active]:block"><NotificationsSettings /></TabsContent>
        <TabsContent value="account" forceMount className="hidden data-[state=active]:block"><AccountSettings /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---- SMTP Tab ----

interface SmtpData {
  id?: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  encryption?: string;
  status?: string;
  testedAt?: string | null;
}

type SmtpProvider = "gmail" | "outlook" | "custom";

const PROVIDER_PRESETS: Record<SmtpProvider, Partial<SmtpData>> = {
  gmail: { host: "smtp.gmail.com", port: 587, encryption: "tls" },
  outlook: { host: "smtp-mail.outlook.com", port: 587, encryption: "tls" },
  custom: { port: 587, encryption: "tls" },
};

const PROVIDER_LABELS: Record<SmtpProvider, string> = {
  gmail: "Gmail SMTP",
  outlook: "Outlook SMTP",
  custom: "SMTP Server",
};

function SmtpSettings() {
  const queryClient = useQueryClient();
  const [setupProvider, setSetupProvider] = useState<SmtpProvider | null>(null);

  const { data: config, isLoading } = useQuery<SmtpData | null>({
    queryKey: ["settings-smtp"],
    queryFn: async () => {
      const res = await fetch("/api/settings/smtp");
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

  if (!config) {
    return (
      <>
        <SmtpProviderCards onSelect={setSetupProvider} />
        <Dialog open={!!setupProvider} onOpenChange={(open) => !open && setSetupProvider(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {setupProvider ? PROVIDER_LABELS[setupProvider] : "Configure Mail Server"}
              </DialogTitle>
              <DialogDescription>
                Enter your mail server credentials to start sending emails.
              </DialogDescription>
            </DialogHeader>
            {setupProvider && (
              <SmtpFormFields
                defaultValues={PROVIDER_PRESETS[setupProvider]}
                existingConfig={null}
                onSaved={() => {
                  setSetupProvider(null);
                  queryClient.invalidateQueries({ queryKey: ["settings-smtp"] });
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">SMTP Configuration</CardTitle>
          {config.status && <StatusBadge status={config.status} />}
        </div>
      </CardHeader>
      <CardContent>
        <SmtpFormFields existingConfig={config} />
      </CardContent>
    </Card>
  );
}

function SmtpProviderCards({ onSelect }: { onSelect: (p: SmtpProvider) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Choose a mail server provider</CardTitle>
        <p className="text-sm text-muted-foreground">
          No outgoing mail server is configured yet. Select a provider to get started.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <ProviderCard
            icon={<Mail className="h-5 w-5" />}
            title="Gmail SMTP"
            description="Send via Google Gmail using an App Password"
            onClick={() => onSelect("gmail")}
          />
          <ProviderCard
            icon={<Send className="h-5 w-5" />}
            title="Outlook SMTP"
            description="Send via Microsoft Outlook or Office 365"
            onClick={() => onSelect("outlook")}
          />
          <ProviderCard
            icon={<Server className="h-5 w-5" />}
            title="SMTP Server"
            description="Connect any custom outgoing mail server"
            onClick={() => onSelect("custom")}
          />
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

function SmtpFormFields({
  defaultValues = {},
  existingConfig,
  onSaved,
}: {
  defaultValues?: Partial<SmtpData>;
  existingConfig: SmtpData | null;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
  const [password, setPassword] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [form, setForm] = useState<Partial<SmtpData>>(existingConfig ?? defaultValues);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(!!existingConfig);

  useEffect(() => {
    if (existingConfig && !loaded) {
      setForm(existingConfig);
      setLoaded(true);
    }
  }, [existingConfig]);

  const set = (key: string, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/settings/smtp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...(password ? { password } : {}) }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("SMTP settings saved", "Your outgoing mail server configuration has been updated.");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["settings-smtp"] });
      queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
      onSaved?.();
    } else {
      toast.error("Could not save SMTP settings", "Check your inputs and try again.");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    const res = await fetch("/api/settings/smtp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testEmail ? { testEmail } : {}),
    });
    setTesting(false);
    if (res.ok) {
      const msg = testEmail
        ? `Test email sent to ${testEmail}. Check your inbox.`
        : "Connection verified. Your mail server is ready.";
      toast.success("SMTP connected", msg);
    } else {
      const err = await res.json();
      toast.error("SMTP connection failed", err.error ?? "Check your host, port, and credentials.");
    }
    queryClient.invalidateQueries({ queryKey: ["settings-smtp"] });
    queryClient.invalidateQueries({ queryKey: ["smtp-status"] });
  };

  const isGmail = form.host === "smtp.gmail.com";

  return (
    <div className="space-y-4">
      {/* Host + Port */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <SettingField label="SMTP Host">
            <Input
              value={form.host ?? ""}
              onChange={(e) => set("host", e.target.value)}
              placeholder="smtp.gmail.com"
            />
          </SettingField>
        </div>
        <SettingField label="Port">
          <Input
            type="number"
            value={form.port ?? 587}
            onChange={(e) => set("port", parseInt(e.target.value))}
          />
        </SettingField>
      </div>

      {/* Encryption */}
      <SettingField label="Encryption">
        <Select value={form.encryption ?? "tls"} onValueChange={(v) => set("encryption", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tls">TLS — Port 587 (recommended)</SelectItem>
            <SelectItem value="ssl">SSL — Port 465</SelectItem>
            <SelectItem value="none">None (not recommended)</SelectItem>
          </SelectContent>
        </Select>
      </SettingField>

      {/* SMTP Username */}
      <SettingField label="SMTP Username">
        <Input
          value={form.username ?? ""}
          onChange={(e) => set("username", e.target.value)}
          placeholder="your.email@gmail.com"
          autoComplete="off"
        />
        {isGmail && (
          <p className="text-xs text-muted-foreground mt-1">
            Your full Gmail address used to authenticate the SMTP connection.
          </p>
        )}
      </SettingField>

      {/* App Password */}
      <SettingField label="App Password">
        <div className="relative">
          <Input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={existingConfig?.id ? "Leave blank to keep existing password" : "Enter password"}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {isGmail ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Gmail requires an App Password — not your regular Gmail password.</p>
            <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
              <li>Enable 2-Step Verification in your Google Account.</li>
              <li>Go to Google Account → Security → App Passwords.</li>
              <li>Create a password for &quot;Mail&quot; — Google will give you 16 characters.</li>
              <li>Paste those 16 characters here.</li>
            </ol>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            The password is encrypted and never shown after saving.
          </p>
        )}
      </SettingField>

      {/* From Name + From Email */}
      <div className="grid grid-cols-2 gap-4">
        <SettingField label="From Name">
          <Input
            value={form.fromName ?? ""}
            onChange={(e) => set("fromName", e.target.value)}
            placeholder="Acme Corp"
          />
        </SettingField>
        <SettingField label="From Email">
          <Input
            value={form.fromEmail ?? ""}
            onChange={(e) => set("fromEmail", e.target.value)}
            placeholder="hello@yourdomain.com"
          />
        </SettingField>
      </div>
      {isGmail && (
        <p className="text-xs text-muted-foreground -mt-2">
          The From Email can differ from your Gmail username (e.g.{" "}
          <span className="font-medium">hello@yourdomain.com</span>). Note that Gmail may
          override it with the authenticated address depending on your account settings.
        </p>
      )}


      {/* Test section */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Send a Test Email
        </p>
        <SettingField label="Test Email Address">
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Enter an address to receive a test email. Leave blank to only verify the connection
            without sending.
          </p>
        </SettingField>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...</>
          ) : (
            "Save Settings"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || !existingConfig?.id}
          title={!existingConfig?.id ? "Save settings first to enable testing" : undefined}
        >
          {testing ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Testing...</>
          ) : testEmail ? (
            "Send Test Email"
          ) : (
            "Test Connection"
          )}
        </Button>
      </div>

      {/* Status feedback */}
      {existingConfig?.status === "connected" && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Connection verified
          {existingConfig.testedAt && (
            <span className="text-muted-foreground">
              — {new Date(existingConfig.testedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
      {existingConfig?.status === "failed" && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <XCircle className="h-4 w-4 shrink-0" />
          Last test failed — check your credentials and try again.
        </div>
      )}
    </div>
  );
}

// ---- AI Tab ----

interface AiData {
  id?: string;
  provider?: string;
  model?: string | null;
  baseUrl?: string | null;
  status?: string;
  testedAt?: string | null;
}

function AiSettings() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [form, setForm] = useState<Partial<AiData>>(() =>
    queryClient.getQueryData<AiData | null>(["settings-ai"]) ?? { provider: "openai" }
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [initialized, setInitialized] = useState(() =>
    queryClient.getQueryData(["settings-ai"]) !== undefined
  );

  const { data: config, isLoading } = useQuery<AiData | null>({
    queryKey: ["settings-ai"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai");
      if (!res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (!initialized && !isLoading) {
      if (config) setForm(config);
      setInitialized(true);
    }
  }, [config, isLoading, initialized]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (isLoading || !initialized) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...(apiKey ? { apiKey } : {}) }),
    });
    if (res.ok) {
      toast.success("AI settings saved", "Your AI provider configuration has been updated.");
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["settings-ai"] });
    } else {
      toast.error("Could not save AI settings", "An unexpected error occurred. Check your inputs and try again.");
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    const res = await fetch("/api/settings/ai/test", { method: "POST" });
    if (res.ok) {
      toast.success("AI connected", "Test email generated successfully. Your AI provider is ready.");
    } else {
      const err = await res.json();
      toast.error("AI connection failed", err.error ?? "Check your provider, model, and API key.");
    }
    queryClient.invalidateQueries({ queryKey: ["settings-ai"] });
    queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    setTesting(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Configuration</CardTitle>
          {config?.status && <StatusBadge status={config.status} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingField label="AI Provider">
          <Select value={form.provider ?? "openai"} onValueChange={(v) => set("provider", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google_gemini">Google Gemini</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
              <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
            </SelectContent>
          </Select>
        </SettingField>
        <SettingField label="API Key">
          <Input
            type="password"
            value={config?.id && !apiKey ? "••••••••••••••••" : apiKey}
            onChange={(e) => {
              const v = e.target.value;
              setApiKey(v.startsWith("••••••••••••••••") ? v.slice(16) : v);
            }}
            onFocus={(e) => { if (config?.id && !apiKey) e.target.select(); }}
            placeholder="sk-..."
          />
        </SettingField>
        <SettingField label="Model">
          <Input
            value={form.model ?? ""}
            onChange={(e) => set("model", e.target.value)}
            placeholder="e.g. gpt-4o-mini, anthropic/claude-haiku-4-5 (OpenRouter uses hyphens)"
            required
          />
        </SettingField>
        {(form.provider === "custom" || form.provider === "openrouter") && (
          <SettingField label="Base URL">
            <Input
              value={form.baseUrl ?? ""}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://..."
            />
          </SettingField>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Settings"}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !config?.id}>
            {testing ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</> : "Test Connection"}
          </Button>
        </div>
        {config?.status === "connected" && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4" />
            Connection verified
            {config.testedAt && ` — ${new Date(config.testedAt).toLocaleString()}`}
          </div>
        )}
        {config?.status === "failed" && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <XCircle className="h-4 w-4" />
            Last test failed
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Sending Limits Tab ----

interface LimitsData {
  dailyLimit: number;
  hourlyLimit: number;
  suppressAfterEmails: number;
}

function SendingLimitsSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LimitsData | null>(() =>
    queryClient.getQueryData<LimitsData>(["settings-limits"]) ?? null
  );
  const [saving, setSaving] = useState(false);

  const { data: limitsData, isLoading } = useQuery<LimitsData>({
    queryKey: ["settings-limits"],
    queryFn: async () => {
      const res = await fetch("/api/settings/sending-limits");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (limitsData && form === null) {
      setForm(limitsData);
    }
  }, [limitsData]);

  const setNum = (key: keyof LimitsData, value: string) =>
    setForm((f) => f ? { ...f, [key]: parseInt(value) || 0 } : f);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const res = await fetch("/api/settings/sending-limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Sending limits saved", "New rate limits will apply to upcoming campaigns.");
      queryClient.invalidateQueries({ queryKey: ["settings-limits"] });
    } else {
      toast.error("Could not save limits", "An unexpected error occurred. Try again.");
    }
    setSaving(false);
  };

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sending Limits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <SettingField label="Max emails per day">
            <Input
              type="number"
              min={1}
              value={form.dailyLimit}
              onChange={(e) => setNum("dailyLimit", e.target.value)}
            />
          </SettingField>
          <SettingField label="Max emails per hour">
            <Input
              type="number"
              min={1}
              value={form.hourlyLimit}
              onChange={(e) => setNum("hourlyLimit", e.target.value)}
            />
          </SettingField>
        </div>
        <SettingField label="Auto-suppress after N emails">
          <Input
            type="number"
            min={1}
            value={form.suppressAfterEmails}
            onChange={(e) => setNum("suppressAfterEmails", e.target.value)}
          />
        </SettingField>
        <p className="text-xs text-muted-foreground">
          When a contact reaches this limit they are automatically marked as Suppressed and excluded from all future campaigns.
        </p>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Limits"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---- Account Tab ----

interface AccountData {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
}

function AccountSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState(() =>
    queryClient.getQueryData<AccountData>(["settings-account"])?.name ?? null
  );
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const { data: user, isLoading } = useQuery<AccountData>({
    queryKey: ["settings-account"],
    queryFn: async () => {
      const res = await fetch("/api/settings/account");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (user && name === null) {
      setName(user.name ?? "");
    }
  }, [user]);

  if (isLoading || name === null) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const handleSaveProfile = async () => {
    setSaving(true);
    const res = await fetch("/api/settings/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      toast.success("Profile updated", "Your display name has been saved.");
      queryClient.invalidateQueries({ queryKey: ["settings-account"] });
    } else {
      toast.error("Could not update profile", "An unexpected error occurred. Try again.");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error("Passwords don't match", "The new password and confirmation must be identical.");
      return;
    }
    setChangingPw(true);
    const res = await fetch("/api/settings/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    if (res.ok) {
      toast.success("Password changed", "Your new password is active. Use it on your next login.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } else {
      const err = await res.json();
      toast.error("Could not change password", err.error ?? "Check your current password and try again.");
    }
    setChangingPw(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Full Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </SettingField>
          <SettingField label="Email">
            <Input value={user?.email ?? ""} disabled className="bg-gray-50 text-gray-500" />
          </SettingField>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Current Password">
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
            />
          </SettingField>
          <SettingField label="New Password">
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
          </SettingField>
          <SettingField label="Confirm New Password">
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
            />
          </SettingField>
          <Button
            onClick={handleChangePassword}
            disabled={changingPw || !currentPw || !newPw || !confirmPw}
          >
            {changingPw ? <><Loader2 className="h-4 w-4 animate-spin" /> Changing...</> : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Shared helpers ----

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---- Notifications Tab ----

const NOTIF_DEFAULTS: Record<string, boolean> = {
  campaign_complete: true,
  campaign_error: true,
  ai_email_ready: false,
  ai_email_error: true,
  email_bounced: true,
  daily_digest: false,
  system_alerts: true,
  low_credits: true,
};

// system_alerts and low_credits have no backend implementation yet
const RESERVED_KEYS = new Set(["system_alerts", "low_credits"]);

function NotificationsSettings() {
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const { data: prefs, isLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["settings-notification-prefs"],
    queryFn: async () => {
      const res = await fetch("/api/settings/notification-preferences");
      if (!res.ok) throw new Error("Failed to load preferences");
      return res.json();
    },
  });

  const merged = { ...NOTIF_DEFAULTS, ...prefs, ...optimistic };

  const toggle = async (key: string) => {
    const newValue = !merged[key];
    setOptimistic((o) => ({ ...o, [key]: newValue }));
    try {
      const res = await fetch("/api/settings/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: key, inApp: newValue }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: ["settings-notification-prefs"] });
    } catch {
      // Revert optimistic update on error
      setOptimistic((o) => ({ ...o, [key]: !newValue }));
      toast.error("Could not save preference", "Try again.");
    }
  };

  const groups = [
    {
      label: "Campaigns",
      items: [
        {
          key: "campaign_complete",
          label: "Campaign completed",
          description: "Notify me when all emails in a campaign have been sent.",
        },
        {
          key: "campaign_error",
          label: "Campaign error",
          description: "Notify me when a campaign fails to send due to a configuration problem.",
        },
      ],
    },
    {
      label: "AI",
      items: [
        {
          key: "ai_email_ready",
          label: "AI emails ready for review",
          description: "Notify me when AI has finished generating emails and they are ready to review.",
        },
        {
          key: "ai_email_error",
          label: "AI generation failed",
          description: "Notify me when AI email generation fails, for example due to an API error.",
        },
      ],
    },
    {
      label: "Delivery",
      items: [
        {
          key: "email_bounced",
          label: "Email bounced",
          description: "Notify me when an email is rejected by the recipient's mail server.",
        },
        {
          key: "daily_digest",
          label: "Daily delivery digest",
          description: "Receive a daily summary of emails sent and failed across all campaigns.",
        },
      ],
    },
    {
      label: "System",
      items: [
        {
          key: "system_alerts",
          label: "System alerts",
          description: "Important notices about your account, such as security or service updates.",
        },
        {
          key: "low_credits",
          label: "Low sending credits",
          description: "Notify me when my remaining sending quota is running low.",
        },
      ],
    },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <Card key={g.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{g.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.items.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-56 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-5 w-9 rounded-full bg-muted animate-pulse mt-0.5 shrink-0" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <Card key={g.label}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {g.items.map((item) => {
              const reserved = RESERVED_KEYS.has(item.key);
              return (
                <div key={item.key} className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {item.label}
                      {reserved && (
                        <span className="text-xs font-normal text-muted-foreground">(coming soon)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={!!merged[item.key]}
                    onCheckedChange={() => !reserved && toggle(item.key)}
                    disabled={reserved}
                    aria-label={item.label}
                    className="mt-0.5 shrink-0"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
