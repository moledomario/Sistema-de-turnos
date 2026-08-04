import { describe, it, expect, vi, beforeEach } from 'vitest';

// Las fechas de este archivo llevan "-03:00" (hora de Argentina), así que la
// zona del negocio se fija acá antes de importar nada: si no, el resultado
// dependería de la zona del server que corra los tests.
process.env.APP_TIMEZONE = 'America/Argentina/Buenos_Aires';

vi.mock('../src/lib/prisma.js', () => ({
    prisma: {
        appointment: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        user: { findUnique: vi.fn(), update: vi.fn() },
        availability: {
            findMany: vi.fn(),
            create: vi.fn(),
            createMany: vi.fn(),
            findUnique: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
        professionalService: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        service: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(), compare: vi.fn() },
}));

vi.mock('./client.service.js', () => ({
    findOrCreateManualClientService: vi.fn(),
}));

vi.mock('./notification.service.js', () => ({
    notificationInclude: {},
    notifyClientOfConfirmation: vi.fn(),
    notifyClientOfRejection: vi.fn(),
    notifyClientOfCancellationByProfessional: vi.fn(),
    notifyClientOfReschedule: vi.fn(),
    notifyInBackground: vi.fn(),
}));

const { prisma } = await import('../src/lib/prisma.js');
const { default: bcrypt } = await import('bcryptjs');
const {
    notifyClientOfConfirmation,
    notifyClientOfRejection,
    notifyClientOfCancellationByProfessional,
    notifyClientOfReschedule,
    notifyInBackground,
} = await import('./notification.service.js');
const {
    getPendingRequestsService,
    respondToRequestService,
    acceptAllRequestsService,
    updateMySettingsService,
    replaceAvailabilityDayService,
    updateMyAccountService,
    changeMyPasswordService,
    cancelBookingService,
    rescheduleBookingService,
    createBookingService,
    setAttendanceService,
} = await import('./panel.service.js');
const { findOrCreateManualClientService } = await import('./client.service.js');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getPendingRequestsService', () => {
    it('pide solo los turnos PENDING del profesional, del más próximo al más lejano', async () => {
        prisma.appointment.findMany.mockResolvedValue([]);

        await getPendingRequestsService('prof1');

        expect(prisma.appointment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { professional_id: 'prof1', status: 'PENDING' },
                orderBy: { start_time: 'asc' },
            })
        );
    });
});

describe('respondToRequestService', () => {
    it('lanza 404 si el turno no existe', async () => {
        prisma.appointment.findUnique.mockResolvedValue(null);

        await expect(respondToRequestService('prof1', 'appt1', true)).rejects.toMatchObject({ status: 404 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('lanza 404 si el turno es de otro profesional', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            professional_id: 'otro',
            status: 'PENDING',
        });

        await expect(respondToRequestService('prof1', 'appt1', true)).rejects.toMatchObject({ status: 404 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('lanza 409 si la solicitud ya fue respondida', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            professional_id: 'prof1',
            status: 'CONFIRMED',
        });

        await expect(respondToRequestService('prof1', 'appt1', true)).rejects.toMatchObject({ status: 409 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('le pasa al mail el mensaje que redactó el profesional', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            professional_id: 'prof1',
            status: 'PENDING',
        });
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CONFIRMED' });

        await respondToRequestService('prof1', 'appt1', true, 'Nos vemos el jueves');

        expect(notifyClientOfConfirmation).toHaveBeenCalledWith(
            expect.anything(),
            'Nos vemos el jueves'
        );
    });

    it('sin mensaje, el mail se arma con el texto estándar', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            professional_id: 'prof1',
            status: 'PENDING',
        });
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CANCELLED' });

        await respondToRequestService('prof1', 'appt1', false);

        expect(notifyClientOfRejection).toHaveBeenCalledWith(expect.anything(), undefined);
    });

    it('acepta: pasa a CONFIRMED y le avisa al cliente', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            professional_id: 'prof1',
            status: 'PENDING',
        });
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CONFIRMED' });

        await respondToRequestService('prof1', 'appt1', true);

        expect(prisma.appointment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'appt1' },
                data: { status: 'CONFIRMED' },
            })
        );
        expect(notifyClientOfConfirmation).toHaveBeenCalledTimes(1);
        expect(notifyClientOfRejection).not.toHaveBeenCalled();
    });

    it('rechaza: pasa a CANCELLED y le avisa al cliente', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            professional_id: 'prof1',
            status: 'PENDING',
        });
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CANCELLED' });

        await respondToRequestService('prof1', 'appt1', false);

        expect(prisma.appointment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'appt1' },
                data: { status: 'CANCELLED' },
            })
        );
        expect(notifyClientOfRejection).toHaveBeenCalledTimes(1);
        expect(notifyClientOfConfirmation).not.toHaveBeenCalled();
    });
});

describe('acceptAllRequestsService', () => {
    it('no toca nada ni manda mails si no hay pendientes', async () => {
        prisma.appointment.findMany.mockResolvedValue([]);

        const result = await acceptAllRequestsService('prof1');

        expect(result).toEqual({ accepted: 0 });
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
        expect(notifyClientOfConfirmation).not.toHaveBeenCalled();
    });

    it('confirma todos los pendientes y manda un mail por turno', async () => {
        prisma.appointment.findMany.mockResolvedValue([
            { id: 'a1', status: 'PENDING' },
            { id: 'a2', status: 'PENDING' },
            { id: 'a3', status: 'PENDING' },
        ]);

        const result = await acceptAllRequestsService('prof1');

        expect(result).toEqual({ accepted: 3 });
        expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
            where: { professional_id: 'prof1', status: 'PENDING' },
            data: { status: 'CONFIRMED' },
        });
        expect(notifyClientOfConfirmation).toHaveBeenCalledTimes(3);
        // El mail se arma con el estado nuevo, no con el PENDING que se leyó.
        expect(notifyClientOfConfirmation).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'a1', status: 'CONFIRMED' }),
            undefined
        );
    });

    it('manda el mismo mensaje redactado a todos los clientes', async () => {
        prisma.appointment.findMany.mockResolvedValue([
            { id: 'a1', status: 'PENDING' },
            { id: 'a2', status: 'PENDING' },
        ]);

        await acceptAllRequestsService('prof1', 'Los espero a todos');

        expect(notifyClientOfConfirmation).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            'Los espero a todos'
        );
        expect(notifyClientOfConfirmation).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            'Los espero a todos'
        );
    });

    it('solo alcanza los turnos del profesional que pide', async () => {
        prisma.appointment.findMany.mockResolvedValue([{ id: 'a1', status: 'PENDING' }]);

        await acceptAllRequestsService('prof1');

        expect(prisma.appointment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { professional_id: 'prof1', status: 'PENDING' } })
        );
    });
});

describe('replaceAvailabilityDayService', () => {
    beforeEach(() => {
        // Sin turnos futuros no hay nada que avisar; los tests que miran los
        // avisos ponen los suyos.
        prisma.appointment.findMany.mockResolvedValue([]);
    });

    it('borra y vuelve a crear el día en una sola transacción', async () => {
        prisma.availability.findMany.mockResolvedValue([]);

        await replaceAvailabilityDayService('prof1', 1, [
            { start_minutes: 540, end_minutes: 780 },
            { start_minutes: 960, end_minutes: 1200 },
        ]);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.availability.deleteMany).toHaveBeenCalledWith({
            where: { user_id: 'prof1', weekday: 1 },
        });
        expect(prisma.availability.createMany).toHaveBeenCalledWith({
            data: [
                { start_minutes: 540, end_minutes: 780, user_id: 'prof1', weekday: 1 },
                { start_minutes: 960, end_minutes: 1200, user_id: 'prof1', weekday: 1 },
            ],
        });
    });

    it('sin bloques deja el día cerrado: borra y no crea nada', async () => {
        prisma.availability.findMany.mockResolvedValue([]);

        const result = await replaceAvailabilityDayService('prof1', 3, []);

        expect(prisma.availability.deleteMany).toHaveBeenCalledWith({
            where: { user_id: 'prof1', weekday: 3 },
        });
        expect(prisma.availability.createMany).toHaveBeenCalledWith({ data: [] });
        expect(result.availability).toEqual([]);
    });

    it('devuelve el día ya guardado, ordenado por hora de inicio', async () => {
        const saved = [
            { id: 'a1', weekday: 1, start_minutes: 540, end_minutes: 780 },
            { id: 'a2', weekday: 1, start_minutes: 960, end_minutes: 1200 },
        ];
        prisma.availability.findMany.mockResolvedValue(saved);

        const result = await replaceAvailabilityDayService('prof1', 1, []);

        expect(prisma.availability.findMany).toHaveBeenCalledWith({
            where: { user_id: 'prof1', weekday: 1 },
            orderBy: { start_minutes: 'asc' },
        });
        expect(result.availability).toBe(saved);
    });

    describe('avisos de turnos que quedan fuera del horario nuevo', () => {
        // Lunes 3 de agosto de 2026: un turno de 13:00 a 13:30 y otro de 10:00 a
        // 10:30, los dos ya reservados.
        const alMediodia = {
            id: 'appt-mediodia',
            start_time: new Date('2026-08-03T13:00:00-03:00'),
            end_time: new Date('2026-08-03T13:30:00-03:00'),
            client: { firts_name: 'Ana', last_name: 'Pérez' },
        };
        const aLaManiana = {
            id: 'appt-maniana',
            start_time: new Date('2026-08-03T10:00:00-03:00'),
            end_time: new Date('2026-08-03T10:30:00-03:00'),
            client: { firts_name: 'Luis', last_name: 'Díaz' },
        };

        it('avisa del turno que cae justo en el corte', async () => {
            prisma.appointment.findMany.mockResolvedValue([aLaManiana, alMediodia]);
            prisma.availability.findMany.mockResolvedValue([]);

            // 09:00-13:00 y 14:00-18:00: el corte se come el turno de las 13:00.
            const { conflicts } = await replaceAvailabilityDayService('prof1', 1, [
                { start_minutes: 540, end_minutes: 780 },
                { start_minutes: 840, end_minutes: 1080 },
            ]);

            expect(conflicts).toEqual([
                {
                    id: 'appt-mediodia',
                    start_time: alMediodia.start_time,
                    end_time: alMediodia.end_time,
                    client_name: 'Ana Pérez',
                },
            ]);
        });

        it('no avisa nada si todos los turnos siguen entrando', async () => {
            prisma.appointment.findMany.mockResolvedValue([aLaManiana, alMediodia]);
            prisma.availability.findMany.mockResolvedValue([]);

            const { conflicts } = await replaceAvailabilityDayService('prof1', 1, [
                { start_minutes: 540, end_minutes: 1080 },
            ]);

            expect(conflicts).toEqual([]);
        });

        it('ignora los turnos de otros días de la semana', async () => {
            prisma.appointment.findMany.mockResolvedValue([alMediodia]);
            prisma.availability.findMany.mockResolvedValue([]);

            // El turno es un lunes (weekday 1), acá se está editando el martes.
            const { conflicts } = await replaceAvailabilityDayService('prof1', 2, []);

            expect(conflicts).toEqual([]);
        });

        it('solo mira turnos futuros y no cancelados del profesional', async () => {
            prisma.appointment.findMany.mockResolvedValue([]);

            await replaceAvailabilityDayService('prof1', 1, []);

            expect(prisma.appointment.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        professional_id: 'prof1',
                        status: { not: 'CANCELLED' },
                        start_time: { gte: expect.any(Date) },
                    }),
                })
            );
        });
    });
});

describe('createBookingService', () => {
    const datos = {
        service_id: 'svc1',
        start_time: new Date('2026-08-10T15:00:00-03:00'),
        client: { firts_name: 'Ana', last_name: 'Pérez' },
    };

    beforeEach(() => {
        prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', duration: 45 });
        prisma.appointment.findFirst.mockResolvedValue(null);
        prisma.appointment.create.mockImplementation(({ data }) =>
            Promise.resolve({ id: 'nuevo', ...data })
        );
        findOrCreateManualClientService.mockResolvedValue({
            client: { id: 'cli1' },
            reachableByEmail: true,
        });
    });

    it('lanza 404 si el profesional no ofrece ese servicio', async () => {
        prisma.professionalService.findFirst.mockResolvedValue(null);

        await expect(createBookingService('prof1', datos)).rejects.toMatchObject({ status: 404 });
        expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('lanza 409 si pisa otro turno', async () => {
        prisma.appointment.findFirst.mockResolvedValue({ id: 'otro' });

        await expect(createBookingService('prof1', datos)).rejects.toMatchObject({ status: 409 });
        expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    // Lo carga el profesional: no tiene sentido que después se lo apruebe a sí
    // mismo desde Turnos solicitados.
    it('agenda el turno confirmado y con el fin calculado por duración', async () => {
        const appointment = await createBookingService('prof1', datos);

        expect(appointment.status).toBe('CONFIRMED');
        expect(appointment.end_time).toEqual(new Date('2026-08-10T15:45:00-03:00'));
        expect(appointment.client_id).toBe('cli1');
        expect(appointment.professional_id).toBe('prof1');
    });

    it('le manda la confirmación al cliente si dejó un email', async () => {
        await createBookingService('prof1', datos);

        expect(notifyClientOfConfirmation).toHaveBeenCalledTimes(1);
    });

    it('no manda nada si el cliente no tiene email', async () => {
        findOrCreateManualClientService.mockResolvedValue({
            client: { id: 'cli1' },
            reachableByEmail: false,
        });

        await createBookingService('prof1', datos);

        expect(notifyClientOfConfirmation).not.toHaveBeenCalled();
    });
});

describe('cancelBookingService', () => {
    const turnoPropio = {
        id: 'appt1',
        professional_id: 'prof1',
        status: 'CONFIRMED',
        start_time: new Date('2026-08-10T13:00:00-03:00'),
        professional_service: { duration: 30 },
    };

    it('lanza 404 si el turno no existe o es de otro profesional', async () => {
        prisma.appointment.findFirst.mockResolvedValue(null);

        await expect(cancelBookingService('prof1', 'appt1')).rejects.toMatchObject({ status: 404 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('busca el turno filtrando por id y por dueño a la vez', async () => {
        prisma.appointment.findFirst.mockResolvedValue(turnoPropio);
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CANCELLED' });

        await cancelBookingService('prof1', 'appt1');

        expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'appt1', professional_id: 'prof1' } })
        );
    });

    it('lanza 409 si ya estaba cancelado', async () => {
        prisma.appointment.findFirst.mockResolvedValue({ ...turnoPropio, status: 'CANCELLED' });

        await expect(cancelBookingService('prof1', 'appt1')).rejects.toMatchObject({ status: 409 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('cancela y le avisa al cliente con el mensaje escrito', async () => {
        prisma.appointment.findFirst.mockResolvedValue(turnoPropio);
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CANCELLED' });

        await cancelBookingService('prof1', 'appt1', 'Me enfermé, perdón');

        expect(prisma.appointment.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'appt1' }, data: { status: 'CANCELLED' } })
        );
        expect(notifyClientOfCancellationByProfessional).toHaveBeenCalledWith(
            expect.anything(),
            'Me enfermé, perdón'
        );
    });
});

describe('rescheduleBookingService', () => {
    const turnoPropio = {
        id: 'appt1',
        professional_id: 'prof1',
        status: 'CONFIRMED',
        start_time: new Date('2026-08-10T13:00:00-03:00'),
        professional_service: { duration: 30 },
    };
    const nuevoHorario = new Date('2026-08-10T16:00:00-03:00');

    it('lanza 404 si el turno es de otro profesional', async () => {
        prisma.appointment.findFirst.mockResolvedValue(null);

        await expect(
            rescheduleBookingService('prof1', 'appt1', nuevoHorario)
        ).rejects.toMatchObject({ status: 404 });
    });

    it('lanza 409 si el turno está cancelado', async () => {
        prisma.appointment.findFirst.mockResolvedValue({ ...turnoPropio, status: 'CANCELLED' });

        await expect(
            rescheduleBookingService('prof1', 'appt1', nuevoHorario)
        ).rejects.toMatchObject({ status: 409 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('lanza 409 si el horario nuevo pisa otro turno', async () => {
        prisma.appointment.findFirst
            .mockResolvedValueOnce(turnoPropio)
            .mockResolvedValueOnce({ id: 'otro-turno' });

        await expect(
            rescheduleBookingService('prof1', 'appt1', nuevoHorario)
        ).rejects.toMatchObject({ status: 409 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('calcula el fin nuevo con la duración del servicio', async () => {
        prisma.appointment.findFirst.mockResolvedValueOnce(turnoPropio).mockResolvedValueOnce(null);
        prisma.appointment.update.mockResolvedValue({ id: 'appt1' });

        await rescheduleBookingService('prof1', 'appt1', nuevoHorario);

        const { data } = prisma.appointment.update.mock.calls[0][0];
        expect(data.start_time).toEqual(nuevoHorario);
        expect(data.end_time).toEqual(new Date('2026-08-10T16:30:00-03:00'));
    });

    // El mail tiene que decir de dónde salió el turno, no solo a dónde va.
    it('le avisa al cliente con el horario que tenía antes', async () => {
        prisma.appointment.findFirst.mockResolvedValueOnce(turnoPropio).mockResolvedValueOnce(null);
        prisma.appointment.update.mockResolvedValue({ id: 'appt1' });

        await rescheduleBookingService('prof1', 'appt1', nuevoHorario, 'Te lo paso más tarde');

        expect(notifyClientOfReschedule).toHaveBeenCalledWith(
            expect.anything(),
            turnoPropio.start_time,
            'Te lo paso más tarde'
        );
    });
});

describe('updateMyAccountService', () => {
    it('lanza 409 si el link de reserva ya lo tiene otra cuenta', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'otro-prof' });

        await expect(
            updateMyAccountService('prof1', { slug: 'carlos-gomez' })
        ).rejects.toMatchObject({ status: 409 });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('deja guardar el link que ya era propio', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'prof1' });
        prisma.user.update.mockResolvedValue({ slug: 'carlos-gomez' });

        await updateMyAccountService('prof1', { slug: 'carlos-gomez' });

        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'prof1' }, data: { slug: 'carlos-gomez' } })
        );
    });

    it('no consulta unicidad si no se está cambiando el link', async () => {
        prisma.user.update.mockResolvedValue({});

        await updateMyAccountService('prof1', { firts_name: 'Ana', last_name: 'Pérez' });

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.user.update).toHaveBeenCalled();
    });
});

describe('updateMySettingsService', () => {
    it('guarda solo lo que cambió, sobre el usuario logueado', async () => {
        prisma.user.update.mockResolvedValue({ auto_accept: true });

        await updateMySettingsService('prof1', { auto_accept: true });

        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'prof1' },
                data: { auto_accept: true },
            })
        );
    });

    it('devuelve la configuración completa, no solo el campo tocado', async () => {
        prisma.user.update.mockResolvedValue({});

        await updateMySettingsService('prof1', { min_notice_hours: 24 });

        const { select } = prisma.user.update.mock.calls[0][0];
        expect(select).toMatchObject({
            auto_accept: true,
            min_notice_hours: true,
            max_days_ahead: true,
            cancel_notice_hours: true,
            notify_on_booking: true,
        });
    });
});

describe('changeMyPasswordService', () => {
    beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue({ id: 'prof1', password: 'hash-actual' });
    });

    it('lanza 401 si la contraseña actual no coincide', async () => {
        bcrypt.compare.mockResolvedValue(false);

        await expect(
            changeMyPasswordService('prof1', {
                current_password: 'equivocada',
                new_password: 'nuevaclave123',
            })
        ).rejects.toMatchObject({ status: 401 });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lanza 400 si la nueva es igual a la actual', async () => {
        // La primera comparación valida la actual; la segunda detecta que la
        // nueva es la misma.
        bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

        await expect(
            changeMyPasswordService('prof1', {
                current_password: 'laactual',
                new_password: 'laactual',
            })
        ).rejects.toMatchObject({ status: 400 });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('guarda la contraseña nueva hasheada', async () => {
        bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        bcrypt.hash.mockResolvedValue('hash-nuevo');
        prisma.user.update.mockResolvedValue({});

        await changeMyPasswordService('prof1', {
            current_password: 'laactual',
            new_password: 'nuevaclave123',
        });

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'prof1' },
            data: { password: 'hash-nuevo' },
        });
    });
});

// Marcar asistencia es lo único que el cierre automático no puede adivinar.
describe('setAttendanceService', () => {
    const pasado = (status) => ({
        id: 'appt1',
        professional_id: 'prof1',
        status,
        end_time: new Date(Date.now() - 60 * 60 * 1000),
        professional_service: { duration: 30 },
    });

    it('marca NO_SHOW cuando el cliente no vino', async () => {
        prisma.appointment.findFirst.mockResolvedValue(pasado('COMPLETED'));
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'NO_SHOW' });

        const result = await setAttendanceService('prof1', 'appt1', false);

        expect(prisma.appointment.update).toHaveBeenCalledWith({
            where: { id: 'appt1' },
            data: { status: 'NO_SHOW' },
        });
        expect(result.status).toBe('NO_SHOW');
    });

    it('se puede corregir de vuelta a COMPLETED', async () => {
        prisma.appointment.findFirst.mockResolvedValue(pasado('NO_SHOW'));
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'COMPLETED' });

        await setAttendanceService('prof1', 'appt1', true);

        const [{ data }] = prisma.appointment.update.mock.calls[0];
        expect(data).toEqual({ status: 'COMPLETED' });
    });

    it('lanza 409 si el turno todavía no pasó', async () => {
        prisma.appointment.findFirst.mockResolvedValue({
            ...pasado('CONFIRMED'),
            end_time: new Date(Date.now() + 60 * 60 * 1000),
        });

        await expect(setAttendanceService('prof1', 'appt1', true)).rejects.toMatchObject({
            status: 409,
        });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    // Un turno que nunca se aceptó no llegó a existir para el cliente.
    it('lanza 409 si el turno sigue pendiente de aceptación', async () => {
        prisma.appointment.findFirst.mockResolvedValue(pasado('PENDING'));

        await expect(setAttendanceService('prof1', 'appt1', false)).rejects.toMatchObject({
            status: 409,
        });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('lanza 409 si el turno está cancelado', async () => {
        prisma.appointment.findFirst.mockResolvedValue(pasado('CANCELLED'));

        await expect(setAttendanceService('prof1', 'appt1', true)).rejects.toMatchObject({
            status: 409,
        });
    });

    // El id y el dueño van en el mismo where: no se contesta distinto según el
    // turno no exista o sea de otro profesional.
    it('lanza 404 si el turno es de otro profesional', async () => {
        prisma.appointment.findFirst.mockResolvedValue(null);

        await expect(setAttendanceService('prof1', 'appt1', true)).rejects.toMatchObject({
            status: 404,
        });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    // No manda mail a propósito: "marcamos que no viniste" no le sirve a nadie.
    it('no le avisa nada al cliente', async () => {
        prisma.appointment.findFirst.mockResolvedValue(pasado('COMPLETED'));
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'NO_SHOW' });

        await setAttendanceService('prof1', 'appt1', false);

        expect(notifyInBackground).not.toHaveBeenCalled();
    });
});
