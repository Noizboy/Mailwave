"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type ContactStatus = "subscribed" | "unsubscribed" | "suppressed" | "invalid";

interface BulkChangeStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  onSuccess: () => void;
}

export function BulkChangeStatusDialog({
  open,
  onOpenChange,
  contactIds,
  onSuccess,
}: BulkChangeStatusDialogProps) {
  const [status, setStatus] = useState<ContactStatus | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!status) {
      toast.error("No status selected", "Choose the new status to apply to the selected contacts.");
      return;
    }

    setIsSubmitting(true);

    const results = await Promise.allSettled(
      contactIds.map((id) =>
        fetch(`/api/contacts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
      )
    );

    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok
    ).length;
    const skipped = contactIds.length - succeeded;

    setIsSubmitting(false);

    if (succeeded > 0) {
      const msg =
        skipped > 0
          ? `${succeeded} updated, ${skipped} skipped (unsubscribed contacts cannot be modified)`
          : `${succeeded} contact${succeeded === 1 ? "" : "s"} updated to ${status}`;
      toast.success(msg);
      setStatus("");
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error("No contacts updated", "All contacts may already have this status or could not be modified.");
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) setStatus("");
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
          <DialogDescription>
            Set a new status for {contactIds.length} selected contact
            {contactIds.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          <Label>New status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ContactStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subscribed">Subscribed</SelectItem>
              <SelectItem value="unsubscribed" className="text-destructive">
                Unsubscribed
              </SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="invalid">Invalid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
