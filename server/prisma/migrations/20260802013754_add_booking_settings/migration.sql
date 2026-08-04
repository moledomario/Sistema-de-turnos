-- AlterTable
ALTER TABLE "user" ADD COLUMN     "cancel_notice_hours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_days_ahead" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "min_notice_hours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notify_on_booking" BOOLEAN NOT NULL DEFAULT true;
