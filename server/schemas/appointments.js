import { z } from 'zod';
import { imageDataUrlSchema } from './image.js';

const appointmentSchema = z.object({
    professional_id: z.string(),
    service_id: z.string(),
    // Con qué profesional del equipo. Opcional: si no viene, el service resuelve
    // por el dueño de la cuenta, que es el caso de quien trabaja solo. El valor
    // no se usa tal cual para guardar el turno —el miembro sale de la fila de
    // ProfessionalService que se encuentre— así que mandar uno ajeno no ensucia
    // nada: simplemente no se encuentra el servicio y da 404.
    team_member_id: z.string().optional(),
    client_id: z.string().optional(),
    start_time: z.string().transform((val) => new Date(val)),
    notes: z.string().optional(),
    // Comprobante de la seña. Es opcional aunque el servicio la pida: el turno
    // igual queda como solicitud y el profesional decide si lo acepta.
    deposit_receipt: imageDataUrlSchema.optional(),
});

const rescheduleSchema = z.object({
    start_time: z.string().transform((val) => new Date(val)),
});

function validateAppointment(appointment) {
    return appointmentSchema.safeParse(appointment);
}

function validateReschedule(data) {
    return rescheduleSchema.safeParse(data);
}

export { validateAppointment, validateReschedule };