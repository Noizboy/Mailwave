/**
 * use-campaign-config-actions
 *
 * Local typed boundary for all campaign configuration save mutations in the
 * campaign detail surface. Each action owns its own fetch call, toast
 * notification, and React Query invalidation.
 *
 * Scope: campaigns domain only.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function invalidateCampaign(
  qc: ReturnType<typeof useQueryClient>,
  campaignId: string
) {
  qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
  qc.invalidateQueries({ queryKey: ["campaign-emails", campaignId] });
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface CampaignDetailsPayload {
  name?: string;
  goal?: string;
  product?: string;
  cta?: string;
}

export interface AiInstructionsPayload {
  tone?: string;
  language?: string;
  emailLength?: string;
  systemPrompt?: string;
}

export interface SendingConfigPayload {
  intervalType: "fixed" | "random";
  minInterval: number;
  maxInterval: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCampaignConfigActionsResult {
  /** Whether the campaign details PATCH is in flight. */
  savingDetails: boolean;
  /** Whether the AI instructions PATCH is in flight. */
  savingAi: boolean;
  /** Whether the sending config PATCH is in flight. */
  savingSending: boolean;

  /** PATCH /api/campaigns/:id  with campaign details fields */
  saveCampaignDetails: (payload: CampaignDetailsPayload) => Promise<boolean>;

  /** PATCH /api/campaigns/:id  with AI instruction fields */
  saveAiInstructions: (payload: AiInstructionsPayload) => Promise<boolean>;

  /** PATCH /api/campaigns/:id  with sending config fields */
  saveSendingConfig: (payload: SendingConfigPayload) => Promise<boolean>;
}

export function useCampaignConfigActions(
  campaignId: string
): UseCampaignConfigActionsResult {
  const qc = useQueryClient();
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [savingSending, setSavingSending] = useState(false);

  const invalidate = () => invalidateCampaign(qc, campaignId);

  // ---- campaign details -----------------------------------------------------

  const saveCampaignDetails = async (
    payload: CampaignDetailsPayload
  ): Promise<boolean> => {
    setSavingDetails(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Campaign saved", "Campaign details have been updated.");
      invalidate();
      setSavingDetails(false);
      return true;
    }
    setSavingDetails(false);
    return false;
  };

  // ---- AI instructions ------------------------------------------------------

  const saveAiInstructions = async (
    payload: AiInstructionsPayload
  ): Promise<boolean> => {
    setSavingAi(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success(
        "AI instructions saved",
        "Campaign instructions have been updated."
      );
      invalidate();
      setSavingAi(false);
      return true;
    }
    setSavingAi(false);
    return false;
  };

  // ---- sending config -------------------------------------------------------

  const saveSendingConfig = async (
    payload: SendingConfigPayload
  ): Promise<boolean> => {
    setSavingSending(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success(
        "Sending configuration saved",
        "Interval settings have been updated."
      );
      invalidate();
      setSavingSending(false);
      return true;
    }
    setSavingSending(false);
    return false;
  };

  return {
    savingDetails,
    savingAi,
    savingSending,
    saveCampaignDetails,
    saveAiInstructions,
    saveSendingConfig,
  };
}
