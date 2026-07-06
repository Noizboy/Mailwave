"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListCombobox, NEW_LIST_VALUE, NO_LIST_VALUE } from "./list-combobox";
import { toast } from "@/hooks/use-toast";

const schema = z.object({
  email: z.email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedin: z.string().optional(),
  aiHint: z.string().min(1, "AI Hint is required"),
  status: z.string().optional(),
  listId: z.string().optional(),
  newListName: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface ContactList {
  id: string;
  name: string;
}

async function fetchLists(): Promise<ContactList[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) return [];
  return res.json();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddContactDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [addAnother, setAddAnother] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");

  const { data: lists = [] } = useQuery<ContactList[]>({
    queryKey: ["lists-for-add-contact"],
    queryFn: fetchLists,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: "subscribed" },
  });

  const status = useWatch({ control, name: "status" }) ?? "subscribed";
  const isNewList = selectedListId === NEW_LIST_VALUE;

  const resetForm = () => {
    reset({ status: "subscribed" });
    setSelectedListId("");
  };

  const onSubmit = async (data: FormData) => {
    let listId =
      selectedListId && selectedListId !== "" && selectedListId !== NEW_LIST_VALUE
        ? selectedListId
        : undefined;

    if (isNewList) {
      const name = (data.newListName || "").trim();
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
      listId = created.id;
    }

    const customFields: Record<string, string> = {};
    if (data.linkedin) customFields.linkedin = data.linkedin;

    const payload = {
      email: data.email,
      firstName: data.firstName || undefined,
      lastName: data.lastName || undefined,
      company: data.company || undefined,
      jobTitle: data.jobTitle || undefined,
      aiHint: data.aiHint || undefined,
      listId,
      ...(Object.keys(customFields).length ? { customFields } : {}),
    };

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await res.json();
      toast.success("Contact added", `${data.email} has been saved to your contacts.`);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (addAnother) {
        resetForm();
        setAddAnother(false);
      } else {
        resetForm();
        onOpenChange(false);
      }
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error("Could not add contact", d.error || "Check that the email is valid and not already in use.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
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
                  value={selectedListId || NO_LIST_VALUE}
                  onValueChange={(v) => setSelectedListId(v === NO_LIST_VALUE ? "" : v)}
                  lists={lists}
                />
                {isNewList && (
                  <Input
                    {...register("newListName")}
                    placeholder="Name your new list"
                    autoFocus
                    className="mt-2"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setValue("status", v)}>
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

              <div className="space-y-1.5 sm:col-span-2">
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

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <p className="mr-auto text-xs text-muted-foreground">
              Required fields marked with <span className="text-destructive">*</span>
            </p>
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                setAddAnother(true);
                handleSubmit(onSubmit)();
              }}
            >
              Save &amp; add another
            </Button>
            <Button type="submit" disabled={isSubmitting} onClick={() => setAddAnother(false)}>
              {isSubmitting ? "Saving…" : "Save Contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
