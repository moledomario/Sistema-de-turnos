-- AlterTable
ALTER TABLE "user" ADD COLUMN     "magic_token_expires" TIMESTAMP(3),
ADD COLUMN     "magic_token_hash" TEXT;
