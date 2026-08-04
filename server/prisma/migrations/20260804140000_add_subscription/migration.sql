-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'PENDING', 'AUTHORIZED', 'PAUSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "mp_preapproval_id" TEXT,
ADD COLUMN     "subscription_next_payment" TIMESTAMP(3),
ADD COLUMN     "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE UNIQUE INDEX "user_mp_preapproval_id_key" ON "user"("mp_preapproval_id");
