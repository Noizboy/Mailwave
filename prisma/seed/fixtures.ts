import type { ContactSeed } from "./types";

// All static fixture data for the demo scenarios. Separating fixtures from
// persistence keeps the demo content easy to audit and reuse, and keeps the
// builders free of inline data tables.

export const LIST_SEEDS = [
  { id: "seed-list-1", name: "Tech Leaders Q1" },
  { id: "seed-list-2", name: "Enterprise Accounts" },
  { id: "seed-list-3", name: "Mid-Market Growth" },
  { id: "seed-list-4", name: "All Active Leads" },
] as const;

export const CONTACT_SEEDS: ContactSeed[] = [
  { email: "alice@acme.com", firstName: "Alice", lastName: "Johnson", company: "Acme Corp", jobTitle: "CEO", aiHint: "Loves efficiency tools and automation", listIds: ["seed-list-1"] },
  { email: "bob@techco.com", firstName: "Bob", lastName: "Smith", company: "TechCo", jobTitle: "CTO", aiHint: "Interested in AI and machine learning", listIds: ["seed-list-1"] },
  { email: "carol@startup.io", firstName: "Carol", lastName: "Davis", company: "Startup.io", jobTitle: "Marketing Director", aiHint: "Focuses on growth hacking and viral loops", listIds: ["seed-list-1"] },
  { email: "dave@enterprise.com", firstName: "Dave", lastName: "Wilson", company: "Enterprise Ltd", jobTitle: "VP Sales", aiHint: "Manages a large sales team, values ROI metrics", listIds: ["seed-list-1"] },
  { email: "emma@innovate.co", firstName: "Emma", lastName: "Brown", company: "Innovate.co", jobTitle: "Product Manager", aiHint: "Data-driven decision maker", listIds: ["seed-list-1"] },
  { email: "frank@cloudnine.com", firstName: "Frank", lastName: "Miller", company: "Cloud Nine", jobTitle: "Engineering Director", aiHint: "Infrastructure automation expert", listIds: ["seed-list-1"] },
  { email: "grace@digital.com", firstName: "Grace", lastName: "Taylor", company: "Digital Ventures", jobTitle: "CEO", aiHint: "Serial entrepreneur, growth-focused", listIds: ["seed-list-1"] },
  { email: "henry@saas.io", firstName: "Henry", lastName: "Anderson", company: "SaaS Inc", jobTitle: "Head of Sales", aiHint: "B2B sales specialist", listIds: ["seed-list-1"] },
  { email: "iris@marketing.pro", firstName: "Iris", lastName: "Martinez", company: "Marketing Pro", jobTitle: "VP Marketing", aiHint: "Content marketing and brand strategy", listIds: ["seed-list-1"] },
  { email: "jack@finance.com", firstName: "Jack", lastName: "Garcia", company: "Finance Plus", jobTitle: "CFO", aiHint: "Cost optimization and ROI focused", listIds: ["seed-list-1"] },
  { email: "kate@devops.io", firstName: "Kate", lastName: "Chen", company: "DevOps Masters", jobTitle: "DevOps Lead", aiHint: "CI/CD and infrastructure" },
  { email: "liam@security.net", firstName: "Liam", lastName: "Lee", company: "SecureNet", jobTitle: "Security Engineer", aiHint: "Data security and compliance" },
  { email: "mia@analytics.co", firstName: "Mia", lastName: "Lopez", company: "Analytics Corp", jobTitle: "Data Science Manager", aiHint: "Big data and machine learning" },
  { email: "noah@framework.com", firstName: "Noah", lastName: "Hernandez", company: "Framework Tech", jobTitle: "Architect", aiHint: "System design and scalability" },
  { email: "olivia@cloud.solutions", firstName: "Olivia", lastName: "King", company: "Cloud Solutions", jobTitle: "Solutions Architect", aiHint: "Cloud migration specialist" },
  { email: "paul@midmarket.com", firstName: "Paul", lastName: "Wright", company: "MidMarket Inc", jobTitle: "Operations Manager", aiHint: "Process optimization", listIds: ["seed-list-3"] },
  { email: "quinn@consulting.biz", firstName: "Quinn", lastName: "Lopez", company: "Consulting Plus", jobTitle: "Business Analyst", aiHint: "Digital transformation", listIds: ["seed-list-3"] },
  { email: "rachel@ecommerce.shop", firstName: "Rachel", lastName: "Jackson", company: "ECommerce Shop", jobTitle: "Growth Lead", aiHint: "E-commerce optimization", listIds: ["seed-list-3"] },
  { email: "sam@logistics.io", firstName: "Sam", lastName: "White", company: "Logistics Hub", jobTitle: "Supply Chain Director", aiHint: "Supply chain efficiency", listIds: ["seed-list-3"] },
  { email: "tina@retail.store", firstName: "Tina", lastName: "Harris", company: "Retail Plus", jobTitle: "Regional Manager", aiHint: "Retail operations", listIds: ["seed-list-3"] },
  { email: "ulrich@globalcorp.com", firstName: "Ulrich", lastName: "Martin", company: "Global Corp", jobTitle: "VP Technology", aiHint: "Enterprise transformation", listIds: ["seed-list-2"] },
  { email: "vivian@banking.finance", firstName: "Vivian", lastName: "Thompson", company: "Banking Finance", jobTitle: "Head of Innovation", aiHint: "FinTech and digital banking", listIds: ["seed-list-2"] },
  { email: "walter@insurance.com", firstName: "Walter", lastName: "Garcia", company: "Insurance Group", jobTitle: "Digital Officer", aiHint: "InsurTech solutions", listIds: ["seed-list-2"] },
  { email: "xena@healthcare.org", firstName: "Xena", lastName: "Martinez", company: "Healthcare Systems", jobTitle: "CIO", aiHint: "Healthcare IT systems", listIds: ["seed-list-2"] },
  { email: "yara@education.edu", firstName: "Yara", lastName: "Rodriguez", company: "Education Plus", jobTitle: "EdTech Director", aiHint: "Digital learning platforms", listIds: ["seed-list-2"] },
  { email: "zack@startup.biz", firstName: "Zack", lastName: "Lewis", company: "Startup Biz", jobTitle: "Founder", aiHint: "Early-stage founder" },
  { email: "amelia@nonprofit.org", firstName: "Amelia", lastName: "Walker", company: "Nonprofit Org", jobTitle: "Executive Director", aiHint: "Nonprofit management" },
  { email: "brian@agency.co", firstName: "Brian", lastName: "Hall", company: "Agency Co", jobTitle: "Creative Director", aiHint: "Creative and design" },
  { email: "chloe@media.com", firstName: "Chloe", lastName: "Young", company: "Media Corp", jobTitle: "Editor", aiHint: "Content and editorial" },
  { email: "invalid-email", firstName: "Invalid", lastName: "Email", company: "Test", jobTitle: "Tester", aiHint: "" },
  { email: "unsubscribed1@example.com", firstName: "John", lastName: "Unsubscribed", company: "Old Corp", jobTitle: "Manager", status: "unsubscribed", listIds: ["seed-list-1"] },
  { email: "unsubscribed2@example.com", firstName: "Jane", lastName: "OptOut", company: "NoMore Inc", jobTitle: "Director", status: "unsubscribed", listIds: ["seed-list-1"] },
  { email: "suppressed1@spam.com", firstName: "Spam", lastName: "Filter", company: "Blacklist Co", jobTitle: "CEO", status: "suppressed", listIds: ["seed-list-2"] },
  { email: "suppressed2@bounce.io", firstName: "Hard", lastName: "Bounce", company: "Bad Domain", jobTitle: "Contact", status: "suppressed", listIds: ["seed-list-2"] },
  { email: "invalid1@invalid", firstName: "Bad", lastName: "Email1", company: "Test", jobTitle: "Tester", status: "invalid", listIds: ["seed-list-3"] },
  { email: "invalid2@", firstName: "Bad", lastName: "Email2", company: "Test", jobTitle: "Tester", status: "invalid", listIds: ["seed-list-3"] },
  { email: "suppressed3@complainers.net", firstName: "Complaint", lastName: "Lodge", company: "Angry Org", jobTitle: "VP", status: "suppressed" },
  { email: "unsubscribed3@example.com", firstName: "Mark", lastName: "NoInterest", company: "Done Corp", jobTitle: "Analyst", status: "unsubscribed" },
];

export const ACTIVE_EMAIL_BODIES = [
  "Hi {firstName}, we'd love to explore how our platform can help you achieve your goals. Looking forward to connecting!",
  "Hello {firstName}, check out what we've been building. Think it could be valuable for {company}?",
  "{firstName}, our platform helps teams like yours automate outreach at scale. Interested in a demo?",
  "Hi there, we noticed {company} is growing fast. Let's talk about how we can help!",
  "Quick question {firstName} - what's your biggest challenge with email outreach right now?",
];

export const ACTIVE_EMAIL_SUBJECTS = [
  "Quick question about {company}'s growth strategy",
  "{firstName}, would love to connect",
  "Helping {company} scale outreach efficiently",
  "Your team might find this useful",
  "5 min demo of what we've built",
];

export const CAMPAIGN_PROMPTS = {
  campaign1: `You are an expert B2B cold email copywriter specializing in SaaS outreach to technical leaders and C-suite executives. Your goal is to get recipients to book a 30-minute product demo for MailWave, an AI-powered email automation platform.

Write concise, professional emails (3-4 paragraphs) that feel personally crafted - never generic. Lead with a specific observation about the recipient's role or company, then connect it to a concrete pain point MailWave solves. Close with a single, low-friction CTA to book a demo.

Rules:
- Never open with "I hope this email finds you well" or similar filler.
- Avoid feature dumps - focus on one clear outcome.
- Use the recipient's first name, company, and job title naturally.
- Keep the subject line under 8 words and make it curiosity-driven.`,
  campaign2: `You are a senior enterprise sales copywriter crafting partnership pitch emails for MailWave Enterprise Suite. Recipients are VPs and C-level executives at large organizations. The goal is to open a conversation about a strategic partnership - not to sell software directly.

Write detailed, authoritative emails (5+ paragraphs) that demonstrate you understand their industry challenges. Position MailWave as a force-multiplier for their existing operations. Reference the recipient's specific domain (finance, healthcare, logistics, etc.) when available.

Rules:
- Lead with an insight about their industry, not about MailWave.
- Frame the partnership angle early - this is a collaboration pitch, not a cold sale.
- Include a specific, credible value statement (e.g., "teams using MailWave reduce manual outreach time by 70%").
- CTA must be low-pressure: suggest a brief exploratory call, not a demo.
- Subject lines should feel like they come from a peer, not a vendor.`,
  campaign3: `You are a friendly growth marketing copywriter writing outreach emails for MailWave's Growth Plan - aimed at mid-market companies looking to scale their outreach without hiring more SDRs. The goal is to get recipients to start a free trial.

Write approachable, energetic emails (3-4 paragraphs) that feel like a recommendation from a knowledgeable colleague. Focus on the speed-to-value: recipients can get their first AI-personalized campaign running in under an hour.

Rules:
- Open with a relatable pain point (e.g., hours lost on manual email personalization).
- Use conversational language - contractions are fine, jargon is not.
- Include one concrete, specific benefit tied to the recipient's role.
- CTA: "Start your free trial" - make it feel effortless, not committal.
- Keep subject lines punchy and benefit-oriented.`,
  campaign4: `You are an upbeat customer marketing copywriter writing retention emails for existing MailWave users. The goal is to re-engage customers with a time-limited exclusive offer on MailWave Premium Features, driving upgrades and reducing churn.

Write short, energetic emails (1-2 paragraphs) with a strong sense of urgency and exclusivity. Treat the recipient as an insider - acknowledge they're already a MailWave user and reward them for it.

Rules:
- Open by acknowledging their existing relationship with the product.
- Highlight one Premium feature that's most relevant to their role or company size.
- Create urgency without being pushy - "reserved for active users" beats "limited time only".
- CTA: "Claim your exclusive offer" - one link, one action.
- Subject lines should feel like a personal notification, not a marketing blast.`,
  campaign5: `You are a warm, genuine copywriter writing end-of-year thank-you emails on behalf of the MailWave team. Recipients are established customers and contacts who have been part of the MailWave journey. The tone is heartfelt and human - this is not a sales email.

Write short, sincere emails (1-2 paragraphs) that express genuine gratitude and briefly tease what's coming in 2025. Make each email feel like it was written personally, not blasted to a list.

Rules:
- Open with a warm, specific acknowledgment of the recipient (their company, role, or industry).
- Keep the focus on gratitude - avoid any sales language or upsells.
- Mention the 2025 roadmap naturally, as something exciting to look forward to together.
- CTA: "Check out the 2025 roadmap" - frame it as a gift, not a redirect.
- Subject lines should feel festive and personal, not corporate.`,
} as const;

export const NOTIFICATION_EVENT_TYPES = [
  "campaign_started",
  "campaign_completed",
  "campaign_failed",
  "campaign_paused",
  "ai_generation_complete",
  "ai_generation_error",
  "smtp_connected",
  "smtp_failed",
  "import_complete",
] as const;
