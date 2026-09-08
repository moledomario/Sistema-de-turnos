-- Los miembros del equipo dejan de ser datos de presentación y pasan a tener
-- agenda propia: horarios, servicios y turnos cuelgan del miembro.
--
-- El orden importa. Las columnas nuevas entran nullable, se rellenan, y recién
-- ahí se les pone NOT NULL: si entraran obligatorias de una, la migración
-- fallaría en cualquier base que ya tenga datos.

-- 1. El miembro que representa al titular de la cuenta.
ALTER TABLE "TeamMember" ADD COLUMN "is_owner" BOOLEAN NOT NULL DEFAULT false;

-- 2. Se le crea a cada cuenta su miembro dueño, con los datos que hasta ahora
--    estaban en el user (es el que aparecía en el link público). Los TeamMember
--    que ya existían quedan como miembros comunes: existen, pero todavía sin
--    horarios ni servicios, que es exactamente lo que eran hasta ahora.
--
--    La condición no se limita a role='PROFESSIONAL': si alguna fila de agenda
--    quedó colgando de un usuario con otro rol, igual necesita su miembro, o el
--    NOT NULL del paso 5 no va a poder aplicarse.
INSERT INTO "TeamMember" (id, account_id, name, description, image, is_owner, created_at, updated_at)
SELECT
    gen_random_uuid(),
    u.id,
    NULLIF(TRIM(CONCAT(u.firts_name, ' ', u.last_name)), ''),
    u.description,
    u.image,
    true,
    NOW(),
    NOW()
FROM "user" u
WHERE u.role = 'PROFESSIONAL'
   OR EXISTS (SELECT 1 FROM "availability" a WHERE a.user_id = u.id)
   OR EXISTS (SELECT 1 FROM "ProfessionalService" ps WHERE ps.user_id = u.id)
   OR EXISTS (SELECT 1 FROM "appointment" ap WHERE ap.professional_id = u.id);

-- El nombre es obligatorio en el modelo; si alguna cuenta no tenía nombre
-- cargado, el NULLIF de arriba lo dejó en NULL y hay que darle algo.
UPDATE "TeamMember" SET name = 'Profesional' WHERE name IS NULL;

-- 3. Las columnas nuevas, todavía nullable.
ALTER TABLE "availability" ADD COLUMN "team_member_id" UUID;
ALTER TABLE "ProfessionalService" ADD COLUMN "team_member_id" UUID;
ALTER TABLE "appointment" ADD COLUMN "team_member_id" UUID;

-- 4. Todo lo que existe pasa a ser del miembro dueño: hasta hoy la agenda era
--    de la cuenta, y la cuenta es él.
UPDATE "availability" a
SET "team_member_id" = tm.id
FROM "TeamMember" tm
WHERE tm.account_id = a.user_id AND tm.is_owner = true;

UPDATE "ProfessionalService" ps
SET "team_member_id" = tm.id
FROM "TeamMember" tm
WHERE tm.account_id = ps.user_id AND tm.is_owner = true;

UPDATE "appointment" ap
SET "team_member_id" = tm.id
FROM "TeamMember" tm
WHERE tm.account_id = ap.professional_id AND tm.is_owner = true;

-- 5. Ahora sí, obligatorias.
ALTER TABLE "availability" ALTER COLUMN "team_member_id" SET NOT NULL;
ALTER TABLE "ProfessionalService" ALTER COLUMN "team_member_id" SET NOT NULL;
ALTER TABLE "appointment" ALTER COLUMN "team_member_id" SET NOT NULL;

-- 6. Claves foráneas e índices.
ALTER TABLE "availability" ADD CONSTRAINT "availability_team_member_id_fkey"
    FOREIGN KEY ("team_member_id") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_team_member_id_fkey"
    FOREIGN KEY ("team_member_id") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_team_member_id_fkey"
    FOREIGN KEY ("team_member_id") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "availability_team_member_id_weekday_idx" ON "availability"("team_member_id", "weekday");

-- 7. La constraint de superposición se muda de la cuenta al miembro.
--    Es el cambio que hace que un equipo pueda existir: sobre professional_id,
--    dos personas del mismo negocio no podían atender a la misma hora.
ALTER TABLE "appointment" DROP CONSTRAINT appointment_overlap_constraint;

ALTER TABLE "appointment"
ADD CONSTRAINT appointment_overlap_constraint
EXCLUDE USING GIST (
    team_member_id WITH =,
    tsrange(start_time, end_time) WITH &&
) WHERE (status <> 'CANCELLED');
