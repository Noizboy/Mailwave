import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, StepTitle } from "./field";
import type { ListOption, WizardData } from "./model";

export function DetailsStep({ form, lists, selectedListId }: { form: UseFormReturn<WizardData>; lists: ListOption[]; selectedListId: string }) {
  const selectedList = lists.find((list) => list.id === selectedListId);
  return <>
    <StepTitle>Campaign Details</StepTitle>
    <Field label="Campaign Name" error={form.formState.errors.name?.message}>
      <Input {...form.register("name")} placeholder="e.g. Q1 Outreach — Tech Leaders" autoFocus />
    </Field>
    <Field label="Contact List" error={form.formState.errors.listId?.message}>
      <Select value={selectedListId} onValueChange={(value) => form.setValue("listId", value, { shouldValidate: true })}>
        <SelectTrigger><SelectValue placeholder="Select a list..." /></SelectTrigger>
        <SelectContent>
          {lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name} ({list.subscribedContacts} subscribed / {list.totalContacts} total)</SelectItem>)}
        </SelectContent>
      </Select>
      {selectedList && selectedList.subscribedContacts < selectedList.totalContacts && (
        <p className="mt-1 text-xs text-amber-600">{selectedList.totalContacts - selectedList.subscribedContacts} contacts have issues and will be skipped.</p>
      )}
    </Field>
  </>;
}
