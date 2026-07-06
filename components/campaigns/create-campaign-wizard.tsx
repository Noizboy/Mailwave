"use client";

import { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface CampaignForWizard {
  id: string;
  name: string;
  listId: string;
  goal?: string | null;
  product?: string | null;
  cta?: string | null;
  tone?: string | null;
  language?: string | null;
  emailLength?: string | null;
  systemPrompt?: string | null;
  intervalType: string;
  minInterval: number;
  maxInterval: number;
  scheduledAt?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
}

const wizardSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  listId: z.string().min(1, "Please select a list"),
  goal: z.string().optional(),
  product: z.string().optional(),
  cta: z.string().optional(),
  tone: z.string().optional(),
  language: z.string(),
  emailLength: z.string(),
  systemPrompt: z.string().optional(),
  intervalType: z.enum(["fixed", "random"]),
  minInterval: z.number().int().min(1),
  maxInterval: z.number().int().min(1),
  scheduledAt: z.string().optional(),
  aiProvider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom", ""]).optional(),
  aiModel: z.string().optional(),
});

type WizardData = z.infer<typeof wizardSchema>;

const STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Instructions" },
  { id: 3, label: "Sending" },
  { id: 4, label: "Review" },
];

interface ListOption {
  id: string;
  name: string;
  totalContacts: number;
  subscribedContacts: number;
}

async function fetchLists(): Promise<ListOption[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function CreateCampaignWizard({ campaign }: { campaign?: CampaignForWizard } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const defaultListId = searchParams.get("listId") ?? "";

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);

  const { data: lists = [] } = useQuery({ queryKey: ["lists"], queryFn: fetchLists });

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: campaign ? {
      name: campaign.name,
      listId: campaign.listId,
      goal: campaign.goal ?? "",
      product: campaign.product ?? "",
      cta: campaign.cta ?? "",
      tone: campaign.tone ?? "professional",
      language: campaign.language ?? "en",
      emailLength: campaign.emailLength ?? "medium",
      systemPrompt: campaign.systemPrompt ?? "",
      intervalType: (campaign.intervalType as "fixed" | "random") ?? "random",
      minInterval: campaign.minInterval ?? 3,
      maxInterval: campaign.maxInterval ?? 8,
      scheduledAt: campaign.scheduledAt ?? "",
      aiProvider: (campaign.aiProvider as WizardData["aiProvider"]) ?? "",
      aiModel: campaign.aiModel ?? "",
    } : {
      name: "",
      listId: defaultListId,
      goal: "",
      product: "",
      cta: "",
      tone: "professional",
      language: "en",
      emailLength: "medium",
      systemPrompt: "",
      intervalType: "random",
      minInterval: 3,
      maxInterval: 8,
      scheduledAt: "",
      aiProvider: "",
      aiModel: "",
    },
  });

  const { register, handleSubmit, formState: { errors }, trigger, setValue, control, reset } = form;

  useEffect(() => {
    if (step === 4) {
      setReviewReady(false);
      const t = setTimeout(() => setReviewReady(true), 300);
      return () => clearTimeout(t);
    } else {
      setReviewReady(false);
    }
  }, [step]);

  const intervalType = useWatch({ control, name: "intervalType" });
  const minInterval = useWatch({ control, name: "minInterval" });
  const maxInterval = useWatch({ control, name: "maxInterval" });
  const selectedListId = useWatch({ control, name: "listId" });
  const tone = useWatch({ control, name: "tone" });
  const language = useWatch({ control, name: "language" });
  const emailLength = useWatch({ control, name: "emailLength" });
  const selectedList = lists.find((l) => l.id === selectedListId);

  const stepFields: Record<number, Array<keyof WizardData>> = {
    1: ["name", "listId"],
    2: ["goal", "product", "cta", "tone", "language", "emailLength", "systemPrompt"],
    3: ["intervalType", "minInterval", "maxInterval", "scheduledAt"],
  };

  const goNext = async () => {
    const valid = await trigger(stepFields[step]);
    if (valid) setStep((s) => Math.min(s + 1, 4));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const submitCampaign = async (data: WizardData) => {
    if (step !== 4) return;
    setSubmitting(true);
    const payload = {
      ...data,
      aiProvider: data.aiProvider || undefined,
      aiModel: data.aiModel || undefined,
      scheduledAt: data.scheduledAt || undefined,
      status: "pending" as const,
    };

    if (campaign) {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
        toast.success("Campaign updated", "Your campaign is ready. Generate emails to get started.");
        router.push(`/campaigns/${campaign.id}`);
      } else if (res.status === 409) {
        form.setError("name", { message: "A campaign with that name already exists" });
        setStep(1);
        setSubmitting(false);
      } else {
        toast.error("Could not update campaign", "Check your inputs and try again.");
        setSubmitting(false);
      }
      return;
    }

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign created", "Your campaign has been saved. Generate emails to get started.");
      router.push(`/campaigns/${created.id}`);
    } else if (res.status === 409) {
      form.setError("name", { message: "A campaign with that name already exists" });
      setStep(1);
      setSubmitting(false);
    } else {
      toast.error("Could not create campaign", "Check your inputs and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Step indicators */}
      <ol className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const isDone = step > s.id;
          const isActive = step === s.id;
          return (
            <li
              key={s.id}
              className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isDone || isActive
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : s.id}
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs font-medium",
                    isActive && "text-foreground",
                    isDone && "text-muted-foreground",
                    !isActive && !isDone && "text-muted-foreground/60"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-px flex-1",
                    isDone ? "bg-foreground" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <form onSubmit={handleSubmit(submitCampaign)}>
        <Card>
          <CardContent className="space-y-5 p-6">
            {step === 1 && (
              <>
                <StepTitle>Campaign Details</StepTitle>
                <Field label="Campaign Name" error={errors.name?.message}>
                  <Input {...register("name")} placeholder="e.g. Q1 Outreach — Tech Leaders" autoFocus />
                </Field>
                <Field label="Contact List" error={errors.listId?.message}>
                  <Select
                    value={selectedListId}
                    onValueChange={(v) => setValue("listId", v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a list..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lists.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.subscribedContacts} subscribed / {l.totalContacts} total)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedList && selectedList.subscribedContacts < selectedList.totalContacts && (
                    <p className="mt-1 text-xs text-amber-600">
                      {selectedList.totalContacts - selectedList.subscribedContacts} contacts have issues and will be skipped.
                    </p>
                  )}
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <StepTitle>AI Instructions</StepTitle>
                <p className="text-sm text-muted-foreground">
                  Tell the AI what this campaign is about. The more context you give, the better the personalization.
                </p>
                <Field
                  label="Campaign Goal"
                  description="What do you want to achieve with this campaign? The AI will write every email with this objective in mind."
                >
                  <Input {...register("goal")} placeholder="e.g. Get founders to book a 20-min discovery call" />
                </Field>
                <Field
                  label="Product / Service"
                  description="Name and one-line description of what you're promoting. Used to make each email feel relevant."
                >
                  <Input {...register("product")} placeholder="e.g. MailWave — AI-powered cold email platform for B2B teams" />
                </Field>
                <Field
                  label="Call-to-Action"
                  description="The single action you want recipients to take. Be specific — vague CTAs get ignored."
                >
                  <Input {...register("cta")} placeholder="e.g. Reply with 'interested' to get a personalized demo" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tone">
                    <Select value={tone} onValueChange={(v) => setValue("tone", v)}>
                      <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["professional", "friendly", "casual", "formal", "direct"].map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Email Length">
                    <Select value={emailLength} onValueChange={(v) => setValue("emailLength", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short (1-2 paragraphs)</SelectItem>
                        <SelectItem value="medium">Medium (3-4 paragraphs)</SelectItem>
                        <SelectItem value="long">Long (5+ paragraphs)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Language">
                  <Select value={language} onValueChange={(v) => setValue("language", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="System Prompt"
                  description="Optional. Override or extend the default AI behavior with your own rules."
                  error={errors.systemPrompt?.message}
                >
                  <Textarea
                    {...register("systemPrompt")}
                    placeholder="e.g. Always open with a reference to the recipient's industry. Never use the phrase 'I hope this email finds you well'."
                    rows={5}
                  />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <StepTitle>Sending Settings</StepTitle>
                <Field label="Interval Type" description="Controls how long the system waits between sending each email. Random intervals mimic human behavior and reduce spam-filter risk; fixed intervals send on a precise schedule.">
                  <Select
                    value={intervalType}
                    onValueChange={(v) => setValue("intervalType", v as "fixed" | "random")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="random">Random interval (humanized)</SelectItem>
                      <SelectItem value="fixed">Fixed interval</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {intervalType === "random" ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <Label>Sending Interval (minutes)</Label>
                      <span className="text-xs text-muted-foreground">
                        {minInterval}–{maxInterval} min
                      </span>
                    </div>
                    <div className="relative flex h-8 items-center">
                      {/* Track background */}
                      <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted" />
                      {/* Active range highlight */}
                      <div
                        className="absolute h-1.5 rounded-full bg-foreground"
                        style={{
                          left: `${((minInterval - 1) / 59) * 100}%`,
                          right: `${100 - ((maxInterval - 1) / 59) * 100}%`,
                        }}
                      />
                      {/* Min thumb circle */}
                      <div
                        className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none"
                        style={{ left: `${((minInterval - 1) / 59) * 100}%` }}
                      />
                      {/* Max thumb circle */}
                      <div
                        className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none"
                        style={{ left: `${((maxInterval - 1) / 59) * 100}%` }}
                      />
                      {/* Hidden inputs for interaction */}
                      <input
                        type="range"
                        min={1}
                        max={60}
                        value={minInterval}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setValue("minInterval", Math.min(v, maxInterval - 1));
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
                          setValue("maxInterval", Math.max(v, minInterval + 1));
                        }}
                        className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>1 min</span>
                      <span>60 min</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Emails will be sent at a random time within this range, making the campaign appear more natural to spam filters.</p>
                  </div>
                ) : (
                  <Field label="Interval (minutes)" description="Exact number of minutes to wait between each sent email." error={errors.minInterval?.message}>
                    <Input type="number" {...register("minInterval", { valueAsNumber: true })} min={1} />
                  </Field>
                )}

                <Field label="Schedule start" description="Leave blank to start immediately after approval.">
                  <Input type="datetime-local" {...register("scheduledAt")} />
                </Field>
              </>
            )}

            {step === 4 && (
              <>
                <StepTitle>{campaign ? "Review & Update" : "Confirm & Create"}</StepTitle>
                <Alert variant="success" hideIcon={false}>
                  {campaign
                    ? "Review your changes. Click 'Update Campaign' to save."
                    : "Campaign is ready to be created. AI generation will start after saving."}
                </Alert>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {(
                    [
                      ["Name", form.getValues("name")],
                      ["List", selectedList?.name ?? form.getValues("listId")],
                      ["Tone", form.getValues("tone") ?? "professional"],
                      ["Email length", form.getValues("emailLength")],
                      [
                        "Interval",
                        intervalType === "random"
                          ? `${minInterval}–${maxInterval} min (random)`
                          : `${minInterval} min (fixed)`,
                      ],
                      ...(form.getValues("goal") ? [["Goal", form.getValues("goal")!]] : []),
                      ...(form.getValues("product") ? [["Product", form.getValues("product")!]] : []),
                      ...(form.getValues("cta") ? [["CTA", form.getValues("cta")!]] : []),
                      ...(form.getValues("scheduledAt")
                        ? [["Scheduled start", new Date(form.getValues("scheduledAt")!).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })]]
                        : [["Start", "Immediately after approval"]]),
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-col gap-0.5 border-b border-border/60 pb-2"
                    >
                      <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="text-sm font-medium text-foreground">{value.charAt(0).toUpperCase() + value.slice(1)}</dd>
                    </div>
                  ))}
                  {form.getValues("systemPrompt") && (
                    <div className="col-span-full flex flex-col gap-0.5 border-b border-border/60 pb-2">
                      <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                        System Prompt
                      </dt>
                      <dd className="whitespace-pre-wrap text-sm font-medium text-foreground">
                        {form.getValues("systemPrompt")}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs text-muted-foreground">
                  {campaign
                    ? "Your campaign configuration will be updated."
                    : "Campaign will be created and ready for AI email generation."}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1}
          >
            Back
          </Button>
          <div className="flex gap-2">
            {step < 4 ? (
              <Button type="button" onClick={goNext}>
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => handleSubmit(submitCampaign)()}
                disabled={submitting || !reviewReady}
              >
                {submitting
                  ? (campaign ? "Updating..." : "Creating...")
                  : (campaign ? "Update Campaign" : "Create Campaign")}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground">{children}</h2>;
}

function Field({
  label,
  description,
  error,
  required,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
