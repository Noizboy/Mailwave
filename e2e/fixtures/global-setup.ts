// E2E prerequisites: PostgreSQL and Redis running, mailwave/.env configured.
// Ensures the deterministic demo user (demo@mailwave.app / password123) exists
// by running the idempotent seed before any spec.
import { execSync } from "child_process";
import path from "path";

export default function globalSetup() {
  execSync("npx tsx prisma/seed.ts", {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit",
  });
}
