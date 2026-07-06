import { Queue } from "bullmq";

export const QUEUE_NAMES = {
  generate: "campaign-generate",
  send: "campaign-send",
  suppressContacts: "suppress-contacts",
  dailyDigest: "daily-digest",
} as const;

function redisOptions() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return { url };
}

let generateQueue: Queue | null = null;
let sendQueue: Queue | null = null;
let suppressContactsQueue: Queue | null = null;

export function getGenerateQueue(): Queue {
  if (!generateQueue) {
    generateQueue = new Queue(QUEUE_NAMES.generate, { connection: redisOptions() });
  }
  return generateQueue;
}

export function getSendQueue(): Queue {
  if (!sendQueue) {
    sendQueue = new Queue(QUEUE_NAMES.send, { connection: redisOptions() });
  }
  return sendQueue;
}

export function getSuppressContactsQueue(): Queue {
  if (!suppressContactsQueue) {
    suppressContactsQueue = new Queue(QUEUE_NAMES.suppressContacts, { connection: redisOptions() });
  }
  return suppressContactsQueue;
}
