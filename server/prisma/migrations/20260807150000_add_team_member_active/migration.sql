-- Baja lógica de un profesional del equipo.
--
-- Hace falta porque el borrado real es imposible en cuanto el miembro atendió
-- una vez: `appointment.team_member_id` y `appointment.professional_service_id`
-- son FK con RESTRICT, y con razón — esos turnos son el historial del negocio.
-- Sin esto, un profesional que se va de la peluquería se quedaría para siempre
-- en el link público.
ALTER TABLE "TeamMember" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
