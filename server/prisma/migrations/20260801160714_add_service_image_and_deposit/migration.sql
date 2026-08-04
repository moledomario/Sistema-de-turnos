-- AlterTable
ALTER TABLE "ProfessionalService" ADD COLUMN     "bank_details" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "requires_deposit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "appointment" ADD COLUMN     "deposit_receipt" TEXT;
