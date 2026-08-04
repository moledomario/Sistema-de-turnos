-- AlterTable
ALTER TABLE "user" ADD COLUMN     "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;

-- Las cuentas que ya existían se configuraron a mano desde el panel, así que no
-- tiene sentido mandarlas al onboarding. El default en false aplica a las nuevas.
UPDATE "user" SET "onboarding_completed" = true;
