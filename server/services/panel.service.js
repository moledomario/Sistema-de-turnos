import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { weekdayOf, fitsInWindows } from '../src/lib/schedule.js';
import { findOrCreateManualClientService } from './client.service.js';
import { closePastAppointments } from './appointment.service.js';
import {
    notificationInclude,
    notifyClientOfConfirmation,
    notifyClientOfRejection,
    notifyClientOfCancellationByProfessional,
    notifyClientOfReschedule,
    notifyInBackground,
} from './notification.service.js';

const getMyAvailabilityService = async (userId) => {
    return prisma.availability.findMany({
        where: { user_id: userId },
        orderBy: [{ weekday: 'asc' }, { start_minutes: 'asc' }],
    });
};

const createAvailabilityService = async (userId, data) => {
    return prisma.availability.create({
        data: { ...data, user_id: userId },
    });
};

// Turnos ya reservados que dejan de entrar en el horario nuevo: si el
// profesional mete un corte al mediodía o achica el día, esos turnos no se
// cancelan solos, pero se los devolvemos para poder avisarle.
const findAppointmentsOutsideDay = async (userId, weekday, ranges) => {
    const upcoming = await prisma.appointment.findMany({
        where: {
            professional_id: userId,
            status: { not: 'CANCELLED' },
            start_time: { gte: new Date() },
        },
        include: { client: { select: { firts_name: true, last_name: true } } },
        orderBy: { start_time: 'asc' },
    });

    return upcoming
        .filter(
            (appointment) =>
                weekdayOf(appointment.start_time) === weekday &&
                !fitsInWindows(appointment.start_time, appointment.end_time, ranges)
        )
        .map((appointment) => ({
            id: appointment.id,
            start_time: appointment.start_time,
            end_time: appointment.end_time,
            client_name: `${appointment.client.firts_name} ${appointment.client.last_name}`,
        }));
};

// Reemplaza de una todas las franjas de un día. Es lo que usa el editor de
// horarios del panel: mandar el día completo evita quedar a mitad de camino
// entre el horario viejo y el nuevo si falla una de las operaciones.
const replaceAvailabilityDayService = async (userId, weekday, ranges) => {
    const conflicts = await findAppointmentsOutsideDay(userId, weekday, ranges);

    await prisma.$transaction([
        prisma.availability.deleteMany({ where: { user_id: userId, weekday } }),
        prisma.availability.createMany({
            data: ranges.map((range) => ({ ...range, user_id: userId, weekday })),
        }),
    ]);

    const availability = await prisma.availability.findMany({
        where: { user_id: userId, weekday },
        orderBy: { start_minutes: 'asc' },
    });

    return { availability, conflicts };
};

const deleteAvailabilityService = async (userId, availabilityId) => {
    const slot = await prisma.availability.findUnique({ where: { id: availabilityId } });
    if (!slot || slot.user_id !== userId) {
        const error = new Error('No se encontró ese horario');
        error.status = 404;
        throw error;
    }
    await prisma.availability.delete({ where: { id: availabilityId } });
};

const getMyBookingsService = async (userId) => {
    await closePastAppointments({ professional_id: userId });

    return prisma.appointment.findMany({
        where: { professional_id: userId },
        include: {
            client: {
                select: { id: true, firts_name: true, last_name: true, phone: true, email: true },
            },
            professional_service: {
                select: { duration: true, service: { select: { name: true } } },
            },
        },
        orderBy: { start_time: 'asc' },
    });
};

// El profesional carga un turno él mismo: alguien que llamó por teléfono o que
// cayó al local. Entra CONFIRMED (no tiene sentido que se apruebe a sí mismo) y
// puede quedar fuera del horario de atención, igual que al mover un turno: lo
// único que no se permite es pisar otro.
const createBookingService = async (userId, { service_id, start_time, notes, client }) => {
    const offering = await prisma.professionalService.findFirst({
        where: { user_id: userId, service_id },
    });

    if (!offering) {
        const error = new Error('No ofrecés ese servicio');
        error.status = 404;
        throw error;
    }

    const endTime = new Date(start_time.getTime() + offering.duration * 60 * 1000);

    const conflicting = await prisma.appointment.findFirst({
        where: {
            professional_id: userId,
            status: { not: 'CANCELLED' },
            start_time: { lt: endTime },
            end_time: { gt: start_time },
        },
    });

    if (conflicting) {
        const error = new Error('Ya tenés otro turno en ese horario');
        error.status = 409;
        throw error;
    }

    const { client: savedClient, reachableByEmail } = await findOrCreateManualClientService(client);

    const appointment = await prisma.appointment.create({
        data: {
            professional_service_id: offering.id,
            professional_id: userId,
            client_id: savedClient.id,
            start_time,
            end_time: endTime,
            notes,
            status: 'CONFIRMED',
        },
        include: notificationInclude,
    });

    // Sin email real no hay a quién avisarle: el turno queda igual en la agenda.
    if (reachableByEmail) {
        notifyInBackground(notifyClientOfConfirmation(appointment));
    }

    return appointment;
};

// Busca un turno propio del profesional. El id y el dueño van en el mismo where
// para no contestar distinto según el turno exista o sea de otro.
const findOwnBooking = async (userId, appointmentId) => {
    const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, professional_id: userId },
        include: { professional_service: { select: { duration: true } } },
    });

    if (!appointment) {
        const error = new Error('No se encontró ese turno');
        error.status = 404;
        throw error;
    }

    return appointment;
};

// El profesional da de baja un turno de su agenda (se enfermó, se le cayó el
// día). El cliente se entera por mail, con el texto que haya escrito.
const cancelBookingService = async (userId, appointmentId, message) => {
    const appointment = await findOwnBooking(userId, appointmentId);

    if (appointment.status === 'CANCELLED') {
        const error = new Error('Ese turno ya está cancelado');
        error.status = 409;
        throw error;
    }

    const updated = await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' },
        include: notificationInclude,
    });

    notifyInBackground(notifyClientOfCancellationByProfessional(updated, message));

    return updated;
};

// Marcar si el cliente vino o no. Es el único dato que el auto-cierre no puede
// adivinar: COMPLETED se pone solo asumiendo que se atendió, y desde acá el
// profesional corrige los que no.
//
// No dispara ningún mail a propósito: avisarle a alguien "marcamos que no
// viniste" no le sirve de nada y queda hostil. Es un registro interno.
const setAttendanceService = async (userId, appointmentId, attended) => {
    const appointment = await findOwnBooking(userId, appointmentId);

    if (appointment.status === 'CANCELLED') {
        const error = new Error('Ese turno está cancelado');
        error.status = 409;
        throw error;
    }

    // Un turno que nunca se aceptó no llegó a existir para el cliente, así que
    // no hay asistencia que registrar.
    if (appointment.status === 'PENDING') {
        const error = new Error('Ese turno todavía está pendiente de aceptación');
        error.status = 409;
        throw error;
    }

    if (appointment.end_time > new Date()) {
        const error = new Error('Ese turno todavía no pasó');
        error.status = 409;
        throw error;
    }

    return prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: attended ? 'COMPLETED' : 'NO_SHOW' },
    });
};

// Mover un turno a otro horario. A diferencia del cliente, el profesional puede
// dejarlo fuera de su horario de atención (es su agenda, sabe lo que hace); lo
// que nunca se permite es pisar otro turno.
const rescheduleBookingService = async (userId, appointmentId, newStartTime, message) => {
    const appointment = await findOwnBooking(userId, appointmentId);

    if (appointment.status === 'CANCELLED') {
        const error = new Error('Ese turno está cancelado, no se puede mover');
        error.status = 409;
        throw error;
    }

    const newEndTime = new Date(
        newStartTime.getTime() + appointment.professional_service.duration * 60 * 1000
    );

    const conflicting = await prisma.appointment.findFirst({
        where: {
            id: { not: appointmentId },
            professional_id: userId,
            status: { not: 'CANCELLED' },
            start_time: { lt: newEndTime },
            end_time: { gt: newStartTime },
        },
    });

    if (conflicting) {
        const error = new Error('Ya tenés otro turno en ese horario');
        error.status = 409;
        throw error;
    }

    const previousStart = appointment.start_time;

    const updated = await prisma.appointment.update({
        where: { id: appointmentId },
        data: { start_time: newStartTime, end_time: newEndTime },
        include: notificationInclude,
    });

    notifyInBackground(notifyClientOfReschedule(updated, previousStart, message));

    return updated;
};

// Turnos que esperan una decisión del profesional (la sección "Solicitudes").
const getPendingRequestsService = async (userId) => {
    return prisma.appointment.findMany({
        where: { professional_id: userId, status: 'PENDING' },
        include: {
            client: {
                select: { id: true, firts_name: true, last_name: true, phone: true, email: true },
            },
            professional_service: {
                select: {
                    duration: true,
                    price: true,
                    requires_deposit: true,
                    deposit_amount: true,
                    service: { select: { name: true } },
                },
            },
        },
        orderBy: { start_time: 'asc' },
    });
};

// Aceptar o rechazar una solicitud. En los dos casos el cliente se entera por
// mail, con el texto que haya redactado el profesional (o el estándar si no).
const respondToRequestService = async (userId, appointmentId, accept, message) => {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true, professional_id: true, status: true },
    });

    if (!appointment || appointment.professional_id !== userId) {
        const error = new Error('No se encontró esa solicitud');
        error.status = 404;
        throw error;
    }
    if (appointment.status !== 'PENDING') {
        const error = new Error('Esa solicitud ya fue respondida');
        error.status = 409;
        throw error;
    }

    const updated = await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: accept ? 'CONFIRMED' : 'CANCELLED' },
        include: notificationInclude,
    });

    notifyInBackground(
        accept
            ? notifyClientOfConfirmation(updated, message)
            : notifyClientOfRejection(updated, message)
    );

    return updated;
};

// Aceptar de una todas las solicitudes pendientes, sin revisarlas. El mensaje,
// si lo hay, sale igual para todos los clientes.
const acceptAllRequestsService = async (userId, message) => {
    // Se leen antes de actualizar porque los mails necesitan los datos del
    // cliente y del servicio, y `updateMany` no devuelve filas.
    const pending = await prisma.appointment.findMany({
        where: { professional_id: userId, status: 'PENDING' },
        include: notificationInclude,
    });

    if (pending.length === 0) {
        return { accepted: 0 };
    }

    await prisma.appointment.updateMany({
        where: { professional_id: userId, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
    });

    for (const appointment of pending) {
        notifyInBackground(
            notifyClientOfConfirmation({ ...appointment, status: 'CONFIRMED' }, message)
        );
    }

    return { accepted: pending.length };
};

const settingsSelect = {
    auto_accept: true,
    min_notice_hours: true,
    max_days_ahead: true,
    cancel_notice_hours: true,
    notify_on_booking: true,
};

const getMySettingsService = async (userId) => {
    return prisma.user.findUnique({
        where: { id: userId },
        select: settingsSelect,
    });
};

const updateMySettingsService = async (userId, data) => {
    return prisma.user.update({
        where: { id: userId },
        data,
        select: settingsSelect,
    });
};

// Cambio de contraseña desde el panel: hay que saber la actual, así que una
// sesión robada no alcanza para dejar al dueño afuera de su cuenta.
const changeMyPasswordService = async (userId, { current_password, new_password }) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true },
    });

    if (!user || !(await bcrypt.compare(current_password, user.password))) {
        const error = new Error('La contraseña actual no es correcta');
        error.status = 401;
        throw error;
    }

    if (await bcrypt.compare(new_password, user.password)) {
        const error = new Error('La contraseña nueva tiene que ser distinta de la actual');
        error.status = 400;
        throw error;
    }

    await prisma.user.update({
        where: { id: userId },
        data: { password: await bcrypt.hash(new_password, 10) },
    });
};

// Todo lo que la sección Cuenta muestra del dueño. El password nunca sale de
// acá, ni siquiera hasheado.
const accountSelect = {
    id: true,
    email: true,
    firts_name: true,
    last_name: true,
    phone: true,
    image: true,
    description: true,
    role: true,
    slug: true,
    plan: true,
    created_at: true,
};

const getMyAccountService = async (userId) => {
    return prisma.user.findUnique({
        where: { id: userId },
        select: accountSelect,
    });
};

const updateMyAccountService = async (userId, data) => {
    // El slug es único: si ya lo tiene otro, conviene decirlo con nombre y
    // apellido antes de que reviente la constraint.
    if (data.slug) {
        const taken = await prisma.user.findUnique({ where: { slug: data.slug } });
        if (taken && taken.id !== userId) {
            const error = new Error('Ese link ya está en uso, probá con otro');
            error.status = 409;
            throw error;
        }
    }

    return prisma.user.update({
        where: { id: userId },
        data,
        select: accountSelect,
    });
};

// Marca el onboarding como terminado. Es idempotente: volver a llamarlo no
// rompe nada, y así el botón final del wizard puede reintentarse.
const completeOnboardingService = async (userId) => {
    return prisma.user.update({
        where: { id: userId },
        data: { onboarding_completed: true },
        select: { onboarding_completed: true },
    });
};

const getMyTeamService = async (userId) => {
    return prisma.teamMember.findMany({
        where: { account_id: userId },
        orderBy: { created_at: 'asc' },
    });
};

const createTeamMemberService = async (userId, data) => {
    return prisma.teamMember.create({
        data: { ...data, account_id: userId },
    });
};

// Buscar por id y dueño en el mismo where evita tocar la ficha de otra cuenta.
const findOwnTeamMember = async (userId, memberId) => {
    const member = await prisma.teamMember.findFirst({
        where: { id: memberId, account_id: userId },
    });

    if (!member) {
        const error = new Error('No se encontró ese profesional');
        error.status = 404;
        throw error;
    }

    return member;
};

const updateTeamMemberService = async (userId, memberId, data) => {
    await findOwnTeamMember(userId, memberId);

    return prisma.teamMember.update({
        where: { id: memberId },
        data,
    });
};

const deleteTeamMemberService = async (userId, memberId) => {
    await findOwnTeamMember(userId, memberId);

    await prisma.teamMember.delete({ where: { id: memberId } });
};

const getServiceCatalogService = async () => {
    return prisma.service.findMany({ orderBy: { name: 'asc' } });
};

const getMyServicesService = async (userId) => {
    return prisma.professionalService.findMany({
        where: { user_id: userId },
        include: { service: { select: { id: true, name: true, description: true } } },
        orderBy: { created_at: 'asc' },
    });
};

const createMyServiceService = async (userId, data) => {
    const { service_id, name, description, ...offering } = data;

    const service = service_id
        ? await prisma.service.findUnique({ where: { id: service_id } })
        : await prisma.service.create({ data: { name, description } });

    if (!service) {
        const error = new Error('El servicio elegido no existe');
        error.status = 404;
        throw error;
    }

    const existing = await prisma.professionalService.findFirst({
        where: { user_id: userId, service_id: service.id },
    });
    if (existing) {
        const error = new Error('Ya ofrecés ese servicio');
        error.status = 409;
        throw error;
    }

    // `offering` son los datos propios del profesional sobre ese servicio
    // (duración, precio, foto, seña); el nombre y la descripción viven en el
    // catálogo compartido.
    return prisma.professionalService.create({
        data: { ...offering, user_id: userId, service_id: service.id },
        include: { service: { select: { id: true, name: true, description: true } } },
    });
};

const updateMyServiceService = async (userId, professionalServiceId, data) => {
    const offering = await prisma.professionalService.findUnique({ where: { id: professionalServiceId } });
    if (!offering || offering.user_id !== userId) {
        const error = new Error('No se encontró ese servicio');
        error.status = 404;
        throw error;
    }

    return prisma.professionalService.update({
        where: { id: professionalServiceId },
        data,
        include: { service: { select: { id: true, name: true, description: true } } },
    });
};

const deleteMyServiceService = async (userId, professionalServiceId) => {
    const offering = await prisma.professionalService.findUnique({ where: { id: professionalServiceId } });
    if (!offering || offering.user_id !== userId) {
        const error = new Error('No se encontró ese servicio');
        error.status = 404;
        throw error;
    }

    try {
        await prisma.professionalService.delete({ where: { id: professionalServiceId } });
    } catch {
        const error = new Error('No se puede borrar: ya tiene turnos asociados');
        error.status = 409;
        throw error;
    }
};

export {
    getMyAvailabilityService,
    createAvailabilityService,
    replaceAvailabilityDayService,
    deleteAvailabilityService,
    getMyBookingsService,
    createBookingService,
    cancelBookingService,
    setAttendanceService,
    rescheduleBookingService,
    getPendingRequestsService,
    respondToRequestService,
    acceptAllRequestsService,
    getMySettingsService,
    updateMySettingsService,
    changeMyPasswordService,
    getMyAccountService,
    updateMyAccountService,
    completeOnboardingService,
    getMyTeamService,
    createTeamMemberService,
    updateTeamMemberService,
    deleteTeamMemberService,
    getServiceCatalogService,
    getMyServicesService,
    createMyServiceService,
    updateMyServiceService,
    deleteMyServiceService,
};
