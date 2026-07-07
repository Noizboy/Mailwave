"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListCombobox, NEW_LIST_VALUE, NO_LIST_VALUE } from "./list-combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  aiHint: string | null;
  status: string;
  customFields: Record<string, string> | null;
  listMembers: Array<{ list: { id: string; name: string } }>;
}

interface ContactList {
  id: string;
  name: string;
}

const editSchema = z.object({
  email: z.email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedin: z.string().optional(),
  aiHint: z.string().min(1, "AI Hint is required"),
  status: z.enum(["subscribed", "unsubscribed", "suppressed", "invalid"]),
});
type EditData = z.infer<typeof editSchema>;


async function fetchContact(id: string): Promise<Contact> {
  const res = await fetch(`/api/contacts/${id}`);
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

async function fetchLists(): Promise<ContactList[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) return [];
  return res.json();
}

interface ContactEditDialogProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactEditDialog({ contactId, open, onOpenChange }: ContactEditDialogProps) {
  const queryClient = useQueryClient();

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => fetchContact(contactId!),
    enabled: !!contactId && open,
  });

  const { data: lists, isLoading: listsLoading } = useQuery<ContactList[]>({
    queryKey: ["lists-for-filter"],
    queryFn: fetchLists,
    enabled: open,
  });

  const isLoading = contactLoading || listsLoading;
  const listsSafe: ContactList[] = lists ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditData>({
    resolver: zodResolver(editSchema),
    defaultValues: { status: "subscribed" },
  });

  const status = useWatch({ control, name: "status" }) ?? "subscribed";
  const [listId, setListId] = useState<string>(NO_LIST_VALUE);
  const [newListName, setNewListName] = useState<string>("");
  const [prevContact, setPrevContact] = useState<typeof contact>(undefined);
  // Adjust local state when the loaded contact changes — the render-time
  // update avoids calling setState synchronously inside an effect.
  if (contact !== prevContact) {
    setPrevContact(contact);
    if (contact) {
      setListId(contact.listMembers[0]?.list.id ?? NO_LIST_VALUE);
      setNewListName("");
    }
  }
  const isNewList = listId === NEW_LIST_VALUE;

  useEffect(() => {
    if (contact && lists) {
      const linkedin = contact.customFields?.linkedin ?? "";
      reset({
        email: contact.email,
        firstName: contact.firstName ?? "",
        lastName: contact.lastName ?? "",
        company: contact.company ?? "",
        jobTitle: contact.jobTitle ?? "",
        linkedin,
        aiHint: contact.aiHint ?? "",
        status: contact.status as EditData["status"],
      });
    }
  }, [contact, lists, reset]);

  const onSubmit = async (data: EditData) => {
    if (!contactId || !contact) return;

    let targetListId: string | undefined;
    if (listId === NEW_LIST_VALUE) {
      const name = newListName.trim();
      if (!name) {
        toast.error("List name required", "Provide a name before creating the new list.");
        return;
      }
      const listRes = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!listRes.ok) {
        const d = await listRes.json().catch(() => ({}));
        toast.error("Could not create list", d.error || "An unexpected error occurred. Try again.");
        return;
      }
      const created = await listRes.json();
      targetListId = created.id;
    } else if (listId && listId !== NO_LIST_VALUE) {
      targetListId = listId;
    }

    const customFields: Record<string, string> = { ...(contact.customFields ?? {}) };
    if (data.linkedin) customFields.linkedin = data.linkedin;
    else delete customFields.linkedin;

    const payload = {
      email: data.email,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      company: data.company || null,
      jobTitle: data.jobTitle || null,
      aiHint: data.aiHint || null,
      status: data.status,
      customFields: Object.keys(customFields).length ? customFields : null,
    };

    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Could not update contact", d.error || "Check your inputs and try again.");
      return;
    }

    const currentListId = contact.listMembers[0]?.list.id;
    if (currentListId !== targetListId) {
      if (currentListId) {
        await fetch(`/api/lists/${currentListId}/members`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: [contactId] }),
        });
      }
      if (targetListId) {
        await fetch(`/api/lists/${targetListId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: [contactId] }),
        });
      }
    }

    toast.success("Contact updated", "All changes have been saved successfully.");
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    queryClient.invalidateQueries({ queryKey: ["lists-for-filter"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>

        {isLoading || !contact ? (
          <div className="grid grid-cols-2 gap-4 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="col-span-2 h-28 w-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <ScrollArea className="max-h-[65vh]">
              <div className="grid grid-cols-2 gap-4 px-1 pt-1 pb-4">
                <div className="space-y-1.5">
                  <Label>First name <span className="text-destructive">*</span></Label>
                  <Input
                    {...register("firstName")}
                    placeholder="Daniela"
                    className={errors.firstName ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-destructive">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input {...register("lastName")} placeholder="Moreno" />
                </div>

                <div className="space-y-1.5">
                  <Label>Email address <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    {...register("email")}
                    placeholder="daniela@nubex.io"
                    className={"font-mono " + (errors.email ? "border-destructive focus-visible:ring-destructive" : "")}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>LinkedIn</Label>
                  <Input {...register("linkedin")} placeholder="linkedin.com/in/…" />
                </div>

                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input {...register("company")} placeholder="Nubex" />
                </div>
                <div className="space-y-1.5">
                  <Label>Job title</Label>
                  <Input {...register("jobTitle")} placeholder="VP Marketing" />
                </div>

                <div className="space-y-1.5">
                  <Label>Assign to list</Label>
                  <ListCombobox
                    value={listId}
                    onValueChange={(v) => setListId(v)}
                    lists={listsSafe}
                  />
                  {isNewList && (
                    <Input
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="Name your new list"
                      autoFocus
                      className="mt-2"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setValue("status", v as EditData["status"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subscribed">Subscribed</SelectItem>
                      <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                      <SelectItem value="suppressed">Suppressed</SelectItem>
                      <SelectItem value="invalid">Invalid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    AI Hint <span className="text-destructive">*</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      · Used by the AI to personalize this contact&apos;s profile &amp; email
                    </span>
                  </Label>
                  <Textarea
                    rows={7}
                    {...register("aiHint")}
                    placeholder="e.g. Mentioned pain with outbound reply rates on LinkedIn. Series B fintech. Interested in LATAM expansion."
                    className={"resize-none " + (errors.aiHint ? "border-destructive focus-visible:ring-destructive" : "border-blue-200 bg-blue-50/60")}
                  />
                  {errors.aiHint && (
                    <p className="text-xs text-destructive">{errors.aiHint.message}</p>
                  )}
                </div>
              </div>
            </ScrollArea>

            <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
              <p className="mr-auto text-xs text-muted-foreground">
                Required fields marked with <span className="text-destructive">*</span>
              </p>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Contact"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
