"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, Mail, Send, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function SmtpSettings() {
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
  const [prevExisting, setPrevExisting] = useState(existingConfig);
  // Sync local form state when an existing config arrives asynchronously.
  // Adjusting state during render (gated on a prop-change check) avoids the
  // cascading-render pattern of calling setState synchronously in an effect.
  if (existingConfig !== prevExisting) {
    setPrevExisting(existingConfig);
    if (existingConfig && !loaded) {
      setForm(existingConfig);
      setLoaded(true);
    }
  }

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
