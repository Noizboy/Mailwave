import { Alert } from "@/components/ui/alert";
import { StepTitle } from "./field";
import type { CampaignForWizard, ListOption, WizardData } from "./model";

export function ReviewStep({ campaign, data, lists, intervalType, minInterval, maxInterval }: { campaign?: CampaignForWizard; data: WizardData; lists: ListOption[]; intervalType: "fixed" | "random"; minInterval: number; maxInterval: number }) {
  const selectedList = lists.find((list) => list.id === data.listId);
  const details = [
    ["Name", data.name],
    ["List", selectedList?.name ?? data.listId],
    ["Tone", data.tone ?? "professional"],
    ["Email length", data.emailLength],
    ["Interval", intervalType === "random" ? `${minInterval}–${maxInterval} min (random)` : `${minInterval} min (fixed)`],
    ...(data.goal ? [["Goal", data.goal]] : []),
    ...(data.product ? [["Product", data.product]] : []),
    ...(data.cta ? [["CTA", data.cta]] : []),
    ...(data.scheduledAt ? [["Scheduled start", new Date(data.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })]] : [["Start", "Immediately after approval"]]),
  ] as [string, string][];

  return <>
    <StepTitle>{campaign ? "Review & Update" : "Confirm & Create"}</StepTitle>
    <Alert variant="success" hideIcon={false}>{campaign ? "Review your changes. Click 'Update Campaign' to save." : "Campaign is ready to be created. AI generation will start after saving."}</Alert>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {details.map(([label, value]) => <div key={label} className="flex flex-col gap-0.5 border-b border-border/60 pb-2"><dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="text-sm font-medium text-foreground">{value.charAt(0).toUpperCase() + value.slice(1)}</dd></div>)}
      {data.systemPrompt && <div className="col-span-full flex flex-col gap-0.5 border-b border-border/60 pb-2"><dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">System Prompt</dt><dd className="whitespace-pre-wrap text-sm font-medium text-foreground">{data.systemPrompt}</dd></div>}
    </dl>
    <p className="text-xs text-muted-foreground">{campaign ? "Your campaign configuration will be updated." : "Campaign will be created and ready for AI email generation."}</p>
  </>;
}
