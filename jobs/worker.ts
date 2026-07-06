import { startGenerateWorker } from "../lib/jobs/generate-campaign";
import { startSendWorker } from "../lib/jobs/send-campaign";
import { startApplySuppressThresholdWorker } from "../lib/jobs/apply-suppress-threshold";
import { startDailyDigestWorker } from "../lib/jobs/daily-digest";
import { QUEUE_NAMES } from "../lib/jobs/queue";

const generateWorker = startGenerateWorker();
const sendWorker = startSendWorker();
const suppressWorker = startApplySuppressThresholdWorker();
const dailyDigestWorker = startDailyDigestWorker();

console.log(
  `MailWave worker started — queues: ${QUEUE_NAMES.generate}, ${QUEUE_NAMES.send}, ${QUEUE_NAMES.suppressContacts}, ${QUEUE_NAMES.dailyDigest} (redis: ${
    process.env.REDIS_URL ?? "redis://localhost:6379"
  })`
);

async function shutdown(signal: string) {
  console.log(`${signal} received, closing workers...`);
  await Promise.all([generateWorker.close(), sendWorker.close(), suppressWorker.close(), dailyDigestWorker.close()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
