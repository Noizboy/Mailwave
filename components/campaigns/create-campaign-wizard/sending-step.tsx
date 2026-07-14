import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, StepTitle } from "./field";
import type { WizardData } from "./model";

export function SendingStep({ form, intervalType, minInterval, maxInterval }: { form: UseFormReturn<WizardData>; intervalType: "fixed" | "random"; minInterval: number; maxInterval: number }) {
  return <>
    <StepTitle>Sending Settings</StepTitle>
    <Field label="Interval Type" description="Controls how long the system waits between sending each email. Random intervals mimic human behavior and reduce spam-filter risk; fixed intervals send on a precise schedule."><Select value={intervalType} onValueChange={(value) => form.setValue("intervalType", value as "fixed" | "random")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="random">Random interval (humanized)</SelectItem><SelectItem value="fixed">Fixed interval</SelectItem></SelectContent></Select></Field>
    {intervalType === "random" ? <RandomInterval form={form} minInterval={minInterval} maxInterval={maxInterval} /> : <Field label="Interval (minutes)" description="Exact number of minutes to wait between each sent email." error={form.formState.errors.minInterval?.message}><Input type="number" {...form.register("minInterval", { valueAsNumber: true })} min={1} /></Field>}
    <Field label="Schedule start" description="Leave blank to start immediately after approval."><Input type="datetime-local" {...form.register("scheduledAt")} /></Field>
  </>;
}

function RandomInterval({ form, minInterval, maxInterval }: { form: UseFormReturn<WizardData>; minInterval: number; maxInterval: number }) {
  const position = (value: number) => `${((value - 1) / 59) * 100}%`;
  return <div>
    <div className="mb-1 flex items-center justify-between"><Label>Sending Interval (minutes)</Label><span className="text-xs text-muted-foreground">{minInterval}–{maxInterval} min</span></div>
    <div className="relative flex h-8 items-center">
      <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted" />
      <div className="absolute h-1.5 rounded-full bg-foreground" style={{ left: position(minInterval), right: `${100 - ((maxInterval - 1) / 59) * 100}%` }} />
      <div className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none" style={{ left: position(minInterval) }} />
      <div className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none" style={{ left: position(maxInterval) }} />
      <input type="range" min={1} max={60} value={minInterval} onChange={(event) => form.setValue("minInterval", Math.min(Number(event.target.value), maxInterval - 1))} className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
      <input type="range" min={1} max={60} value={maxInterval} onChange={(event) => form.setValue("maxInterval", Math.max(Number(event.target.value), minInterval + 1))} className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
    </div>
    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>1 min</span><span>60 min</span></div>
    <p className="mt-1.5 text-xs text-muted-foreground">Emails will be sent at a random time within this range, making the campaign appear more natural to spam filters.</p>
  </div>;
}
