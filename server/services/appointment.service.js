import { prisma } from '../src/lib/prisma.js';
import { weekdayOf, fitsInWindows, bookingWindow, zonedTime } from '../src/lib/schedule.js';
import {
    notificationInclude,
    notifyProfessionalOfBooking,
    notifyClientOfConfirmation,
    notifyInBackground,
} from './notification.service.js';

// Reglas de reserva que configura el profesional: cuánta antelación mínima pide
// y hasta cuándo deja reservar. Se valida acá además de al listar horarios,
// porque el horario puede llegar armado a mano.
const assertInsideBookingWindow = async (professionalId, startTime) => {
    const settings = await prisma.user.findUnique({
        where: { id: professionalId },
        select: { min_notice_hours: true, max_days_ahead: true },
    });
    const { from, until } = bookingWindow(settings);

    if (startTime < from) {
        const error = new Error(
            settings.min_notice_hours > 0
                ? `Este profesional pide reservar con al menos ${settings.min_notice_hours} h de anticipación`
                : 'Ese horario ya pasó'
        );
        error.status = 409;
        throw error;
    }

    if (startTime > until) {
        const error = new Error(
            `Todavía no se puede reservar tan lejos: el máximo es ${settings.max_days_ahead} días`
        );
        error.status = 409;
        throw error;
    }
};

// Corta la operación si el horario pedido no cae dentro de la atención del
// profesional ese día de la semana (día cerrado, fuera de hora, o un corte).
const assertInsideWorkingHours = async (professionalId, startTime, endTime) => {
    const windows = await prisma.availability.findMany({
        where: { user_id: professionalId, weekday: weekdayOf(startTime) },
    });

    if (!fitsInWindows(startTime, endTime, windows)) {
        const error = new Error('El profesional no atiende en ese horario');
        error.status = 409;
        throw error;
    }
};

//crear turno
const createAppointmentService = async (appointmentData) => {


    const findProfessionalService = await prisma.professionalService.findFirst({
        where: {
            user_id: appointmentData.professional_id,
            service_id: appointmentData.service_id,
        }
    });

    if (!findProfessionalService) {
        const error = new Error('El profesional no tiene ese servicio');
        error.status = 404;
        throw error;
    }

    const { service_id, ...appointment } = appointmentData;

    //Calculo end time
    const hourDuration = appointment.start_time.getTime() + findProfessionalService.duration * 60 * 1000;
    appointment.end_time = new Date(hourDuration);

    appointment.professional_service_id = findProfessionalService.id;
    appointment.professional_id = findProfessionalService.user_id;

    // El turno tiene que entrar entero en una franja de atención. Los horarios
    // que ofrecemos ya salen de ahí, pero esto es lo que impide que alguien
    // reserve en un corte o en un día cerrado mandando el horario a mano.
    await assertInsideBookingWindow(appointment.professional_id, appointment.start_time);
    await assertInsideWorkingHours(appointment.professional_id, appointment.start_time, appointment.end_time);

    // El profesional decide si los turnos entran a la sección de solicitudes
    // (PENDING, hay que aceptarlos) o si se confirman solos.
    const professional = await prisma.user.findUnique({
        where: { id: findProfessionalService.user_id },
        select: { auto_accept: true },
    });
    appointment.status = professional?.auto_accept ? 'CONFIRMED' : 'PENDING';


    //Busco en prisma si existe una cita con el mismo professional id y que este en ese horario
    const existingAppointments = await prisma.appointment.findMany({
        where: {
            professional_id: appointment.professional_id,
            status: { not: 'CANCELLED' },
            start_time: { lt: appointment.end_time },
            end_time: { gt: appointment.start_time },
        }
    });
    if (existingAppointments.length > 0) {
        const error = new Error('Ya existe un turno en ese horario');
        error.status = 409;
        throw error;
    }



    try {
        const newAppointment = await prisma.appointment.create({
            data: appointment,
            include: notificationInclude,
        });

        // Al profesional siempre le avisamos; al cliente solo si ya quedó
        // confirmado (si está pendiente, su mail sale cuando haya decisión).
        notifyInBackground(notifyProfessionalOfBooking(newAppointment));
        if (newAppointment.status === 'CONFIRMED') {
            notifyInBackground(notifyClientOfConfirmation(newAppointment));
        }

        // Las relaciones se traen solo para armar los mails: la respuesta al
        // cliente sigue siendo el turno pelado (no expone el mail del profesional).
        const { client, professional, professional_service, ...createdAppointment } = newAppointment;
        return createdAppointment;
    } catch (error) {
        const message = String(error?.message ?? '');

        if (message.includes('appointment_overlap_constraint') || message.includes('23P01')) {
            const overlapError = new Error('Ya existe un turno en ese horario');
            overlapError.status = 409;
            throw overlapError;
        }

        throw error;
    }
};

// Cierra los turnos confirmados cuyo horario ya pasó: quedan en COMPLETED.
//
// Se asume que se atendieron, que es lo normal; la excepción ("no vino") la
// marca el profesional a mano y queda en NO_SHOW. Sin esto, un turno pasado se
// quedaba para siempre en CONFIRMED y el historial no distinguía nada.
//
// Corre al listar en vez de por un cron: así no hace falta un proceso aparte y
// el que mira la lista siempre la ve al día. Es un solo UPDATE idempotente, y
// como filtra por `status: CONFIRMED` no pisa lo que el profesional haya
// marcado a mano. `scope` acota a los turnos de quien está consultando.
const closePastAppointments = async (scope) => {
    return prisma.appointment.updateMany({
        where: {
            ...scope,
            status: 'CONFIRMED',
            end_time: { lt: new Date() },
        },
        data: { status: 'COMPLETED' },
    });
};

//obtener turnos
const getAppointmentsService = async () => {

    try {
        const appointments = await prisma.appointment.findMany({
            include: {
                professional_service: {
                    select: {
                        duration: true,
                        user: {
                            select: {
                                id: true,
                                firts_name: true,
                                last_name: true,
                                phone: true,
                                email: true
                            }
                        },
                        service: {
                            select: {
                                name: true,
                                description: true
                            }
                        }
                    }
                },
                client: {
                    select: {
                        id: true,
                        firts_name: true,
                        last_name: true,
                        phone: true,
                        email: true
                    }
                }
            }
        });
        return appointments;
    } catch (error) {
        console.log(error);
        throw new Error('Error al obtener las citas')
    }
};

//obtener turnos por profesional
const getProfessionalService = async (id) => {
    try {
        const professionals = await prisma.professionalService.findMany({
            where: {
                user_id: id
            },
            include: {
                service: {
                    select: {
                        name: true,
                        description: true
                    }
                }
            }
        });
        return professionals;
    } catch (error) {
        console.log(error);
        throw new Error('Error al obtener los profesionales');
    }
}

//obtener horarios disponibles para profesional+servicio+fecha
const getAvailableSlotsService = async (professionalId, serviceId, dateStr) => {
    const professionalService = await prisma.professionalService.findFirst({
        where: {
            user_id: professionalId,
            service_id: serviceId,
        }
    });

    if (!professionalService) {
        throw new Error('El profesional no tiene ese servicio');
    }

    const { duration } = professionalService;

    // El día es el del negocio, no el del server: `dayEnd` se pide como "1440
    // minutos después de la medianoche" en vez de sumar 24 h fijas para que en
    // los días de cambio de horario de verano (23 o 25 h) el rango siga siendo
    // exactamente ese día.
    const dayStart = zonedTime(dateStr, 0);
    const dayEnd = zonedTime(dateStr, 24 * 60);
    const weekday = weekdayOf(dayStart);

    const availabilityWindows = await prisma.availability.findMany({
        where: {
            user_id: professionalId,
            weekday,
        }
    });

    if (availabilityWindows.length === 0) {
        return [];
    }

    // Los horarios que se ofrecen respetan las mismas reglas que valida el alta:
    // antelación mínima y hasta cuándo se puede reservar.
    const settings = await prisma.user.findUnique({
        where: { id: professionalId },
        select: { min_notice_hours: true, max_days_ahead: true },
    });
    const { from: bookableFrom, until: bookableUntil } = bookingWindow(settings);

    const existingAppointments = await prisma.appointment.findMany({
        where: {
            professional_id: professionalId,
            status: { not: 'CANCELLED' },
            start_time: { lt: dayEnd },
            end_time: { gt: dayStart },
        }
    });

    const slots = [];

    for (const window of availabilityWindows) {
        for (let minutes = window.start_minutes; minutes + duration <= window.end_minutes; minutes += duration) {
            // Cada slot se resuelve por su hora de pared en vez de sumarle
            // minutos a la medianoche: si ese día cambia el horario de verano,
            // "las 15:00" siguen siendo las 15:00 para el profesional.
            const start = zonedTime(dateStr, minutes);
            const end = new Date(start.getTime() + duration * 60 * 1000);

            if (start < bookableFrom || start > bookableUntil) continue;

            const overlaps = existingAppointments.some(
                (appointment) => start < appointment.end_time && end > appointment.start_time
            );
            if (overlaps) continue;

            slots.push({ start_time: start.toISOString(), end_time: end.toISOString() });
        }
    }

    return slots;
};

//obtener un profesional por su slug (link único de reserva) junto con sus servicios
const getProfessionalBySlugService = async (slug) => {
    const professional = await prisma.user.findFirst({
        where: { slug, role: 'PROFESSIONAL' },
        select: {
            id: true,
            firts_name: true,
            last_name: true,
            phone: true,
            slug: true,
            // La foto y la descripción son parte de lo que ve el cliente cuando
            // entra al link de reserva.
            image: true,
            description: true,
        },
    });

    if (!professional) {
        const error = new Error('No encontramos a ese profesional');
        error.status = 404;
        throw error;
    }

    const services = await getProfessionalService(professional.id);

    return { professional, services };
};

//obtner todos los profesionales
const getAllProfessionalsService = async () => {
    try {
        // Listado público: va sin datos de contacto. El email y el teléfono de
        // cada profesional no le sirven a nadie acá, y expuestos son una lista
        // de contactos lista para scrapear. Quien quiera reservar entra por el
        // slug, que es el link que el profesional reparte.
        const professionals = await prisma.user.findMany({
            where: {
                role: "PROFESSIONAL"
            },
            select: {
                id: true,
                firts_name: true,
                last_name: true,
                slug: true,
            }

        });
        return professionals;
    } catch (error) {
        console.log(error);
        throw new Error('Error al obtener los profesionales');
    }
}

//obtener los turnos del cliente logueado
const getMyAppointmentsService = async (clientId) => {
    await closePastAppointments({ client_id: clientId });

    return prisma.appointment.findMany({
        where: { client_id: clientId },
        include: {
            professional_service: {
                select: {
                    duration: true,
                    service_id: true,
                    user: {
                        select: { id: true, firts_name: true, last_name: true },
                    },
                    service: { select: { name: true, description: true } },
                },
            },
        },
        orderBy: { start_time: 'desc' },
    });
};

//cancelar un turno propio
const cancelAppointmentService = async (clientId, appointmentId) => {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

    if (!appointment || appointment.client_id !== clientId) {
        const error = new Error('No se encontró ese turno');
        error.status = 404;
        throw error;
    }
    if (appointment.status === 'CANCELLED') {
        const error = new Error('Ese turno ya está cancelado');
        error.status = 409;
        throw error;
    }
    if (appointment.start_time <= new Date()) {
        const error = new Error('No se puede cancelar un turno que ya pasó');
        error.status = 409;
        throw error;
    }

    // El profesional puede exigir un aviso mínimo para cancelar; pasado ese
    // límite el turno se cancela hablando con él, no desde la app.
    const { cancel_notice_hours: noticeHours } = await prisma.user.findUnique({
        where: { id: appointment.professional_id },
        select: { cancel_notice_hours: true },
    });

    if (noticeHours > 0) {
        const limit = new Date(Date.now() + noticeHours * 60 * 60 * 1000);
        if (appointment.start_time < limit) {
            const error = new Error(
                `Este turno se puede cancelar hasta ${noticeHours} h antes. Escribile al profesional para reprogramarlo.`
            );
            error.status = 409;
            throw error;
        }
    }

    return prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' },
    });
};

//reprogramar un turno propio a un nuevo horario
const rescheduleAppointmentService = async (clientId, appointmentId, newStartTime) => {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { professional_service: { select: { duration: true } } },
    });

    if (!appointment || appointment.client_id !== clientId) {
        const error = new Error('No se encontró ese turno');
        error.status = 404;
        throw error;
    }
    if (appointment.status === 'CANCELLED') {
        const error = new Error('Ese turno está cancelado, no se puede reprogramar');
        error.status = 409;
        throw error;
    }
    if (newStartTime <= new Date()) {
        const error = new Error('El nuevo horario debe ser futuro');
        error.status = 400;
        throw error;
    }

    const newEndTime = new Date(newStartTime.getTime() + appointment.professional_service.duration * 60 * 1000);

    await assertInsideWorkingHours(appointment.professional_id, newStartTime, newEndTime);

    const conflicting = await prisma.appointment.findMany({
        where: {
            id: { not: appointmentId },
            professional_id: appointment.professional_id,
            status: { not: 'CANCELLED' },
            start_time: { lt: newEndTime },
            end_time: { gt: newStartTime },
        },
    });
    if (conflicting.length > 0) {
        const error = new Error('Ya existe un turno en ese horario');
        error.status = 409;
        throw error;
    }

    return prisma.appointment.update({
        where: { id: appointmentId },
        data: { start_time: newStartTime, end_time: newEndTime },
    });
};

export {
    closePastAppointments,
    createAppointmentService,
    getAppointmentsService,
    getProfessionalService,
    getProfessionalBySlugService,
    getAllProfessionalsService,
    getAvailableSlotsService,
    getMyAppointmentsService,
    cancelAppointmentService,
    rescheduleAppointmentService,
};