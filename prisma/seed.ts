import "dotenv/config";
import { createPrismaClient, DAY } from "./seed/shared";
import { hashSeedPassword, seedDemoUser } from "./seed/users";
import { seedContacts, addMembersToList } from "./seed/contacts";
import { seedLists } from "./seed/lists";
import { seedCampaigns, seedActiveCampaignEmails, seedCompletedCampaignEmails } from "./seed/campaigns";
import { seedNotificationPreferences } from "./seed/notifications";
import { LIST_SEEDS, CAMPAIGN_PROMPTS } from "./seed/fixtures";

// Fail closed: never seed a production database. The demo user has a known
// password and seeding production would leave a trivially-guessable account
// in place (CN-003).
if (process.env.NODE_ENV === "production") {
  console.error("✗ Refusing to seed a production database (NODE_ENV=production).");
  console.error("  Seed creates a demo user with a known password - dev/test only.");
  process.exit(1);
}

// Composition entry point. Fixtures live in prisma/seed/fixtures.ts and each
// domain's persistence lives in its own module under prisma/seed/. This file
// only orchestrates the run order and the demo-scenario assembly that depends
// on runtime-computed values (list ids, contact counts, timestamps).

async function main() {
  const prisma = createPrismaClient();

  try {
    console.log("🌱 Seeding database with extended mockups...");

    const { passwordHash, demoPassword } = await hashSeedPassword();
    const now = Date.now();

    const user = await seedDemoUser(prisma, passwordHash);
    console.log(`✅ Demo user: ${user.email} / ${demoPassword}`);

    const seededContacts = await seedContacts(prisma, user.id);
    const allContacts = seededContacts.map(({ contact }) => contact);
    const validContacts = seededContacts
      .map(({ contact }) => contact)
      .filter((contact) => contact.status === "subscribed");
    const issueCount = allContacts.length - validContacts.length;

    console.log(`✅ ${allContacts.length} contacts seeded (${issueCount} with issues)`);

    const lists = await seedLists(prisma, user.id);
    const listMemberships = Object.fromEntries(
      LIST_SEEDS.map((listSeed) => [
        listSeed.id,
        seededContacts
          .filter(({ listIds }) => listIds.includes(listSeed.id))
          .map(({ contact }) => contact.id),
      ]),
    ) as Record<(typeof LIST_SEEDS)[number]["id"], string[]>;

    await addMembersToList(prisma, lists["seed-list-1"].id, listMemberships["seed-list-1"]);
    await addMembersToList(prisma, lists["seed-list-2"].id, listMemberships["seed-list-2"]);
    await addMembersToList(prisma, lists["seed-list-3"].id, listMemberships["seed-list-3"]);
    // Keep the active-leads list aligned with the seeded campaign audience.
    await addMembersToList(
      prisma,
      lists["seed-list-4"].id,
      allContacts.map((contact) => contact.id),
    );

    console.log(`✅ List "Tech Leaders Q1" seeded with ${listMemberships["seed-list-1"].length} members (2 issues)`);
    console.log(`✅ List "Enterprise Accounts" seeded with ${listMemberships["seed-list-2"].length} members (2 issues)`);
    console.log(`✅ List "Mid-Market Growth" seeded with ${listMemberships["seed-list-3"].length} members (2 issues)`);
    console.log(`✅ List "All Active Leads" seeded with ${allContacts.length} members (${issueCount} issues)`);

    const techLeaders = seededContacts
      .filter(({ contact, listIds }) => listIds.includes("seed-list-1") && contact.status === "subscribed")
      .map(({ contact }) => contact);
    const sentCount = Math.floor(allContacts.length * 0.6);
    const pendingCount = allContacts.length - sentCount;

    const campaigns = await seedCampaigns(prisma, user.id, [
      {
        id: "seed-campaign-1",
        name: "Q1 Outreach - Tech Leaders",
        listId: lists["seed-list-1"].id,
        goal: "Schedule product demo calls",
        product: "MailWave Email Platform",
        cta: "Book a 30-min demo",
        tone: "professional",
        language: "en",
        emailLength: "medium",
        systemPrompt: CAMPAIGN_PROMPTS.campaign1,
        status: "pending",
        minInterval: 3,
        maxInterval: 8,
        dailyLimit: 100,
        hourlyLimit: 20,
      },
      {
        id: "seed-campaign-2",
        name: "Enterprise Partnership Pitch",
        listId: lists["seed-list-2"].id,
        goal: "Generate partnership opportunities",
        product: "MailWave Enterprise Suite",
        cta: "Schedule partnership discussion",
        tone: "professional",
        language: "en",
        emailLength: "long",
        systemPrompt: CAMPAIGN_PROMPTS.campaign2,
        status: "pending_review",
        totalEmails: 5,
        minInterval: 5,
        maxInterval: 12,
        dailyLimit: 50,
        hourlyLimit: 10,
      },
      {
        id: "seed-campaign-3",
        name: "Mid-Market Growth Initiative",
        listId: lists["seed-list-3"].id,
        goal: "Drive product adoption",
        product: "MailWave Growth Plan",
        cta: "Start free trial",
        tone: "friendly",
        language: "en",
        emailLength: "medium",
        systemPrompt: CAMPAIGN_PROMPTS.campaign3,
        status: "ready_to_send",
        totalEmails: 5,
        minInterval: 2,
        maxInterval: 6,
        dailyLimit: 100,
        hourlyLimit: 20,
      },
      {
        id: "seed-campaign-4",
        name: "Seasonal Promotion Launch",
        listId: lists["seed-list-4"].id,
        goal: "Increase customer retention",
        product: "MailWave Premium Features",
        cta: "Claim your exclusive offer",
        tone: "upbeat",
        language: "en",
        emailLength: "short",
        systemPrompt: CAMPAIGN_PROMPTS.campaign4,
        status: "sending",
        totalEmails: allContacts.length,
        sentCount,
        pendingCount,
        minInterval: 1,
        maxInterval: 4,
        dailyLimit: 200,
        hourlyLimit: 30,
        startedAt: new Date(now - 3 * DAY),
      },
      {
        id: "seed-campaign-5",
        name: "Q4 End-of-Year Thank You",
        listId: lists["seed-list-1"].id,
        goal: "Thank you and holiday greeting",
        product: "MailWave Platform",
        cta: "Check out 2025 roadmap",
        tone: "warm",
        language: "en",
        emailLength: "short",
        systemPrompt: CAMPAIGN_PROMPTS.campaign5,
        status: "completed",
        totalEmails: techLeaders.length,
        sentCount: techLeaders.length,
        failedCount: 0,
        minInterval: 1,
        maxInterval: 2,
        dailyLimit: 500,
        hourlyLimit: 50,
        startedAt: new Date(now - 30 * DAY),
        completedAt: new Date(now - 25 * DAY),
      },
    ]);

    console.log("✅ 5 campaigns seeded (pending, pending_review, ready_to_send, sending, completed)");

    await seedActiveCampaignEmails(prisma, campaigns["seed-campaign-4"].id, allContacts, sentCount, now);
    console.log(`✅ ${allContacts.length} campaign emails seeded for active campaign`);

    await seedCompletedCampaignEmails(prisma, campaigns["seed-campaign-5"].id, techLeaders, now);
    console.log(`✅ ${techLeaders.length} campaign emails seeded for completed campaign`);

    await seedNotificationPreferences(prisma, user.id);
    console.log("✅ Notification preferences seeded");
    console.log("✅ Seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
