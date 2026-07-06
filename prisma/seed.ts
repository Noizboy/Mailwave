import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

  console.log("🌱 Seeding database with extended mockups...");

  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@mailwave.app" },
    update: {},
    create: {
      email: "demo@mailwave.app",
      passwordHash,
      name: "Demo User",
      sendingAccount: {
        create: {
          suppressAfterEmails: 3,
        },
      },
    },
  });

  console.log(`✅ Demo user: ${user.email} / password123`);

  // Seed extended contacts (30 contacts)
  const contactsData = [
    // Tech leaders
    { email: "alice@acme.com", firstName: "Alice", lastName: "Johnson", company: "Acme Corp", jobTitle: "CEO", aiHint: "Loves efficiency tools and automation" },
    { email: "bob@techco.com", firstName: "Bob", lastName: "Smith", company: "TechCo", jobTitle: "CTO", aiHint: "Interested in AI and machine learning" },
    { email: "carol@startup.io", firstName: "Carol", lastName: "Davis", company: "Startup.io", jobTitle: "Marketing Director", aiHint: "Focuses on growth hacking and viral loops" },
    { email: "dave@enterprise.com", firstName: "Dave", lastName: "Wilson", company: "Enterprise Ltd", jobTitle: "VP Sales", aiHint: "Manages a large sales team, values ROI metrics" },
    { email: "emma@innovate.co", firstName: "Emma", lastName: "Brown", company: "Innovate.co", jobTitle: "Product Manager", aiHint: "Data-driven decision maker" },
    { email: "frank@cloudnine.com", firstName: "Frank", lastName: "Miller", company: "Cloud Nine", jobTitle: "Engineering Director", aiHint: "Infrastructure automation expert" },
    { email: "grace@digital.com", firstName: "Grace", lastName: "Taylor", company: "Digital Ventures", jobTitle: "CEO", aiHint: "Serial entrepreneur, growth-focused" },
    { email: "henry@saas.io", firstName: "Henry", lastName: "Anderson", company: "SaaS Inc", jobTitle: "Head of Sales", aiHint: "B2B sales specialist" },
    { email: "iris@marketing.pro", firstName: "Iris", lastName: "Martinez", company: "Marketing Pro", jobTitle: "VP Marketing", aiHint: "Content marketing and brand strategy" },
    { email: "jack@finance.com", firstName: "Jack", lastName: "Garcia", company: "Finance Plus", jobTitle: "CFO", aiHint: "Cost optimization and ROI focused" },
    // More tech contacts
    { email: "kate@devops.io", firstName: "Kate", lastName: "Chen", company: "DevOps Masters", jobTitle: "DevOps Lead", aiHint: "CI/CD and infrastructure" },
    { email: "liam@security.net", firstName: "Liam", lastName: "Lee", company: "SecureNet", jobTitle: "Security Engineer", aiHint: "Data security and compliance" },
    { email: "mia@analytics.co", firstName: "Mia", lastName: "Lopez", company: "Analytics Corp", jobTitle: "Data Science Manager", aiHint: "Big data and machine learning" },
    { email: "noah@framework.com", firstName: "Noah", lastName: "Hernandez", company: "Framework Tech", jobTitle: "Architect", aiHint: "System design and scalability" },
    { email: "olivia@cloud.solutions", firstName: "Olivia", lastName: "King", company: "Cloud Solutions", jobTitle: "Solutions Architect", aiHint: "Cloud migration specialist" },
    // Mid-market contacts
    { email: "paul@midmarket.com", firstName: "Paul", lastName: "Wright", company: "MidMarket Inc", jobTitle: "Operations Manager", aiHint: "Process optimization" },
    { email: "quinn@consulting.biz", firstName: "Quinn", lastName: "Lopez", company: "Consulting Plus", jobTitle: "Business Analyst", aiHint: "Digital transformation" },
    { email: "rachel@ecommerce.shop", firstName: "Rachel", lastName: "Jackson", company: "ECommerce Shop", jobTitle: "Growth Lead", aiHint: "E-commerce optimization" },
    { email: "sam@logistics.io", firstName: "Sam", lastName: "White", company: "Logistics Hub", jobTitle: "Supply Chain Director", aiHint: "Supply chain efficiency" },
    { email: "tina@retail.store", firstName: "Tina", lastName: "Harris", company: "Retail Plus", jobTitle: "Regional Manager", aiHint: "Retail operations" },
    // Enterprise contacts
    { email: "ulrich@globalcorp.com", firstName: "Ulrich", lastName: "Martin", company: "Global Corp", jobTitle: "VP Technology", aiHint: "Enterprise transformation" },
    { email: "vivian@banking.finance", firstName: "Vivian", lastName: "Thompson", company: "Banking Finance", jobTitle: "Head of Innovation", aiHint: "FinTech and digital banking" },
    { email: "walter@insurance.com", firstName: "Walter", lastName: "Garcia", company: "Insurance Group", jobTitle: "Digital Officer", aiHint: "InsurTech solutions" },
    { email: "xena@healthcare.org", firstName: "Xena", lastName: "Martinez", company: "Healthcare Systems", jobTitle: "CIO", aiHint: "Healthcare IT systems" },
    { email: "yara@education.edu", firstName: "Yara", lastName: "Rodriguez", company: "Education Plus", jobTitle: "EdTech Director", aiHint: "Digital learning platforms" },
    // Mixed status contacts
    { email: "zack@startup.biz", firstName: "Zack", lastName: "Lewis", company: "Startup Biz", jobTitle: "Founder", aiHint: "Early-stage founder" },
    { email: "amelia@nonprofit.org", firstName: "Amelia", lastName: "Walker", company: "Nonprofit Org", jobTitle: "Executive Director", aiHint: "Nonprofit management" },
    { email: "brian@agency.co", firstName: "Brian", lastName: "Hall", company: "Agency Co", jobTitle: "Creative Director", aiHint: "Creative and design" },
    { email: "chloe@media.com", firstName: "Chloe", lastName: "Young", company: "Media Corp", jobTitle: "Editor", aiHint: "Content and editorial" },
    { email: "invalid-email", firstName: "Invalid", lastName: "Email", company: "Test", jobTitle: "Tester", aiHint: "" },
  ];

  const savedContacts = [];
  for (const c of contactsData) {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email);
    const contact = await prisma.contact.upsert({
      where: { userId_email: { userId: user.id, email: c.email } },
      update: {},
      create: {
        userId: user.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        jobTitle: c.jobTitle,
        aiHint: c.aiHint,
        status: emailValid ? "subscribed" : "invalid",
      },
    });
    savedContacts.push(contact);
  }
  console.log(`✅ ${savedContacts.length} contacts seeded`);

  // Seed problematic contacts (unsubscribed, suppressed, invalid)
  const problematicContactsData = [
    { email: "unsubscribed1@example.com", firstName: "John", lastName: "Unsubscribed", company: "Old Corp", jobTitle: "Manager", status: "unsubscribed" as const },
    { email: "unsubscribed2@example.com", firstName: "Jane", lastName: "OptOut", company: "NoMore Inc", jobTitle: "Director", status: "unsubscribed" as const },
    { email: "suppressed1@spam.com", firstName: "Spam", lastName: "Filter", company: "Blacklist Co", jobTitle: "CEO", status: "suppressed" as const },
    { email: "suppressed2@bounce.io", firstName: "Hard", lastName: "Bounce", company: "Bad Domain", jobTitle: "Contact", status: "suppressed" as const },
    { email: "invalid1@invalid", firstName: "Bad", lastName: "Email1", company: "Test", jobTitle: "Tester", status: "invalid" as const },
    { email: "invalid2@", firstName: "Bad", lastName: "Email2", company: "Test", jobTitle: "Tester", status: "invalid" as const },
    { email: "suppressed3@complainers.net", firstName: "Complaint", lastName: "Lodge", company: "Angry Org", jobTitle: "VP", status: "suppressed" as const },
    { email: "unsubscribed3@example.com", firstName: "Mark", lastName: "NoInterest", company: "Done Corp", jobTitle: "Analyst", status: "unsubscribed" as const },
  ];

  const problematicContacts = [];
  for (const c of problematicContactsData) {
    const contact = await prisma.contact.upsert({
      where: { userId_email: { userId: user.id, email: c.email } },
      update: {},
      create: {
        userId: user.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        jobTitle: c.jobTitle,
        status: c.status,
      },
    });
    problematicContacts.push(contact);
  }
  console.log(`✅ ${problematicContacts.length} problematic contacts seeded (unsubscribed, suppressed, invalid)`);

  const allContacts = [...savedContacts, ...problematicContacts];

  // Seed multiple lists
  const validContacts = savedContacts.filter((c) => c.status === "subscribed");

  const list1 = await prisma.list.upsert({
    where: { id: "seed-list-1" },
    update: {},
    create: {
      id: "seed-list-1",
      userId: user.id,
      name: "Tech Leaders Q1",
    },
  });

  const list2 = await prisma.list.upsert({
    where: { id: "seed-list-2" },
    update: {},
    create: {
      id: "seed-list-2",
      userId: user.id,
      name: "Enterprise Accounts",
    },
  });

  const list3 = await prisma.list.upsert({
    where: { id: "seed-list-3" },
    update: {},
    create: {
      id: "seed-list-3",
      userId: user.id,
      name: "Mid-Market Growth",
    },
  });

  const list4 = await prisma.list.upsert({
    where: { id: "seed-list-4" },
    update: {},
    create: {
      id: "seed-list-4",
      userId: user.id,
      name: "All Active Leads",
    },
  });

  // Add contacts to lists
  const techLeaders = validContacts.slice(0, 10);
  for (const contact of techLeaders) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list1.id, contactId: contact.id } },
      update: {},
      create: { listId: list1.id, contactId: contact.id },
    });
  }

  const enterpriseContacts = validContacts.slice(20, 25);
  for (const contact of enterpriseContacts) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list2.id, contactId: contact.id } },
      update: {},
      create: { listId: list2.id, contactId: contact.id },
    });
  }

  const midMarketContacts = validContacts.slice(15, 20);
  for (const contact of midMarketContacts) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list3.id, contactId: contact.id } },
      update: {},
      create: { listId: list3.id, contactId: contact.id },
    });
  }

  // Add all valid contacts to "All Active Leads"
  for (const contact of validContacts) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list4.id, contactId: contact.id } },
      update: {},
      create: { listId: list4.id, contactId: contact.id },
    });
  }

  // Add problematic contacts to lists (to create "issues")
  // Tech Leaders Q1 gets some suppressed and unsubscribed contacts
  const issuesForList1 = problematicContacts.slice(0, 2);
  for (const contact of issuesForList1) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list1.id, contactId: contact.id } },
      update: {},
      create: { listId: list1.id, contactId: contact.id },
    });
  }

  // Enterprise Accounts gets some invalid emails
  const issuesForList2 = problematicContacts.slice(2, 4);
  for (const contact of issuesForList2) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list2.id, contactId: contact.id } },
      update: {},
      create: { listId: list2.id, contactId: contact.id },
    });
  }

  // Mid-Market Growth gets some unsubscribed contacts
  const issuesForList3 = problematicContacts.slice(4, 6);
  for (const contact of issuesForList3) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list3.id, contactId: contact.id } },
      update: {},
      create: { listId: list3.id, contactId: contact.id },
    });
  }

  // All Active Leads gets all problematic contacts
  for (const contact of problematicContacts) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId: list4.id, contactId: contact.id } },
      update: {},
      create: { listId: list4.id, contactId: contact.id },
    });
  }

  console.log(`✅ List "Tech Leaders Q1" seeded with ${techLeaders.length + issuesForList1.length} members (${issuesForList1.length} issues)`);
  console.log(`✅ List "Enterprise Accounts" seeded with ${enterpriseContacts.length + issuesForList2.length} members (${issuesForList2.length} issues)`);
  console.log(`✅ List "Mid-Market Growth" seeded with ${midMarketContacts.length + issuesForList3.length} members (${issuesForList3.length} issues)`);
  console.log(`✅ List "All Active Leads" seeded with ${validContacts.length + problematicContacts.length} members (${problematicContacts.length} issues)`);

  // Seed multiple campaigns in different states

  // Campaign 1: Draft campaign
  const sp1 = `You are an expert B2B cold email copywriter specializing in SaaS outreach to technical leaders and C-suite executives. Your goal is to get recipients to book a 30-minute product demo for MailWave, an AI-powered email automation platform.

Write concise, professional emails (3-4 paragraphs) that feel personally crafted — never generic. Lead with a specific observation about the recipient's role or company, then connect it to a concrete pain point MailWave solves. Close with a single, low-friction CTA to book a demo.

Rules:
- Never open with "I hope this email finds you well" or similar filler.
- Avoid feature dumps — focus on one clear outcome.
- Use the recipient's first name, company, and job title naturally.
- Keep the subject line under 8 words and make it curiosity-driven.`;

  const campaign1 = await prisma.campaign.upsert({
    where: { id: "seed-campaign-1" },
    update: { systemPrompt: sp1 },
    create: {
      id: "seed-campaign-1",
      userId: user.id,
      name: "Q1 Outreach — Tech Leaders",
      listId: list1.id,
      goal: "Schedule product demo calls",
      product: "MailWave Email Platform",
      cta: "Book a 30-min demo",
      tone: "professional",
      language: "en",
      emailLength: "medium",
      systemPrompt: sp1,
      status: "draft",
      minInterval: 3,
      maxInterval: 8,
      dailyLimit: 100,
      hourlyLimit: 20,
    },
  });

  // Campaign 2: Pending review campaign
  const sp2 = `You are a senior enterprise sales copywriter crafting partnership pitch emails for MailWave Enterprise Suite. Recipients are VPs and C-level executives at large organizations. The goal is to open a conversation about a strategic partnership — not to sell software directly.

Write detailed, authoritative emails (5+ paragraphs) that demonstrate you understand their industry challenges. Position MailWave as a force-multiplier for their existing operations. Reference the recipient's specific domain (finance, healthcare, logistics, etc.) when available.

Rules:
- Lead with an insight about their industry, not about MailWave.
- Frame the partnership angle early — this is a collaboration pitch, not a cold sale.
- Include a specific, credible value statement (e.g., "teams using MailWave reduce manual outreach time by 70%").
- CTA must be low-pressure: suggest a brief exploratory call, not a demo.
- Subject lines should feel like they come from a peer, not a vendor.`;

  const campaign2 = await prisma.campaign.upsert({
    where: { id: "seed-campaign-2" },
    update: { systemPrompt: sp2 },
    create: {
      id: "seed-campaign-2",
      userId: user.id,
      name: "Enterprise Partnership Pitch",
      listId: list2.id,
      goal: "Generate partnership opportunities",
      product: "MailWave Enterprise Suite",
      cta: "Schedule partnership discussion",
      tone: "professional",
      language: "en",
      emailLength: "long",
      systemPrompt: sp2,
      status: "pending_review",
      totalEmails: 5,
      minInterval: 5,
      maxInterval: 12,
      dailyLimit: 50,
      hourlyLimit: 10,
    },
  });

  // Campaign 3: Ready to send campaign
  const sp3 = `You are a friendly growth marketing copywriter writing outreach emails for MailWave's Growth Plan — aimed at mid-market companies looking to scale their outreach without hiring more SDRs. The goal is to get recipients to start a free trial.

Write approachable, energetic emails (3-4 paragraphs) that feel like a recommendation from a knowledgeable colleague. Focus on the speed-to-value: recipients can get their first AI-personalized campaign running in under an hour.

Rules:
- Open with a relatable pain point (e.g., hours lost on manual email personalization).
- Use conversational language — contractions are fine, jargon is not.
- Include one concrete, specific benefit tied to the recipient's role.
- CTA: "Start your free trial" — make it feel effortless, not committal.
- Keep subject lines punchy and benefit-oriented.`;

  const campaign3 = await prisma.campaign.upsert({
    where: { id: "seed-campaign-3" },
    update: { systemPrompt: sp3 },
    create: {
      id: "seed-campaign-3",
      userId: user.id,
      name: "Mid-Market Growth Initiative",
      listId: list3.id,
      goal: "Drive product adoption",
      product: "MailWave Growth Plan",
      cta: "Start free trial",
      tone: "friendly",
      language: "en",
      emailLength: "medium",
      systemPrompt: sp3,
      status: "ready_to_send",
      totalEmails: 5,
      minInterval: 2,
      maxInterval: 6,
      dailyLimit: 100,
      hourlyLimit: 20,
    },
  });

  // Campaign 4: Active/sending campaign
  const sp4 = `You are an upbeat customer marketing copywriter writing retention emails for existing MailWave users. The goal is to re-engage customers with a time-limited exclusive offer on MailWave Premium Features, driving upgrades and reducing churn.

Write short, energetic emails (1-2 paragraphs) with a strong sense of urgency and exclusivity. Treat the recipient as an insider — acknowledge they're already a MailWave user and reward them for it.

Rules:
- Open by acknowledging their existing relationship with the product.
- Highlight one Premium feature that's most relevant to their role or company size.
- Create urgency without being pushy — "reserved for active users" beats "limited time only".
- CTA: "Claim your exclusive offer" — one link, one action.
- Subject lines should feel like a personal notification, not a marketing blast.`;

  const campaign4 = await prisma.campaign.upsert({
    where: { id: "seed-campaign-4" },
    update: { systemPrompt: sp4 },
    create: {
      id: "seed-campaign-4",
      userId: user.id,
      name: "Seasonal Promotion Launch",
      listId: list4.id,
      goal: "Increase customer retention",
      product: "MailWave Premium Features",
      cta: "Claim your exclusive offer",
      tone: "upbeat",
      language: "en",
      emailLength: "short",
      systemPrompt: sp4,
      status: "sending",
      totalEmails: allContacts.length,
      sentCount: Math.floor(allContacts.length * 0.6),
      pendingCount: Math.floor(allContacts.length * 0.4),
      minInterval: 1,
      maxInterval: 4,
      dailyLimit: 200,
      hourlyLimit: 30,
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // Campaign 5: Completed campaign
  const sp5 = `You are a warm, genuine copywriter writing end-of-year thank-you emails on behalf of the MailWave team. Recipients are established customers and contacts who have been part of the MailWave journey. The tone is heartfelt and human — this is not a sales email.

Write short, sincere emails (1-2 paragraphs) that express genuine gratitude and briefly tease what's coming in 2025. Make each email feel like it was written personally, not blasted to a list.

Rules:
- Open with a warm, specific acknowledgment of the recipient (their company, role, or industry).
- Keep the focus on gratitude — avoid any sales language or upsells.
- Mention the 2025 roadmap naturally, as something exciting to look forward to together.
- CTA: "Check out the 2025 roadmap" — frame it as a gift, not a redirect.
- Subject lines should feel festive and personal, not corporate.`;

  const campaign5 = await prisma.campaign.upsert({
    where: { id: "seed-campaign-5" },
    update: { systemPrompt: sp5 },
    create: {
      id: "seed-campaign-5",
      userId: user.id,
      name: "Q4 End-of-Year Thank You",
      listId: list1.id,
      goal: "Thank you and holiday greeting",
      product: "MailWave Platform",
      cta: "Check out 2025 roadmap",
      tone: "warm",
      language: "en",
      emailLength: "short",
      systemPrompt: sp5,
      status: "completed",
      totalEmails: techLeaders.length,
      sentCount: techLeaders.length,
      failedCount: 0,
      minInterval: 1,
      maxInterval: 2,
      dailyLimit: 500,
      hourlyLimit: 50,
      startedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`✅ 5 campaigns seeded (draft, pending_review, ready_to_send, sending, completed)`);

  // Seed campaign emails for the active campaign
  const emailBodies = [
    "Hi {firstName}, we'd love to explore how our platform can help you achieve your goals. Looking forward to connecting!",
    "Hello {firstName}, check out what we've been building. Think it could be valuable for {company}?",
    "{firstName}, our platform helps teams like yours automate outreach at scale. Interested in a demo?",
    "Hi there, we noticed {company} is growing fast. Let's talk about how we can help!",
    "Quick question {firstName} - what's your biggest challenge with email outreach right now?",
  ];

  const sampleSubjects = [
    "Quick question about {company}'s growth strategy",
    "{firstName}, would love to connect",
    "Helping {company} scale outreach efficiently",
    "Your team might find this useful",
    "5 min demo of what we've built",
  ];

  // Add campaign emails to the active campaign
  for (let i = 0; i < allContacts.length; i++) {
    const contact = allContacts[i];
    const isSent = i < Math.floor(allContacts.length * 0.6);
    const emailStatus = isSent ? "sent" : "pending";
    const approvalStatus = isSent ? "approved" : "pending";

    const subject = sampleSubjects[i % sampleSubjects.length]
      .replace("{firstName}", contact.firstName || "there")
      .replace("{company}", contact.company || "your company");

    const body = emailBodies[i % emailBodies.length]
      .replace("{firstName}", contact.firstName || "there")
      .replace("{company}", contact.company || "your company");

    await prisma.campaignEmail.upsert({
      where: { campaignId_contactId: { campaignId: campaign4.id, contactId: contact.id } },
      update: {},
      create: {
        campaignId: campaign4.id,
        contactId: contact.id,
        subject,
        body,
        status: emailStatus,
        approvalStatus,
        generatedAt: isSent ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) : null,
        sentAt: isSent ? new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000) : null,
        personalizationNotes: `Email for {jobTitle}`,
      },
    });
  }

  console.log(`✅ ${allContacts.length} campaign emails seeded for active campaign`);

  // Add some campaign emails for the completed campaign
  for (const contact of techLeaders) {
    await prisma.campaignEmail.upsert({
      where: { campaignId_contactId: { campaignId: campaign5.id, contactId: contact.id } },
      update: {},
      create: {
        campaignId: campaign5.id,
        contactId: contact.id,
        subject: `Happy Holidays ${contact.firstName || ""}!`,
        body: `Hi ${contact.firstName || "there"}, wishing you a wonderful holiday season! Check out what we have planned for 2025.`,
        status: "sent",
        approvalStatus: "approved",
        generatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        sentAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`✅ ${techLeaders.length} campaign emails seeded for completed campaign`);

  // Seed default notification preferences
  const eventTypes = [
    "campaign_started",
    "campaign_completed",
    "campaign_failed",
    "campaign_paused",
    "ai_generation_complete",
    "ai_generation_error",
    "smtp_connected",
    "smtp_failed",
    "import_complete",
  ];

  for (const eventType of eventTypes) {
    await prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId: user.id, eventType } },
      update: {},
      create: { userId: user.id, eventType, inApp: true, email: false },
    });
  }
  console.log(`✅ Notification preferences seeded`);

  await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
  console.log("✅ Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
