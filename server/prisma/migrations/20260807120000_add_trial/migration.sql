-- AlterTable
ALTER TABLE "user" ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- Las cuentas que ya existían nunca tuvieron prueba, porque la prueba no
-- existía. Sin este UPDATE, el día que esto se despliegue todas quedarían sin
-- acceso de golpe: el gating las leería como "prueba vencida" y dejarían de
-- poder tocar su panel y de recibir turnos, sin aviso.
-- Se les da la misma ventana de 14 días, contada desde la migración.
UPDATE "user"
SET "trial_ends_at" = NOW() + INTERVAL '14 days'
WHERE "role" = 'PROFESSIONAL' AND "trial_ends_at" IS NULL;
