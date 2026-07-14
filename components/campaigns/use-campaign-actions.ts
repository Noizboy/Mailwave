/**
 * use-campaign-actions
 *
 * Local typed boundary for all campaign-level mutations in the campaign detail
 * surface. Each action owns its own fetch call, toast notifications, and React
 * Query invalidation so that consumers hold no duplicated fetch/error/toast/
 * invalidation logic.
 *
 * Scope: campaigns domain only. Not a generic API client.
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

async function parseError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return json.error ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCampaignActionsResult {
  /** Whether a cancelGenerate request is in flight. */
  cancellingGenerate: boolean;

  /** POST /api/campaigns/:id/approve-all */
  approveAll: () => Promise<void>;

  /**
   * Transition the campaign to ready_to_send (if allReviewed) then POST
   * /api/campaigns/:id/send.
   */
  send: (allReviewed: boolean) => Promise<void>;

  /** POST /api/campaigns/:id/pause */
  pause: () => Promise<void>;

  /** POST /api/campaigns/:id/retry-failed */
  retryFailed: () => Promise<void>;

  /** POST /api/campaigns/:id/cancel */
  cancel: () => Promise<void>;

  /** POST /api/campaigns/:id/generate/cancel */
  cancelGenerate: () => Promise<void>;

  /** POST /api/campaigns/:id/generate  (pass mode = "retry_failed" for retry) */
  generate: (mode?: "retry_failed") => Promise<void>;
}

export function useCampaignActions(
  campaignId: string
): UseCampaignActionsResult {
  const qc = useQueryClient();
  const [cancellingGenerate, setCancellingGenerate] = useState(false);

  const invalidate = () => invalidateCampaign(qc, campaignId);

  // ---- approve-all ----------------------------------------------------------

  const approveAll = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/approve-all`, {
      method: "POST",
    });
    if (res.ok) {
      const { approved } = await res.json();
      toast.success(
        `${approved} email${approved === 1 ? "" : "s"} approved`,
        "Campaign is ready to send."
      );
      invalidate();
    }
  };

  // ---- send -----------------------------------------------------------------

  const send = async (allReviewed: boolean) => {
    if (allReviewed) {
      const patch = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready_to_send" }),
      });
      if (!patch.ok) {
        const errMsg = await parseError(patch);
        toast.error(
          "Could not start sending",
          errMsg || "Could not transition campaign to ready state."
        );
        return;
      }
    }
    const res = await fetch(`/api/campaigns/${campaignId}/send`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success(
        "Sending started",
        "Emails are being delivered. Monitor progress on this page."
      );
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error(
        "Could not start sending",
        errMsg || "Check your SMTP settings and try again."
      );
    }
  };

  // ---- pause ----------------------------------------------------------------

  const pause = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/pause`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success(
        "Campaign paused",
        "No more emails will be sent until you resume."
      );
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error(
        "Could not pause campaign",
        errMsg || "The server could not pause this campaign."
      );
    }
  };

  // ---- retry-failed ---------------------------------------------------------

  const retryFailed = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/retry-failed`, {
      method: "POST",
    });
    if (res.ok) {
      const { retried } = await res.json();
      toast.success(
        "Retrying failed emails",
        `${retried} email${retried === 1 ? "" : "s"} queued for retry.`
      );
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error("Retry failed", errMsg || "Could not retry failed emails.");
    }
  };

  // ---- cancel ---------------------------------------------------------------

  const cancel = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/cancel`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success(
        "Campaign reset",
        "Failed emails have been reset. You can now re-send the campaign."
      );
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error("Could not cancel", errMsg || "An error occurred.");
    }
  };

  // ---- cancel-generate ------------------------------------------------------

  const cancelGenerate = async () => {
    setCancellingGenerate(true);
    const res = await fetch(
      `/api/campaigns/${campaignId}/generate/cancel`,
      { method: "POST" }
    );
    if (res.ok) {
      const data = await res.json();
      const detail =
        data.status === "pending_review"
          ? "Emails generated so far are saved and ready for review."
          : "No emails were saved.";
      toast.success("Generation cancelled", detail);
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error("Could not cancel", errMsg || "An error occurred.");
    }
    setCancellingGenerate(false);
  };

  // ---- generate -------------------------------------------------------------

  const generate = async (mode?: "retry_failed") => {
    const res = await fetch(`/api/campaigns/${campaignId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode ? { mode } : {}),
    });
    if (res.ok) {
      const msg =
        mode === "retry_failed"
          ? "Retrying failed emails"
          : "Generating emails";
      toast.success(
        msg,
        "AI is personalizing each email. This may take a few minutes."
      );
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error(
        "Generation failed",
        errMsg || "Check your AI settings and try again."
      );
    }
  };

  return {
    cancellingGenerate,
    approveAll,
    send,
    pause,
    retryFailed,
    cancel,
    cancelGenerate,
    generate,
  };
}
