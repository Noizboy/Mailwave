-- AlterTable User: add timezone column
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable Campaign: make listId nullable
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_listId_fkey";
ALTER TABLE "Campaign" ALTER COLUMN "listId" DROP NOT NULL;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Campaign: drop scheduledAt, add sendWindowStart / sendWindowEnd
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "scheduledAt";
ALTER TABLE "Campaign" ADD COLUMN "sendWindowStart" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "sendWindowEnd" INTEGER;
