"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

const NEW_LIST_VALUE = "__new__";

export function BulkAssignListDialog({
  open,
  onOpenChange,
  contactIds,
  onSuccess,
}: BulkAssignListDialogProps) {
  const queryClient = useQueryClient();
  const [listId, setListId] = useState<string>("");
  const [newListName, setNewListName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: lists = [] } = useQuery<ContactList[]>({
    queryKey: ["lists-for-filter"],
    queryFn: fetchLists,
    enabled: open,
  });

  const isNewList = listId === NEW_LIST_VALUE;

  const handleSubmit = async () => {
    let targetListId = listId;

    if (isNewList) {
      const name = newListName.trim();
      if (!name) {
        toast.error("List name required", "Provide a name before creating the new list.");
        return;
      }
      setIsSubmitting(true);
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
      targetListId = created.id;
    } else {
      if (!targetListId) {
        toast.error("No list selected", "Choose a list to assign the contacts to.");
        return;
      }
      setIsSubmitting(true);
    }

    const res = await fetch(`/api/lists/${targetListId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds }),
    });

    setIsSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Could not assign contacts", d.error || "An unexpected error occurred. Try again.");
      return;
    }

    toast.success(`${contactIds.length} contact${contactIds.length === 1 ? "" : "s"} assigned`, "They have been added to the selected list.");
    setListId("");
    setNewListName("");
    onOpenChange(false);
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    queryClient.invalidateQueries({ queryKey: ["list", targetListId] });
    onSuccess();
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setListId("");
      setNewListName("");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign to List</DialogTitle>
          <DialogDescription>
            Add {contactIds.length} selected contact{contactIds.length === 1 ? "" : "s"} to a list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>List</Label>
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
            >
              <option value="">Select a list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={NEW_LIST_VALUE}>+ New list…</option>
            </select>
          </div>

          {isNewList && (
            <div className="space-y-1.5">
              <Label>New list name</Label>
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g. Q3 Prospects"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
