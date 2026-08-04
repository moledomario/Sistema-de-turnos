-- AlterTable
ALTER TABLE "user" ADD COLUMN     "reset_token_expires" TIMESTAMP(3),
ADD COLUMN     "reset_token_hash" TEXT;
