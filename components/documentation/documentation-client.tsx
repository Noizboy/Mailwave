"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Gauge,
  LayoutDashboard,
  List,
  Mail,
  Search,
  Send,
  Settings,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Article = {
  id: string;
  group: string;
  title: string;
  description: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-6 space-y-3 border-b pb-8 last:border-0 last:pb-0">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-[14px] leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <div>
            <p className="font-medium text-foreground">{item.title}</p>
            <div className="mt-0.5">{item.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Callout({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warning" | "success" }) {
  const Icon = tone === "warning" ? CircleAlert : CheckCircle2;
  return (
    <div className={cn(
      "flex gap-3 rounded-lg border px-4 py-3 text-sm",
      tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
      tone === "info" && "border-blue-200 bg-blue-50 text-blue-900",
      tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
    )}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="leading-5">{children}</div>
    </div>
  );
}

function ConfigTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <dl className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[155px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="break-words text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-950 px-1.5 py-0.5 text-[12px] text-slate-100">{children}</code>;
}

function SettingsLink({ tab, children }: { tab: string; children: React.ReactNode }) {
  return (
    <Link href={`/settings?tab=${tab}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}<ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

const articles: Article[] = [
  {
    id: "introduction", group: "Getting started", title: "Introduction to MailWave",
    description: "What the system does and how a campaign flows from start to finish.", keywords: "start workflow overview cold email",
    icon: BookOpen,
    content: <>
      <Section title="What is MailWave?">
        <p>MailWave organizes contacts, segments them into lists, generates personalized emails with AI, and sends them through your own SMTP server. Each user has separate settings, campaigns, reports, and notifications.</p>
        <Callout>AI writes the message; SMTP delivers it. To send a campaign, both integrations must be connected and at least one email must be approved.</Callout>
      </Section>
      <Section title="Recommended workflow">
        <Steps items={[
          { title: "Configure the integrations", body: <>Connect a server under <SettingsLink tab="smtp">Mail Server</SettingsLink> and a provider under <SettingsLink tab="ai">AI Integration</SettingsLink>.</> },
          { title: "Add and organize contacts", body: "Import a CSV or create contacts manually, then assign them to a list." },
          { title: "Create the campaign", body: "Choose the list and define the goal, product, CTA, tone, language, and sending interval." },
          { title: "Generate and review", body: "AI creates one email per contact. Edit, regenerate, and approve only content that is ready." },
          { title: "Send and monitor", body: "The worker processes approved emails while respecting limits, intervals, and suppressions." },
        ]} />
      </Section>
    </>,
  },
  {
    id: "dashboard", group: "Using the system", title: "Dashboard",
    description: "A quick view of account status and recent activity.", keywords: "metrics overview activity campaigns contacts sent",
    icon: LayoutDashboard,
    content: <>
      <Section title="What it shows">
        <p>The Dashboard summarizes contacts, campaigns, sent emails, and recent activity. Use it as a control center to spot active, completed, or failed campaigns without opening every record.</p>
      </Section>
      <Section title="How to read it">
        <ul className="list-disc space-y-2 pl-5"><li><strong className="text-foreground">Contacts:</strong> current size of your database.</li><li><strong className="text-foreground">Campaigns:</strong> campaign volume and statuses.</li><li><strong className="text-foreground">Sent:</strong> deliveries processed by the system.</li><li><strong className="text-foreground">Recent activity:</strong> changes that may require attention.</li></ul>
      </Section>
    </>,
  },
  {
    id: "contacts", group: "Using the system", title: "Contacts",
    description: "Contact data, statuses, personalization, and bulk actions.", keywords: "contacts status ready subscribed suppressed invalid unsubscribe ai hint custom fields",
    icon: Users,
    content: <>
      <Section title="Contact data"><p>Each contact can include a name, email, company, job title, LinkedIn profile, AI context, and custom fields. The context field helps make the email specific to that person.</p></Section>
      <Section title="Statuses and eligibility">
        <ConfigTable rows={[["Ready / subscribed", "Eligible for sending."],["Pending", "Not yet eligible for sending."],["Suppressed", "Excluded from future campaigns."],["Invalid", "Invalid address; no email is sent."],["Unsubscribed", "Permanent opt-out; it must not be reactivated."]]} />
        <p>You can search by name, email, or company; filter by list, status, and date; and assign lists or change statuses in bulk.</p>
      </Section>
    </>,
  },
  {
    id: "lists", group: "Using the system", title: "Lists and segmentation",
    description: "How to group audiences without duplicating contacts.", keywords: "lists segmentation audience members groups",
    icon: List,
    content: <>
      <Section title="How lists work"><p>A list is a reusable contact segment. A contact can belong to multiple lists while remaining a single record, so status changes are reflected across every segment.</p></Section>
      <Section title="Best practices"><ul className="list-disc space-y-2 pl-5"><li>Name lists by audience and campaign, for example, “SaaS founders — Q3.”</li><li>Do not use lists to store statuses; use the contact status instead.</li><li>Before creating a campaign, review the member count and suppressed contacts.</li></ul></Section>
    </>,
  },
  {
    id: "csv-import", group: "Using the system", title: "Importing a CSV",
    description: "Upload, review, correct, and save contacts.", keywords: "csv upload import columns mapping duplicate invalid review",
    icon: Upload,
    content: <>
      <Section title="Import process"><Steps items={[
        {title:"Upload the file",body:"Select a CSV with a header row and an email column."},
        {title:"Review the rows",body:"MailWave classifies valid, duplicate, invalid, or incomplete data."},
        {title:"Correct before saving",body:"Edit or remove problematic rows from the review screen."},
        {title:"Save and segment",body:"Add the contacts to an existing list or create a new one."},
      ]}/></Section>
      <Section title="Recommended columns"><p>Email is essential. First name, last name, company, job title, LinkedIn, and AI hint improve personalization; additional columns can be preserved as custom fields.</p></Section>
    </>,
  },
  {
    id: "campaigns", group: "Using the system", title: "Campaigns and generation",
    description: "Creation, AI generation, approval, and status management.", keywords: "campaign goal cta tone language generate approve review pause resume schedule",
    icon: Mail,
    content: <>
      <Section title="Creating a campaign"><p>The wizard asks for a name and list, AI instructions, sending settings, and confirmation. Goal, product, and CTA define what the copy must achieve; tone, language, length, and additional instructions control its style.</p></Section>
      <Section title="Review and approval"><p>Generation creates an individual email for each contact. You can edit the subject and body, regenerate one item, approve several at once, or reject messages that should not be sent.</p><Callout tone="warning">Generating content does not send it. Only approved emails associated with eligible contacts are passed to the sending worker.</Callout></Section>
      <Section title="Main statuses"><ConfigTable rows={[["Pending", "Initial configuration."],["Generating", "AI is creating emails."],["Ready to send", "Content is ready for approval or sending."],["Sending", "The worker is processing the campaign."],["Paused", "Can resume without resending delivered emails."],["Completed", "No eligible approved emails remain."],["Failed", "The integration or process encountered a blocking error."]]} /></Section>
    </>,
  },
  {
    id: "sending", group: "Using the system", title: "Sending, pausing, and resuming",
    description: "What happens after you click Send Campaign.", keywords: "send worker bullmq interval random fixed pause resume retry failed queue",
    icon: Send,
    content: <>
      <Section title="How sending works"><p>The send action places a job in a queue. The worker loads the SMTP configuration, selects only approved emails and eligible contacts, sends them one at a time, and records each result.</p><Callout>The web application and worker are separate processes. If a campaign remains in “Sending” without progress, make sure a worker is active and Redis is available.</Callout></Section>
      <Section title="Intervals"><p>A fixed interval always waits the same number of minutes. A random interval chooses a delay between the minimum and maximum for each delivery. The next-send date is preserved when pausing and resuming.</p></Section>
      <Section title="Failures"><p>A failed email records its reason and does not stop subsequent messages. The whole campaign fails when the SMTP connection cannot be established at startup. Failed emails can be managed with the retry action in the campaign detail.</p></Section>
    </>,
  },
  {
    id: "reports", group: "Using the system", title: "Reports and notifications",
    description: "Campaign results, events, and the notification center.", keywords: "reports export csv sent failed delivery events notification bell unread",
    icon: Gauge,
    content: <>
      <Section title="Reports"><p>Reports consolidates campaign and email results. You can filter information, inspect statuses, and export data for external analysis.</p></Section>
      <Section title="Notification center"><p>The header bell checks for updates periodically, displays the unread total, and links to the related campaign when applicable. The Notifications page keeps recent history and lets you mark items as read.</p></Section>
    </>,
  },
  {
    id: "smtp-overview", group: "SMTP configuration", title: "SMTP concepts",
    description: "Fields, encryption, connection testing, and security.", keywords: "smtp host port tls ssl username password from reply test",
    icon: Settings,
    content: <>
      <Section title="Mail Server fields"><ConfigTable rows={[["SMTP Host", "The outgoing server provided by your email provider."],["Port", <>Normally use <Code>587</Code> with TLS/STARTTLS or <Code>465</Code> with SSL.</>],["Username", "The SMTP username, often the full email address."],["App Password", "An SMTP password or app password, never a public key."],["From Name", "The sender name recipients will see."],["From Email", "An address authorized by the provider."],["Test Email", "An optional recipient for a real test delivery."]]} /></Section>
      <Section title="Save and test"><Steps items={[{title:"Save the configuration",body:<>Open <SettingsLink tab="smtp">Settings → Mail Server</SettingsLink> and complete the fields.</>},{title:"Test the connection",body:"Without a test email, MailWave only verifies the SMTP session; with a recipient, it also sends a message."},{title:"Confirm Connected",body:"A campaign cannot start until the SMTP configuration is verified."}]}/><Callout tone="warning">Credentials are encrypted and never displayed again. If you change any value, the status returns to disconnected until the next successful test.</Callout></Section>
    </>,
  },
  {
    id: "smtp-gmail", group: "SMTP configuration", title: "SMTP: Gmail / Google Workspace",
    description: "Configuration with TLS and an app password.", keywords: "gmail google workspace smtp.gmail.com app password 2fa",
    icon: Mail,
    content: <>
      <Section title="Values"><ConfigTable rows={[["Host", <Code key="gmail-host">smtp.gmail.com</Code>],["Port / encryption", <span key="gmail-port"><Code>587</Code> + TLS (recommended), or <Code>465</Code> + SSL.</span>],["Username", "The full Gmail or Workspace address."],["Password", "A 16-character app password."],["From Email", "The authenticated account or an authorized sending alias."]]} /></Section>
      <Section title="Create the password"><Steps items={[{title:"Enable 2-Step Verification",body:"Enable it in your Google Account security settings."},{title:"Create an App Password",body:"Generate a password for MailWave and copy it; it is shown only once."},{title:"Save and test",body:"Paste the app password, not your regular Google password."}]}/><Callout tone="warning">For managed accounts, the administrator may disable App Passwords. Gmail also applies its own limits even when MailWave is configured with higher values.</Callout><a className="font-medium text-primary hover:underline" href="https://support.google.com/mail/answer/185833" target="_blank" rel="noreferrer">Official App Passwords guide</a></Section>
    </>,
  },
  {
    id: "smtp-outlook", group: "SMTP configuration", title: "SMTP: Outlook / Microsoft 365",
    description: "SMTP AUTH, port 587, and Microsoft requirements.", keywords: "outlook office microsoft 365 smtp auth smtp.office365.com smtp-mail.outlook.com",
    icon: Mail,
    content: <>
      <Section title="Values"><ConfigTable rows={[["Outlook.com", <Code key="outlook-host">smtp-mail.outlook.com</Code>],["Microsoft 365", <Code key="m365-host">smtp.office365.com</Code>],["Port / encryption", <span key="outlook-port"><Code>587</Code> + TLS/STARTTLS.</span>],["Username", "The full mailbox address."],["Password", "A credential allowed by the tenant policy."]]} /></Section>
      <Section title="SMTP AUTH requirement"><p>In Microsoft 365, an administrator may need to enable Authenticated SMTP for the mailbox. MailWave uses username-and-password SMTP authentication; if the tenant requires OAuth exclusively, the current form cannot establish the connection.</p><Callout tone="warning">MailWave&apos;s preset uses Outlook.com. For business Microsoft 365, select SMTP Server and enter <Code>smtp.office365.com</Code>.</Callout><a className="font-medium text-primary hover:underline" href="https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission" target="_blank" rel="noreferrer">Official SMTP AUTH guide</a></Section>
    </>,
  },
  {
    id: "smtp-custom", group: "SMTP configuration", title: "SMTP: SendGrid, Mailgun, SES, and others",
    description: "How to enter credentials from any SMTP provider.", keywords: "custom sendgrid mailgun amazon ses zoho mail smtp relay",
    icon: Send,
    content: <>
      <Section title="Provider settings"><ConfigTable rows={[["SendGrid", <><Code>smtp.sendgrid.net</Code>, 587/TLS; username <Code>apikey</Code>; password: your API key.</>],["Mailgun", <><Code>smtp.mailgun.org</Code> (or the listed regional host), 587/TLS; use the domain&apos;s SMTP credentials.</>],["Amazon SES", <><Code>email-smtp.&lt;region&gt;.amazonaws.com</Code>, 587/TLS; use region-specific SMTP credentials.</>],["Zoho Mail", <><Code>smtp.zoho.com</Code>, 587/TLS; use the full account and an app password when required.</>],["Other provider", "Copy the host, port, encryption method, SMTP username, and password exactly as shown in the provider's dashboard."]]} /></Section>
      <Section title="Sender domain"><p>Verify the From domain or address with the provider and configure SPF, DKIM, and DMARC. MailWave transmits the email, but sender reputation, domain authentication, and final quotas depend on the relay.</p><Callout>Do not use regular AWS access keys with SES; generate SMTP credentials. With any provider, start with a low sending limit and increase it gradually.</Callout></Section>
    </>,
  },
  {
    id: "ai-overview", group: "AI integrations", title: "How MailWave uses AI",
    description: "Providers, prompts, transmitted data, and validation.", keywords: "ai prompt json personalized api key model provider",
    icon: Sparkles,
    content: <>
      <Section title="Generation process"><p>MailWave combines campaign instructions with contact data and requests an object containing a subject, body, and personalization notes. The model, prompt, content, and result are stored for each email so you can review them.</p></Section>
      <Section title="Data and security"><p>The API key is encrypted before it is stored. During generation, the required contact data is sent to the selected provider, including name, company, job title, AI hint, and custom fields. Review the provider&apos;s policies before using sensitive data.</p><Callout tone="warning">The connection test must show Connected. A nonexistent model, a key without credit, or an incompatible endpoint will cause generation to fail.</Callout></Section>
    </>,
  },
  {
    id: "ai-openai-anthropic", group: "AI integrations", title: "AI: OpenAI and Anthropic",
    description: "Direct connections to the ChatGPT/OpenAI and Claude APIs.", keywords: "openai chatgpt anthropic claude api key model gpt",
    icon: Bot,
    content: <>
      <Section title="OpenAI / ChatGPT API"><Steps items={[{title:"Create an API key",body:"Use the OpenAI platform; ChatGPT subscriptions and API billing are separate products."},{title:"Select OpenAI",body:<>Under <SettingsLink tab="ai">AI Integration</SettingsLink>, enter the key and a model ID available to your account.</>},{title:"Save and test",body:"MailWave validates the key and model before marking the connection as ready."}]}/><Callout>MailWave&apos;s current default is <Code>gpt-4o-mini</Code>. You can replace it with another compatible model ID available to your account.</Callout></Section>
      <Section title="Anthropic / Claude"><p>Select Anthropic, paste an API key created in Anthropic Console, and enter the exact model ID. This integration uses Anthropic&apos;s Messages API natively rather than an OpenAI-compatible layer.</p><Callout>The current default model is <Code>claude-haiku-4-5-20251001</Code>. If the provider retires a model, update the Model field and test again.</Callout></Section>
    </>,
  },
  {
    id: "ai-gemini-openrouter", group: "AI integrations", title: "AI: Gemini and OpenRouter",
    description: "Google AI Studio and OpenRouter's multi-provider catalog.", keywords: "gemini google ai studio openrouter base url model api key",
    icon: Sparkles,
    content: <>
      <Section title="Google Gemini"><Steps items={[{title:"Get an API key",body:"Create it in Google AI Studio."},{title:"Select Google Gemini",body:"Paste the key and use a model ID compatible with chat completions."},{title:"Test",body:"MailWave connects through Google's official OpenAI-compatible layer."}]}/><ConfigTable rows={[["Internal Base URL", <Code key="gemini-url">https://generativelanguage.googleapis.com/v1beta/openai</Code>],["System default model", <Code key="gemini-model">gemini-1.5-flash</Code>]]}/><Callout tone="warning">Model catalogs change. If the default is no longer available, replace it with a current model ID from Google AI Studio.</Callout></Section>
      <Section title="OpenRouter"><Steps items={[{title:"Create and fund a key",body:"Create an OpenRouter key and optionally assign it a credit limit."},{title:"Select OpenRouter",body:<>Use <Code>https://openrouter.ai/api/v1</Code> as the Base URL.</>},{title:"Choose the model",body:<>Use the complete slug, such as <Code>openai/gpt-4o-mini</Code>, and save.</>}]}/><p>OpenRouter normalizes models from several providers using an OpenAI-compatible format. Cost and limits depend on the selected model and route.</p></Section>
    </>,
  },
  {
    id: "ai-ollama", group: "AI integrations", title: "AI: Ollama Cloud and local Ollama",
    description: "Current compatibility, endpoints, and secure deployments.", keywords: "ollama cloud local ai localhost 11434 custom openai compatible gateway",
    icon: Bot,
    content: <>
      <Section title="Local Ollama"><p>Ollama exposes an OpenAI-compatible API at <Code>http://localhost:11434/v1</Code>. In a local installation, &quot;localhost&quot; must refer to the process or container running MailWave, not the user&apos;s browser.</p><Callout tone="warning"><strong>Current limitation:</strong> MailWave blocks private URLs and localhost in the Base URL field to prevent SSRF. Local Ollama therefore cannot be saved directly through the current interface. Enabling it requires server-managed configuration or a protected public HTTPS gateway.</Callout></Section>
      <Section title="Ollama Cloud"><p>Ollama Cloud can run cloud models from an authenticated Ollama host or through the native ollama.com API. MailWave currently expects OpenAI-compatible Chat Completions and does not include a native Ollama provider.</p><Steps items={[{title:"Currently compatible option",body:"Expose a public HTTPS, OpenAI-compatible gateway that translates requests to Ollama, then select Custom."},{title:"Complete the Custom form",body:"Use the gateway Base URL, a key required by that gateway, and the exact model name."},{title:"Test before generating",body:"Confirm that the gateway implements /v1/chat/completions and returns the OpenAI response format."}]}/><Callout>Ollama Cloud&apos;s direct native API uses <Code>https://ollama.com/v1</Code>. Do not use it as MailWave&apos;s Base URL because it does not implement the expected contract.</Callout><a className="font-medium text-primary hover:underline" href="https://docs.ollama.com/api/openai-compatibility" target="_blank" rel="noreferrer">Official Ollama compatibility guide</a></Section>
    </>,
  },
  {
    id: "ai-custom", group: "AI integrations", title: "AI: LocalAI and compatible APIs",
    description: "Connect third-party or self-hosted OpenAI-compatible gateways.", keywords: "localai lm studio vllm litellm custom endpoint base url openai compatible",
    icon: Bot,
    content: <>
      <Section title="Endpoint requirements"><p>Select Custom for services that implement <Code>/v1/chat/completions</Code> using an OpenAI-compatible format. They must accept system and user messages plus the model field, and return text under <Code>choices[0].message.content</Code>.</p><ConfigTable rows={[["Base URL", <>A public HTTPS origin, usually ending in <Code>/v1</Code>.</>],["API Key", "A token that protects the gateway; MailWave requires a key when creating the configuration."],["Model", "The exact ID published by the gateway."],["Response", "The model must be able to return valid JSON containing a subject, body, and notes."]]}/></Section>
      <Section title="LocalAI, LM Studio, vLLM, or LiteLLM"><p>These servers usually work through their OpenAI-compatible layer, but MailWave does not accept loopback, LAN, or private addresses from Settings. In production, publish the gateway behind HTTPS, authentication, access controls, and rate limits. Never expose an unprotected local runtime.</p><Callout tone="warning">An endpoint opening on your computer does not mean the MailWave container can reach it. Test connectivity from the server running the application.</Callout></Section>
    </>,
  },
  {
    id: "sending-limits", group: "Settings and operations", title: "Sending Limits",
    description: "Hourly and daily limits plus automatic suppression.", keywords: "sending limits hourly daily suppress threshold quota rate limit",
    icon: Gauge,
    content: <>
      <Section title="Available controls"><ConfigTable rows={[["Max emails per day", "Maximum sent per user in a rolling 24-hour window. Default: 500."],["Max emails per hour", "Maximum sent per user in a rolling 60-minute window. Default: 50."],["Auto-suppress after N emails", "Once the historical threshold is reached, the contact becomes Suppressed. Default: 3."]]}/></Section>
      <Section title="How limits are applied"><p>Before each send, the worker counts the user&apos;s recent events. When the hourly or daily limit is reached, processing stops and the campaign is preserved so it can continue when capacity becomes available again. Suppression is evaluated by a background job and excludes the contact from future campaigns.</p><Callout tone="warning">MailWave cannot increase the SMTP provider&apos;s quota. Set values equal to or lower than the limits allowed by Gmail, Microsoft, SES, or another relay.</Callout><SettingsLink tab="limits">Open Sending Limits</SettingsLink></Section>
    </>,
  },
  {
    id: "notification-settings", group: "Settings and operations", title: "Notifications in Settings",
    description: "Preferences, active alerts, and reserved features.", keywords: "notifications settings campaign complete error ai ready bounced daily digest system alerts credits",
    icon: Settings,
    content: <>
      <Section title="Preferences"><ConfigTable rows={[["Campaign completed", "Notifies you when all sends are finished."],["Campaign error", "Notifies you when a configuration problem prevents sending."],["AI emails ready", "Notifies you when generation is ready for review."],["AI generation failed", "Notifies you about provider, key, or model errors."],["Email bounced", "Preference for rejected deliveries."],["Daily delivery digest", "A daily summary of sent and failed emails."]]}/></Section>
      <Section title="What is available"><p>Preferences control notifications inside MailWave. The system also stores an email-delivery flag for future expansion, but Settings currently displays in-app switches.</p><Callout tone="warning"><strong>System alerts</strong> and <strong>Low sending credits</strong> are marked “coming soon” and are disabled. They do not depend on a MailWave-owned quota in the current version.</Callout><SettingsLink tab="notifications">Open Notification Settings</SettingsLink></Section>
    </>,
  },
  {
    id: "troubleshooting", group: "Settings and operations", title: "Troubleshooting",
    description: "Quick diagnosis for SMTP, AI, and stalled campaigns.", keywords: "troubleshooting error disconnected failed sending stuck worker redis credentials",
    icon: CircleAlert,
    content: <>
      <Section title="SMTP does not connect"><ul className="list-disc space-y-2 pl-5"><li>Confirm the host, port, and TLS/SSL combination.</li><li>Use an app password or SMTP credential, not the main password or a different access key.</li><li>Verify that From Email is authorized and the provider allows SMTP AUTH.</li><li>Save first, then run Test Connection.</li></ul></Section>
      <Section title="AI does not connect"><ul className="list-disc space-y-2 pl-5"><li>Check the account balance, key permissions, and exact model ID.</li><li>For OpenRouter and Custom, verify that the Base URL ends at the correct API root.</li><li>A Custom endpoint must implement OpenAI-compatible Chat Completions.</li><li>Private and local URLs are rejected for security.</li></ul></Section>
      <Section title="Campaign is not progressing"><ul className="list-disc space-y-2 pl-5"><li>Confirm that SMTP and AI show Connected.</li><li>Make sure there are approved emails and eligible contacts.</li><li>Check hourly and daily limits plus the next scheduled interval.</li><li>For managed installations, confirm that Redis and the worker are active.</li></ul></Section>
    </>,
  },
];

export function DocumentationClient() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("introduction");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return articles;
    return articles.filter((article) =>
      `${article.title} ${article.description} ${article.group} ${article.keywords}`.toLocaleLowerCase().includes(needle)
    );
  }, [query]);

  const active = articles.find((article) => article.id === activeId) ?? articles[0];
  const groups = Array.from(new Set(articles.map((article) => article.group)));

  const selectArticle = (id: string) => {
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
    document.getElementById("documentation-article")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex h-full min-h-0 bg-card">
      <aside className="hidden w-72 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="border-b p-4">
          <SearchBox query={query} setQuery={setQuery} />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Documentation sections">
          {groups.map((group) => {
            const items = filtered.filter((article) => article.group === group);
            if (!items.length) return null;
            return <div key={group} className="mb-5">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="space-y-0.5">
                {items.map((article) => <DocNavItem key={article.id} article={article} active={active.id === article.id} onClick={() => selectArticle(article.id)} />)}
              </div>
            </div>;
          })}
          {filtered.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted-foreground">No documentation section matches that search.</p>}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b bg-background p-4 lg:hidden">
          <SearchBox query={query} setQuery={setQuery} />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {filtered.map((article) => <button key={article.id} onClick={() => selectArticle(article.id)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", active.id === article.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>{article.title}</button>)}
          </div>
        </div>

        <article id="documentation-article" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
            <div className="mb-8 border-b pb-7">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-primary"><BookOpen className="h-4 w-4" />{active.group}<ChevronRight className="h-3.5 w-3.5" /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{active.title}</h1>
              <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted-foreground">{active.description}</p>
            </div>
            <div className="space-y-8">{active.content}</div>
            <div className="mt-12 flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Ready to configure MailWave?</span>
              <Link href="/settings" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Open Settings<ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function SearchBox({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the documentation..." className="h-9 bg-card pl-9 text-sm" aria-label="Search the documentation" /></div>;
}

function DocNavItem({ article, active, onClick }: { article: Article; active: boolean; onClick: () => void }) {
  const Icon = article.icon;
  return <button onClick={onClick} className={cn("group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] transition-colors", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{article.title}</span><ChevronRight className={cn("h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60", active && "opacity-70")} /></button>;
}
