-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('INDIVIDUAL', 'EQUIPO', 'NEGOCIO');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'INDIVIDUAL';

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMember_account_id_idx" ON "TeamMember"("account_id");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
