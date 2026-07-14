"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  FileText,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CampaignDetail,
  TONE_LABELS,
  LANGUAGE_LABELS,
  EMAIL_LENGTH_LABELS,
} from "./campaign-types";
import { useCampaignConfigActions } from "./use-campaign-config-actions";

// ---------------------------------------------------------------------------
// Shared display primitive
// ---------------------------------------------------------------------------

export function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CampaignDetailsPanel
// ---------------------------------------------------------------------------

interface CampaignDetailsPanelProps {
  campaign: CampaignDetail;
  campaignId: string;
  onSaved: () => void;
}

export function CampaignDetailsPanel({
  campaign,
  campaignId,
  onSaved,
}: CampaignDetailsPanelProps) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [product, setProduct] = useState("");
  const [cta, setCta] = useState("");

  const { savingDetails: saving, saveCampaignDetails } =
    useCampaignConfigActions(campaignId);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setName(campaign.name);
    setGoal(campaign.goal ?? "");
    setProduct(campaign.product ?? "");
    setCta(campaign.cta ?? "");
    setEditOpen(true);
  };

  const save = async () => {
    const ok = await saveCampaignDetails({
      name: name || undefined,
      goal: goal || undefined,
      product: product || undefined,
      cta: cta || undefined,
    });
    if (ok) {
      setEditOpen(false);
      onSaved();
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between px-5 py-4 select-none"
          aria-label="Campaign Details"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Campaign Details
            </span>
          </div>
          <div className="flex items-center gap-2">
            {campaign.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openEdit}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {open && (
          <div className="border-t px-5 py-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            <InfoField label="LIST">
              <Link
                href={`/lists/${campaign.list.id}`}
                className="text-primary hover:underline"
              >
                {campaign.list.name}
              </Link>
            </InfoField>
            <InfoField label="GOAL">{campaign.goal || "—"}</InfoField>
            <InfoField label="PRODUCT">{campaign.product || "—"}</InfoField>
            <InfoField label="CTA">{campaign.cta || "—"}</InfoField>
            <InfoField label="CREATED">
              {new Date(campaign.createdAt).toLocaleDateString()}
            </InfoField>
            {campaign.scheduledAt && (
              <InfoField label="SCHEDULED">
                {new Date(campaign.scheduledAt).toLocaleString()}
              </InfoField>
            )}
          </div>
        )}
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b p-6">
            <SheetTitle>Edit Campaign Details</SheetTitle>
            <SheetDescription>
              Update the campaign name, goal, product, and CTA.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Goal</Label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Book a demo call"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Mailwave — cold email platform"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CTA</Label>
              <Input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="e.g. Reply to this email to schedule a call"
              />
            </div>
          </div>
          <div className="border-t p-6">
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Details"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// AiInstructionsPanel
// ---------------------------------------------------------------------------

interface AiInstructionsPanelProps {
  campaign: CampaignDetail;
  campaignId: string;
  onSaved: () => void;
}

export function AiInstructionsPanel({
  campaign,
  campaignId,
  onSaved,
}: AiInstructionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState("");
  const [emailLength, setEmailLength] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const { savingAi: saving, saveAiInstructions } =
    useCampaignConfigActions(campaignId);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTone(campaign.tone ?? "");
    setLanguage(campaign.language ?? "");
    setEmailLength(campaign.emailLength ?? "");
    setSystemPrompt(campaign.systemPrompt ?? "");
    setEditOpen(true);
  };

  const save = async () => {
    const ok = await saveAiInstructions({
      tone: tone || undefined,
      language: language || undefined,
      emailLength: emailLength || undefined,
      systemPrompt: systemPrompt || undefined,
    });
    if (ok) {
      setEditOpen(false);
      onSaved();
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between px-5 py-4 select-none"
          aria-label="AI Instructions"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              AI Instructions
            </span>
          </div>
          <div className="flex items-center gap-2">
            {campaign.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openEdit}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {open && (
          <div className="border-t px-5 py-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            <InfoField label="TONE">
              {TONE_LABELS[campaign.tone ?? ""] ??
                campaign.tone ??
                "Professional"}
            </InfoField>
            <InfoField label="LANGUAGE">
              {LANGUAGE_LABELS[campaign.language ?? ""] ??
                campaign.language ??
                "English"}
            </InfoField>
            <InfoField label="EMAIL LENGTH">
              {EMAIL_LENGTH_LABELS[campaign.emailLength ?? ""] ??
                campaign.emailLength ??
                "Medium (100–200 words)"}
            </InfoField>
            {campaign.aiProvider && (
              <InfoField label="AI PROVIDER">{campaign.aiProvider}</InfoField>
            )}
            {campaign.aiModel && (
              <InfoField label="MODEL">{campaign.aiModel}</InfoField>
            )}
            {campaign.systemPrompt && (
              <div className="col-span-1 sm:col-span-2 md:col-span-3">
                <InfoField label="SYSTEM PROMPT">
                  <div className="max-h-36 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs leading-relaxed text-foreground/80">
                    <p className="whitespace-pre-wrap">
                      {campaign.systemPrompt}
                    </p>
                  </div>
                </InfoField>
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b p-6">
            <SheetTitle>Edit AI Instructions</SheetTitle>
            <SheetDescription>
              Adjust how AI generates emails for this campaign.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="friendly & direct">
                    Friendly &amp; direct
                  </SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="persuasive">Persuasive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email Length</Label>
              <Select value={emailLength} onValueChange={setEmailLength}>
                <SelectTrigger>
                  <SelectValue placeholder="Select length" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="very-short">
                    Very Short (under 50 words)
                  </SelectItem>
                  <SelectItem value="short">Short (60–100 words)</SelectItem>
                  <SelectItem value="medium">Medium (100–200 words)</SelectItem>
                  <SelectItem value="long">Long (200–350 words)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label>System Prompt</Label>
              <p className="text-xs text-muted-foreground">
                Optional. Override or extend the default AI behavior with your
                own rules.
              </p>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="e.g. Always open with a reference to the recipient's industry. Never use the phrase 'I hope this email finds you well'."
                rows={8}
                className="resize-none overflow-y-auto"
              />
            </div>
          </div>
          <div className="border-t p-6">
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Instructions"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// SendingConfigPanel
// ---------------------------------------------------------------------------

interface SendingConfigPanelProps {
  campaign: CampaignDetail;
  campaignId: string;
  onSaved: () => void;
}

export function SendingConfigPanel({
  campaign,
  campaignId,
  onSaved,
}: SendingConfigPanelProps) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [intervalType, setIntervalType] = useState<"fixed" | "random">(
    "random"
  );
  const [minInterval, setMinInterval] = useState(3);
  const [maxInterval, setMaxInterval] = useState(8);

  const { savingSending: saving, saveSendingConfig } =
    useCampaignConfigActions(campaignId);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIntervalType(campaign.intervalType as "fixed" | "random");
    setMinInterval(campaign.minInterval);
    setMaxInterval(campaign.maxInterval);
    setEditOpen(true);
  };

  const save = async () => {
    const ok = await saveSendingConfig({
      intervalType,
      minInterval,
      maxInterval: intervalType === "random" ? maxInterval : minInterval,
    });
    if (ok) {
      setEditOpen(false);
      onSaved();
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between px-5 py-4 select-none"
          aria-label="Sending Configuration"
        >
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Sending Configuration
            </span>
          </div>
          <div className="flex items-center gap-2">
            {campaign.status !== "completed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openEdit}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {open && (
          <div className="border-t px-5 py-4">
            {campaign.intervalType === "fixed" ? (
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <InfoField label="INTERVAL TYPE">Fixed</InfoField>
                <InfoField label="INTERVAL">
                  {campaign.minInterval} min
                </InfoField>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                <InfoField label="INTERVAL TYPE">Random</InfoField>
                <InfoField label="MIN INTERVAL">
                  {campaign.minInterval} min
                </InfoField>
                <InfoField label="MAX INTERVAL">
                  {campaign.maxInterval} min
                </InfoField>
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b p-6">
            <SheetTitle>Edit Sending Configuration</SheetTitle>
            <SheetDescription>
              Control how quickly emails are delivered.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Interval Type</Label>
              <Select
                value={intervalType}
                onValueChange={(v) =>
                  setIntervalType(v as "fixed" | "random")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">
                    Fixed — same delay between every email
                  </SelectItem>
                  <SelectItem value="random">
                    Random — random delay within a range
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {intervalType === "fixed" ? (
              <div className="space-y-1.5">
                <Label>Interval (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={minInterval}
                  onChange={(e) =>
                    setMinInterval(Math.max(1, parseInt(e.target.value) || 1))
                  }
                />
              </div>
            ) : (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>Sending Interval (minutes)</Label>
                  <span className="text-xs text-muted-foreground">
                    {minInterval}–{maxInterval} min
                  </span>
                </div>
                <div className="relative flex h-8 items-center">
                  <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted" />
                  <div
                    className="absolute h-1.5 rounded-full bg-foreground"
                    style={{
                      left: `${((minInterval - 1) / 59) * 100}%`,
                      right: `${100 - ((maxInterval - 1) / 59) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none"
                    style={{ left: `${((minInterval - 1) / 59) * 100}%` }}
                  />
                  <div
                    className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none"
                    style={{ left: `${((maxInterval - 1) / 59) * 100}%` }}
                  />
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={minInterval}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMinInterval(Math.min(v, maxInterval - 1));
                    }}
                    className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                  />
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={maxInterval}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMaxInterval(Math.max(v, minInterval + 1));
                    }}
                    className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>1 min</span>
                  <span>60 min</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Emails will be sent at a random time within this range,
                  making the campaign appear more natural to spam filters.
                </p>
              </div>
            )}
          </div>
          <div className="border-t p-6">
            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
