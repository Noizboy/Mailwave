"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { DetailsStep } from "./create-campaign-wizard/details-step";
import { InstructionsStep } from "./create-campaign-wizard/instructions-step";
import { fetchLists, stepFields, wizardSchema, type CampaignForWizard, type WizardData } from "./create-campaign-wizard/model";
import { ReviewStep } from "./create-campaign-wizard/review-step";
import { SendingStep } from "./create-campaign-wizard/sending-step";
import { StepIndicator } from "./create-campaign-wizard/step-indicator";

export function CreateCampaignWizard({ campaign }: { campaign?: CampaignForWizard } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const { data: lists = [] } = useQuery({ queryKey: ["lists"], queryFn: fetchLists });
  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: campaign ? campaignValues(campaign) : newCampaignValues(searchParams.get("listId") ?? ""),
  });

  useEffect(() => {
    if (step !== 4) return;
    const timeout = setTimeout(() => setReviewReady(true), 300);
    return () => clearTimeout(timeout);
  }, [step]);

  const intervalType = useWatch({ control: form.control, name: "intervalType" });
  const minInterval = useWatch({ control: form.control, name: "minInterval" });
  const maxInterval = useWatch({ control: form.control, name: "maxInterval" });
  const selectedListId = useWatch({ control: form.control, name: "listId" });
  const tone = useWatch({ control: form.control, name: "tone" });
  const language = useWatch({ control: form.control, name: "language" });
  const emailLength = useWatch({ control: form.control, name: "emailLength" });

  const goNext = async () => {
    if (await form.trigger(stepFields[step])) {
      setReviewReady(false);
      setStep((current) => Math.min(current + 1, 4));
    }
  };
  const goBack = () => {
    setReviewReady(false);
    setStep((current) => Math.max(current - 1, 1));
  };
  const submitCampaign = async (data: WizardData) => {
    if (step !== 4) return;
    setSubmitting(true);
    const payload = { ...data, aiProvider: data.aiProvider || undefined, aiModel: data.aiModel || undefined, scheduledAt: data.scheduledAt || undefined, status: "pending" as const };
    const url = campaign ? `/api/campaigns/${campaign.id}` : "/api/campaigns";
    const res = await fetch(url, { method: campaign ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const destinationId = campaign?.id ?? (await res.json()).id;
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      if (campaign) queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      toast.success(campaign ? "Campaign updated" : "Campaign created", campaign ? "Your campaign is ready. Generate emails to get started." : "Your campaign has been saved. Generate emails to get started.");
      router.push(`/campaigns/${destinationId}`);
    } else if (res.status === 409) {
      form.setError("name", { message: "A campaign with that name already exists" });
      setStep(1);
      setSubmitting(false);
    } else {
      toast.error(campaign ? "Could not update campaign" : "Could not create campaign", "Check your inputs and try again.");
      setSubmitting(false);
    }
  };

  return <div className="mx-auto max-w-2xl space-y-6">
    <StepIndicator step={step} />
    <form onSubmit={form.handleSubmit(submitCampaign)}>
      <Card><CardContent className="space-y-5 p-6">
        {step === 1 && <DetailsStep form={form} lists={lists} selectedListId={selectedListId} />}
        {step === 2 && <InstructionsStep form={form} tone={tone} language={language} emailLength={emailLength} />}
        {step === 3 && <SendingStep form={form} intervalType={intervalType} minInterval={minInterval} maxInterval={maxInterval} />}
        {step === 4 && <ReviewStep campaign={campaign} data={form.getValues()} lists={lists} intervalType={intervalType} minInterval={minInterval} maxInterval={maxInterval} />}
      </CardContent></Card>
      <div className="flex items-center justify-between pt-3">
        <Button type="button" variant="outline" onClick={goBack} disabled={step === 1}>Back</Button>
        {step < 4 ? <Button type="button" onClick={goNext}>Continue <ChevronRight className="h-4 w-4" /></Button> : <Button type="button" onClick={() => form.handleSubmit(submitCampaign)()} disabled={submitting || !reviewReady}>{submitting ? (campaign ? "Updating..." : "Creating...") : (campaign ? "Update Campaign" : "Create Campaign")}</Button>}
      </div>
    </form>
  </div>;
}

function campaignValues(campaign: CampaignForWizard): WizardData {
  return { name: campaign.name, listId: campaign.listId, goal: campaign.goal ?? "", product: campaign.product ?? "", cta: campaign.cta ?? "", tone: campaign.tone ?? "professional", language: campaign.language ?? "en", emailLength: campaign.emailLength ?? "medium", systemPrompt: campaign.systemPrompt ?? "", intervalType: (campaign.intervalType as "fixed" | "random") ?? "random", minInterval: campaign.minInterval ?? 3, maxInterval: campaign.maxInterval ?? 8, scheduledAt: campaign.scheduledAt ?? "", aiProvider: (campaign.aiProvider as WizardData["aiProvider"]) ?? "", aiModel: campaign.aiModel ?? "" };
}

function newCampaignValues(listId: string): WizardData {
  return { name: "", listId, goal: "", product: "", cta: "", tone: "professional", language: "en", emailLength: "medium", systemPrompt: "", intervalType: "random", minInterval: 3, maxInterval: 8, scheduledAt: "", aiProvider: "", aiModel: "" };
}
