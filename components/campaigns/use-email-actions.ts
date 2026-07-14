/**
 * use-email-actions
 *
 * Local typed boundary for all per-email mutations in the campaign detail
 * email review surface. Owns fetch, toast, and invalidation for:
 *   - single-email approval status change
 *   - bulk approval / skip
 *   - regenerate body
 *   - regenerate subject
 *   - save edits (with optional approve)
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

export interface UseEmailActionsResult {
  /** Whether a body-regeneration request is in flight. */
  regenerating: boolean;
  /** Whether a subject-regeneration request is in flight. */
  regeneratingSubject: boolean;
  /** Whether a save-edit request is in flight. */
  saving: boolean;

  /** PATCH /api/campaigns/:id/emails/:emailId  { approvalStatus } */
  setApproval: (
    emailId: string,
    approvalStatus: string
  ) => Promise<boolean>;

  /** POST /api/campaigns/:id/emails/bulk-status */
  bulkSetApproval: (
    emailIds: string[],
    approvalStatus: "approved" | "skipped"
  ) => Promise<boolean>;

  /** POST /api/campaigns/:id/emails/:emailId/regenerate { target: "body" } */
  regenerateBody: (emailId: string) => Promise<void>;

  /** POST /api/campaigns/:id/emails/:emailId/regenerate { target: "subject" } */
  regenerateSubject: (emailId: string) => Promise<void>;

  /**
   * PATCH /api/campaigns/:id/emails/:emailId  { subject, body, [approvalStatus] }
   * Returns true on success.
   */
  saveEdit: (
    emailId: string,
    subject: string,
    body: string,
    andApprove?: boolean
  ) => Promise<boolean>;
}

export function useEmailActions(campaignId: string): UseEmailActionsResult {
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingSubject, setRegeneratingSubject] = useState(false);
  const [saving, setSaving] = useState(false);

  const invalidate = () => invalidateCampaign(qc, campaignId);

  // ---- single approval ------------------------------------------------------

  const setApproval = async (
    emailId: string,
    approvalStatus: string
  ): Promise<boolean> => {
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/${emailId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus }),
      }
    );
    if (res.ok) {
      toast.success("Email status updated", `Marked as ${approvalStatus}.`);
      invalidate();
      return true;
    }
    toast.error(
      "Could not update email",
      "The approval status change was not saved. Try again."
    );
    return false;
  };

  // ---- bulk approval --------------------------------------------------------

  const bulkSetApproval = async (
    emailIds: string[],
    approvalStatus: "approved" | "skipped"
  ): Promise<boolean> => {
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/bulk-status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds, approvalStatus }),
      }
    );
    if (res.ok) {
      const { updated } = await res.json();
      const label = approvalStatus === "approved" ? "approved" : "skipped";
      toast.success(`${updated} email${updated === 1 ? "" : "s"} ${label}`, "");
      invalidate();
      return true;
    }
    toast.error("Could not update emails", "Try again.");
    return false;
  };

  // ---- regenerate body ------------------------------------------------------

  const regenerateBody = async (emailId: string): Promise<void> => {
    setRegenerating(true);
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/${emailId}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "body" }),
      }
    );
    if (res.ok) {
      toast.success("Email regenerated", "A new body has been created using AI.");
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error(
        "Regeneration failed",
        errMsg || "Check your AI settings and try again."
      );
    }
    setRegenerating(false);
  };

  // ---- regenerate subject ---------------------------------------------------

  const regenerateSubject = async (emailId: string): Promise<void> => {
    setRegeneratingSubject(true);
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/${emailId}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "subject" }),
      }
    );
    if (res.ok) {
      toast.success(
        "Subject regenerated",
        "A new subject line has been created using AI."
      );
      invalidate();
    } else {
      const errMsg = await parseError(res);
      toast.error(
        "Regeneration failed",
        errMsg || "Check your AI settings and try again."
      );
    }
    setRegeneratingSubject(false);
  };

  // ---- save edit ------------------------------------------------------------

  const saveEdit = async (
    emailId: string,
    subject: string,
    body: string,
    andApprove = false
  ): Promise<boolean> => {
    setSaving(true);
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/${emailId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          ...(andApprove ? { approvalStatus: "approved" } : {}),
        }),
      }
    );
    if (res.ok) {
      toast.success(
        andApprove ? "Saved and approved" : "Changes saved",
        andApprove
          ? "Email updated and marked as approved."
          : "Your edits have been saved to this email."
      );
      invalidate();
      setSaving(false);
      return true;
    }
    toast.error(
      "Could not save changes",
      "Your edits were not saved. Try again."
    );
    setSaving(false);
    return false;
  };

  return {
    regenerating,
    regeneratingSubject,
    saving,
    setApproval,
    bulkSetApproval,
    regenerateBody,
    regenerateSubject,
    saveEdit,
  };
}
