import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, StepTitle } from "./field";
import type { WizardData } from "./model";

export function InstructionsStep({ form, tone, language, emailLength }: { form: UseFormReturn<WizardData>; tone: string | undefined; language: string; emailLength: string }) {
  return <>
    <StepTitle>AI Instructions</StepTitle>
    <p className="text-sm text-muted-foreground">Tell the AI what this campaign is about. The more context you give, the better the personalization.</p>
    <Field label="Campaign Goal" description="What do you want to achieve with this campaign? The AI will write every email with this objective in mind."><Input {...form.register("goal")} placeholder="e.g. Get founders to book a 20-min discovery call" /></Field>
    <Field label="Product / Service" description="Name and one-line description of what you're promoting. Used to make each email feel relevant."><Input {...form.register("product")} placeholder="e.g. MailWave — AI-powered cold email platform for B2B teams" /></Field>
    <Field label="Call-to-Action" description="The single action you want recipients to take. Be specific — vague CTAs get ignored."><Input {...form.register("cta")} placeholder="e.g. Reply with 'interested' to get a personalized demo" /></Field>
    <div className="grid grid-cols-2 gap-4">
      <Field label="Tone"><Select value={tone} onValueChange={(value) => form.setValue("tone", value)}><SelectTrigger className="capitalize"><SelectValue /></SelectTrigger><SelectContent>{["professional", "friendly", "casual", "formal", "direct"].map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Email Length"><Select value={emailLength} onValueChange={(value) => form.setValue("emailLength", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="very-short">Very Short (1-3 sentences)</SelectItem><SelectItem value="short">Short (1-2 paragraphs)</SelectItem><SelectItem value="medium">Medium (3-4 paragraphs)</SelectItem><SelectItem value="long">Long (5+ paragraphs)</SelectItem></SelectContent></Select></Field>
    </div>
    <Field label="Language"><Select value={language} onValueChange={(value) => form.setValue("language", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="es">Spanish</SelectItem><SelectItem value="pt">Portuguese</SelectItem><SelectItem value="fr">French</SelectItem><SelectItem value="de">German</SelectItem></SelectContent></Select></Field>
    <Field label="System Prompt" description="Optional. Override or extend the default AI behavior with your own rules." error={form.formState.errors.systemPrompt?.message}><Textarea {...form.register("systemPrompt")} placeholder="e.g. Always open with a reference to the recipient's industry. Never use the phrase 'I hope this email finds you well'." rows={5} /></Field>
  </>;
}
