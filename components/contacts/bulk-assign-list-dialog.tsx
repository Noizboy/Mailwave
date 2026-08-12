"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";

interface ContactList {
  id: string;
  name: string;
}

async function fetchLists(): Promise<ContactList[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) return [];
  return res.json();
}

interface BulkAssignListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  onSuccess: () => void;
}

const NEW_LIST_ID = "__new__";

export function BulkAssignListDialog({
  open,
  onOpenChange,
  contactIds,
  onSuccess,
}: BulkAssignListDialogProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newListChecked, setNewListChecked] = useState(false);
  const [newListName, setNewListName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: lists = [] } = useQuery<ContactList[]>({
    queryKey: ["lists-for-filter"],
    queryFn: fetchLists,
    enabled: open,
  });

  const toggleList = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const hasSelection = selectedIds.size > 0 || newListChecked;

  const handleSubmit = async () => {
    if (!hasSelection) {
      toast.error("No list selected", "Choose at least one list to assign the contacts to.");
      return;
    }

    setIsSubmitting(true);

    let finalIds = new Set(selectedIds);

    if (newListChecked) {
      const name = newListName.trim();
      if (!name) {
        toast.error("List name required", "Provide a name before creating the new list.");
        setIsSubmitting(false);
        return;
      }
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Could not create list", d.error || "An unexpected error occurred. Try again.");
        setIsSubmitting(false);
        return;
      }
      const created = await res.json();
      finalIds = new Set([...finalIds, created.id]);
    }

    const results = await Promise.all(
      [...finalIds].map((id) =>
        fetch(`/api/lists/${id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds }),
        })
      )
    );

    setIsSubmitting(false);

    if (results.some((r) => !r.ok)) {
      toast.error("Some assignments failed", "One or more lists could not be updated. Try again.");
      return;
    }

    const listCount = finalIds.size;
    toast.success(
      `${contactIds.length} contact${contactIds.length === 1 ? "" : "s"} assigned`,
      `Added to ${listCount} list${listCount === 1 ? "" : "s"}.`
    );
    handleOpenChange(false);
    [...finalIds].forEach((id) => queryClient.invalidateQueries({ queryKey: ["list", id] }));
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    onSuccess();
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setSelectedIds(new Set());
      setNewListChecked(false);
      setNewListName("");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign to Lists</DialogTitle>
          <DialogDescription>
            Add {contactIds.length} selected contact{contactIds.length === 1 ? "" : "s"} to one or more lists.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <Label>Lists</Label>
          <ScrollArea className={lists.length > 6 ? "h-48" : undefined}>
            <div className="space-y-1">
              {lists.map((l) => (
                <label
                  key={l.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedIds.has(l.id)}
                    onCheckedChange={() => toggleList(l.id)}
                  />
                  {l.name}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  checked={newListChecked}
                  onCheckedChange={(v) => setNewListChecked(!!v)}
                />
                <span className="text-muted-foreground">+ New list…</span>
              </label>
            </div>
          </ScrollArea>

          {newListChecked && (
            <Input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="e.g. Q3 Prospects"
              autoFocus
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !hasSelection}>
            {isSubmitting ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
