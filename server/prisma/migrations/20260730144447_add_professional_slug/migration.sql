-- AlterTable
ALTER TABLE "user" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_slug_key" ON "user"("slug");
