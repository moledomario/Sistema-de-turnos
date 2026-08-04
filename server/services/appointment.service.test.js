import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Los horarios de este archivo están escritos en hora de Argentina (el "-03:00"
// de cada fecha), así que la zona del negocio se fija acá antes de importar
// nada. Sin esto el resultado dependería del APP_TIMEZONE de quien corra los
// tests; con esto, y con las fechas ya sin ambigüedad, la suite da igual en un
// server de Buenos Aires que en uno de UTC.
process.env.APP_TIMEZONE = 'America/Argentina/Buenos_Aires';

vi.mock('../src/lib/prisma.js', () => ({
    prisma: {
        professionalService: { findFirst: vi.fn(), findMany: vi.fn() },
        appointment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        availability: { findMany: vi.fn() },
        user: { findMany: vi.fn(), findUnique: vi.fn() },
    },
}));

// Los mails son un efecto secundario: acá solo interesa a quién se le avisa,
// no el HTML ni que Resend esté configurado.
vi.mock('./notification.service.js', () => ({
    notificationInclude: {},
    notifyProfessionalOfBooking: vi.fn(),
    notifyClientOfConfirmation: vi.fn(),
    notifyClientOfRejection: vi.fn(),
    notifyInBackground: vi.fn(),
}));

const { prisma } = await import('../src/lib/prisma.js');
const { notifyProfessionalOfBooking, notifyClientOfConfirmation } = await import('./notification.service.js');
const {
    createAppointmentService,
    getAvailableSlotsService,
    cancelAppointmentService,
    rescheduleAppointmentService,
    closePastAppointments,
} = await import('./appointment.service.js');

// Lunes 3 de agosto de 2026, la fecha de referencia de todo el archivo: los
// tests la escriben fija ('2026-08-03T12:00:00-03:00') y asumen que es futura.
// Cualquier test nuevo con fecha propia tiene que caer en este mismo lunes, o
// congelar su propio reloj.
const LUNES = '2026-08-03';
// Las 8 de la mañana, antes de que abra el horario de atención (09:00), así todo
// horario del día cuenta como futuro.
const AHORA = new Date(`${LUNES}T08:00:00-03:00`);

beforeEach(() => {
    vi.clearAllMocks();
    // El reloj va congelado para TODO el archivo. Sin esto, las fechas fijas de
    // arriba dejaban de ser futuras el día que el calendario real las alcanzaba
    // y ocho tests se caían solos (pasó el 2026-08-03). Con el reloj fijo,
    // "pasado" y "futuro" significan siempre lo mismo, corra el día que corra.
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    // Por defecto el profesional revisa sus turnos a mano, no pide antelación y
    // deja reservar con dos meses de anticipación (los valores que trae una
    // cuenta nueva). Cada select del servicio lee solo lo suyo de este objeto.
    prisma.user.findUnique.mockResolvedValue({
        auto_accept: false,
        min_notice_hours: 0,
        max_days_ahead: 60,
        cancel_notice_hours: 0,
        notify_on_booking: true,
    });
    // Y atiende todo el día, así los tests que no van sobre el horario de
    // atención no tienen que declararlo.
    prisma.availability.findMany.mockResolvedValue([{ start_minutes: 0, end_minutes: 1440 }]);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('getAvailableSlotsService', () => {
    it('lanza error si el profesional no ofrece ese servicio', async () => {
        prisma.professionalService.findFirst.mockResolvedValue(null);

        await expect(getAvailableSlotsService('prof', 'svc', '2026-08-03')).rejects.toThrow(
            'El profesional no tiene ese servicio'
        );
    });

    it('devuelve [] sin consultar turnos si no hay ventana de disponibilidad ese día', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ duration: 30 });
        prisma.availability.findMany.mockResolvedValue([]);

        const slots = await getAvailableSlotsService('prof', 'svc', '2026-08-03');

        expect(slots).toEqual([]);
        expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('genera slots consecutivos según la duración dentro de la ventana', async () => {
        const dateStr = '2026-08-03';
        const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
        const weekday = 1; // lunes, en la zona del negocio

        vi.useFakeTimers();
        vi.setSystemTime(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000)); // el día anterior

        prisma.professionalService.findFirst.mockResolvedValue({ duration: 30 });
        prisma.availability.findMany.mockResolvedValue([
            { weekday, start_minutes: 540, end_minutes: 600 }, // 09:00 a 10:00
        ]);
        prisma.appointment.findMany.mockResolvedValue([]);

        const slots = await getAvailableSlotsService('prof', 'svc', dateStr);

        const slot1Start = new Date(dayStart.getTime() + 540 * 60 * 1000);
        const slot2Start = new Date(dayStart.getTime() + 570 * 60 * 1000);

        expect(slots).toEqual([
            { start_time: slot1Start.toISOString(), end_time: new Date(slot1Start.getTime() + 30 * 60 * 1000).toISOString() },
            { start_time: slot2Start.toISOString(), end_time: new Date(slot2Start.getTime() + 30 * 60 * 1000).toISOString() },
        ]);
    });

    it('excluye slots que se superponen con turnos existentes', async () => {
        const dateStr = '2026-08-03';
        const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
        const weekday = 1; // lunes, en la zona del negocio

        vi.useFakeTimers();
        vi.setSystemTime(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000));

        prisma.professionalService.findFirst.mockResolvedValue({ duration: 30 });
        prisma.availability.findMany.mockResolvedValue([
            { weekday, start_minutes: 540, end_minutes: 600 },
        ]);

        const occupiedStart = new Date(dayStart.getTime() + 540 * 60 * 1000);
        const occupiedEnd = new Date(occupiedStart.getTime() + 30 * 60 * 1000);
        prisma.appointment.findMany.mockResolvedValue([
            { start_time: occupiedStart, end_time: occupiedEnd },
        ]);

        const slots = await getAvailableSlotsService('prof', 'svc', dateStr);

        expect(slots).toHaveLength(1);
        expect(slots[0].start_time).toBe(new Date(dayStart.getTime() + 570 * 60 * 1000).toISOString());
    });

    it('excluye slots cuyo horario ya pasó', async () => {
        const dateStr = '2026-08-03';
        const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
        const weekday = 1; // lunes, en la zona del negocio

        vi.useFakeTimers();
        // "ahora" cae 21 minutos después de que empezó el slot de las 09:00 (540 min),
        // pero 9 minutos antes de que empiece el de las 09:30 (570 min).
        vi.setSystemTime(new Date(dayStart.getTime() + 561 * 60 * 1000));

        prisma.professionalService.findFirst.mockResolvedValue({ duration: 30 });
        prisma.availability.findMany.mockResolvedValue([
            { weekday, start_minutes: 540, end_minutes: 600 },
        ]);
        prisma.appointment.findMany.mockResolvedValue([]);

        const slots = await getAvailableSlotsService('prof', 'svc', dateStr);

        expect(slots).toHaveLength(1);
        expect(slots[0].start_time).toBe(new Date(dayStart.getTime() + 570 * 60 * 1000).toISOString());
    });

    it('pasa status: not CANCELLED al buscar turnos existentes (no deben bloquear el slot)', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ duration: 30 });
        prisma.availability.findMany.mockResolvedValue([{ weekday: 0, start_minutes: 540, end_minutes: 600 }]);
        prisma.appointment.findMany.mockResolvedValue([]);

        await getAvailableSlotsService('prof', 'svc', '2026-08-02'); // domingo

        expect(prisma.appointment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ status: { not: 'CANCELLED' } }),
            })
        );
    });
});

describe('createAppointmentService', () => {
    it('lanza error si el profesional no ofrece ese servicio', async () => {
        prisma.professionalService.findFirst.mockResolvedValue(null);

        await expect(
            createAppointmentService({
                professional_id: 'prof',
                service_id: 'svc',
                client_id: 'client',
                start_time: new Date('2026-08-03T12:00:00.000Z'),
            })
        ).rejects.toThrow('El profesional no tiene ese servicio');
    });

    it('lanza error si ya existe un turno en ese horario', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', user_id: 'prof', duration: 30 });
        prisma.appointment.findMany.mockResolvedValue([{ id: 'other' }]);

        await expect(
            createAppointmentService({
                professional_id: 'prof',
                service_id: 'svc',
                client_id: 'client',
                start_time: new Date('2026-08-03T12:00:00.000Z'),
            })
        ).rejects.toThrow('Ya existe un turno en ese horario');

        expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    // El horario de atención se valida también acá, no solo al generar los
    // horarios libres: si no, alcanzaba con mandar el horario a mano para
    // reservar en un corte.
    describe('horario de atención', () => {
        // Lunes 3 de agosto de 2026, con corte de 13:00 a 14:00.
        const conCorte = [
            { weekday: 1, start_minutes: 540, end_minutes: 780 },
            { weekday: 1, start_minutes: 840, end_minutes: 1080 },
        ];

        const reservar = (start, duration = 30) => {
            prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', user_id: 'prof', duration });
            prisma.appointment.findMany.mockResolvedValue([]);
            prisma.appointment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));
            return createAppointmentService({
                professional_id: 'prof',
                service_id: 'svc',
                client_id: 'client',
                start_time: start,
            });
        };

        it('rechaza un turno que cae dentro del corte', async () => {
            prisma.availability.findMany.mockResolvedValue(conCorte);

            await expect(reservar(new Date('2026-08-03T13:00:00-03:00'))).rejects.toMatchObject({
                status: 409,
                message: 'El profesional no atiende en ese horario',
            });
            expect(prisma.appointment.create).not.toHaveBeenCalled();
        });

        it('rechaza un turno que empieza dentro de la franja pero termina en el corte', async () => {
            prisma.availability.findMany.mockResolvedValue(conCorte);

            // 12:45 + 30 min se pasa de las 13:00.
            await expect(reservar(new Date('2026-08-03T12:45:00-03:00'))).rejects.toMatchObject({ status: 409 });
            expect(prisma.appointment.create).not.toHaveBeenCalled();
        });

        it('rechaza un turno en un día sin horarios cargados', async () => {
            prisma.availability.findMany.mockResolvedValue([]);

            await expect(reservar(new Date('2026-08-03T10:00:00-03:00'))).rejects.toMatchObject({ status: 409 });
            expect(prisma.appointment.create).not.toHaveBeenCalled();
        });

        it('deja reservar en las franjas de los dos lados del corte', async () => {
            prisma.availability.findMany.mockResolvedValue(conCorte);

            await expect(reservar(new Date('2026-08-03T12:30:00-03:00'))).resolves.toBeTruthy();
            await expect(reservar(new Date('2026-08-03T14:00:00-03:00'))).resolves.toBeTruthy();
        });

        it('busca las franjas del día de la semana que corresponde', async () => {
            prisma.availability.findMany.mockResolvedValue(conCorte);

            await reservar(new Date('2026-08-03T10:00:00-03:00'));

            expect(prisma.availability.findMany).toHaveBeenCalledWith({
                where: { user_id: 'prof', weekday: 1 },
            });
        });
    });

    // Reglas configurables desde el panel. Se validan también al crear, no solo
    // al listar horarios, porque el start_time puede llegar armado a mano.
    describe('reglas de reserva', () => {
        beforeEach(() => {
            // Reloj fijo a media mañana: los turnos que se piden "en X horas"
            // caen dentro del mismo día. Corriendo de noche, un turno a +2 h se
            // pasaba de la medianoche y lo frenaba el horario de atención, no la
            // regla que se está probando.
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-08-03T10:00:00-03:00'));
        });

        const reservar = (start) => {
            prisma.professionalService.findFirst.mockResolvedValue({
                id: 'ps1',
                user_id: 'prof',
                duration: 30,
            });
            prisma.appointment.findMany.mockResolvedValue([]);
            prisma.appointment.create.mockImplementation(({ data }) =>
                Promise.resolve({ id: 'new', ...data })
            );
            return createAppointmentService({
                professional_id: 'prof',
                service_id: 'svc',
                client_id: 'client',
                start_time: start,
            });
        };

        const enHoras = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

        it('rechaza un turno con menos antelación que la mínima', async () => {
            prisma.user.findUnique.mockResolvedValue({
                auto_accept: false,
                min_notice_hours: 24,
                max_days_ahead: 60,
            });

            await expect(reservar(enHoras(2))).rejects.toMatchObject({ status: 409 });
            expect(prisma.appointment.create).not.toHaveBeenCalled();
        });

        it('acepta el turno una vez pasada la antelación mínima', async () => {
            prisma.user.findUnique.mockResolvedValue({
                auto_accept: false,
                min_notice_hours: 24,
                max_days_ahead: 60,
            });

            await expect(reservar(enHoras(48))).resolves.toBeTruthy();
        });

        it('rechaza un turno más allá del máximo de días', async () => {
            prisma.user.findUnique.mockResolvedValue({
                auto_accept: false,
                min_notice_hours: 0,
                max_days_ahead: 30,
            });

            await expect(reservar(enHoras(31 * 24))).rejects.toMatchObject({ status: 409 });
            expect(prisma.appointment.create).not.toHaveBeenCalled();
        });

        it('con la configuración por defecto no molesta', async () => {
            await expect(reservar(enHoras(2))).resolves.toBeTruthy();
        });
    });

    it('calcula end_time a partir de la duración y crea el turno', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', user_id: 'prof', duration: 45 });
        prisma.appointment.findMany.mockResolvedValue([]);
        prisma.appointment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));

        const start = new Date('2026-08-03T12:00:00.000Z');
        const result = await createAppointmentService({
            professional_id: 'prof',
            service_id: 'svc',
            client_id: 'client',
            start_time: start,
        });

        expect(result.end_time).toEqual(new Date('2026-08-03T12:45:00.000Z'));
        expect(prisma.appointment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    professional_service_id: 'ps1',
                    professional_id: 'prof',
                    client_id: 'client',
                    start_time: start,
                }),
            })
        );
    });

    it('deja el turno PENDING y solo avisa al profesional si no tiene auto_accept', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', user_id: 'prof', duration: 30 });
        prisma.appointment.findMany.mockResolvedValue([]);
        prisma.user.findUnique.mockResolvedValue({ auto_accept: false });
        prisma.appointment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));

        const result = await createAppointmentService({
            professional_id: 'prof',
            service_id: 'svc',
            client_id: 'client',
            start_time: new Date('2026-08-03T12:00:00.000Z'),
        });

        expect(result.status).toBe('PENDING');
        expect(notifyProfessionalOfBooking).toHaveBeenCalledTimes(1);
        expect(notifyClientOfConfirmation).not.toHaveBeenCalled();
    });

    it('confirma el turno y avisa a las dos partes si el profesional tiene auto_accept', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', user_id: 'prof', duration: 30 });
        prisma.appointment.findMany.mockResolvedValue([]);
        prisma.user.findUnique.mockResolvedValue({ auto_accept: true });
        prisma.appointment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));

        const result = await createAppointmentService({
            professional_id: 'prof',
            service_id: 'svc',
            client_id: 'client',
            start_time: new Date('2026-08-03T12:00:00.000Z'),
        });

        expect(result.status).toBe('CONFIRMED');
        expect(notifyProfessionalOfBooking).toHaveBeenCalledTimes(1);
        expect(notifyClientOfConfirmation).toHaveBeenCalledTimes(1);
    });

    it('traduce el error de constraint de superposición a un mensaje amigable', async () => {
        prisma.professionalService.findFirst.mockResolvedValue({ id: 'ps1', user_id: 'prof', duration: 30 });
        prisma.appointment.findMany.mockResolvedValue([]);
        prisma.appointment.create.mockRejectedValue(new Error('violates exclusion constraint "appointment_overlap_constraint"'));

        await expect(
            createAppointmentService({
                professional_id: 'prof',
                service_id: 'svc',
                client_id: 'client',
                start_time: new Date('2026-08-03T12:00:00.000Z'),
            })
        ).rejects.toThrow('Ya existe un turno en ese horario');
    });
});

describe('cancelAppointmentService', () => {
    // El profesional puede exigir un aviso mínimo para cancelar desde la app.
    describe('aviso mínimo para cancelar', () => {
        const turnoEn = (hours) => ({
            id: 'appt1',
            client_id: 'client1',
            professional_id: 'prof',
            status: 'CONFIRMED',
            start_time: new Date(Date.now() + hours * 60 * 60 * 1000),
        });

        it('lanza 409 si falta menos tiempo que el aviso pedido', async () => {
            prisma.appointment.findUnique.mockResolvedValue(turnoEn(2));
            prisma.user.findUnique.mockResolvedValue({ cancel_notice_hours: 24 });

            await expect(cancelAppointmentService('client1', 'appt1')).rejects.toMatchObject({
                status: 409,
            });
            expect(prisma.appointment.update).not.toHaveBeenCalled();
        });

        it('deja cancelar si todavía hay margen', async () => {
            prisma.appointment.findUnique.mockResolvedValue(turnoEn(48));
            prisma.user.findUnique.mockResolvedValue({ cancel_notice_hours: 24 });
            prisma.appointment.update.mockResolvedValue({ status: 'CANCELLED' });

            await cancelAppointmentService('client1', 'appt1');

            expect(prisma.appointment.update).toHaveBeenCalled();
        });

        it('sin aviso configurado se puede cancelar hasta que empiece', async () => {
            prisma.appointment.findUnique.mockResolvedValue(turnoEn(0.5));
            prisma.user.findUnique.mockResolvedValue({ cancel_notice_hours: 0 });
            prisma.appointment.update.mockResolvedValue({ status: 'CANCELLED' });

            await cancelAppointmentService('client1', 'appt1');

            expect(prisma.appointment.update).toHaveBeenCalled();
        });
    });

    it('lanza 404 si el turno no existe', async () => {
        prisma.appointment.findUnique.mockResolvedValue(null);

        await expect(cancelAppointmentService('client1', 'appt1')).rejects.toMatchObject({
            status: 404,
        });
    });

    it('lanza 404 si el turno es de otro cliente (no filtra información del dueño real)', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'otro-cliente',
            status: 'PENDING',
            start_time: new Date(Date.now() + 60 * 60 * 1000),
        });

        await expect(cancelAppointmentService('client1', 'appt1')).rejects.toMatchObject({ status: 404 });
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('lanza 409 si el turno ya está cancelado', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'CANCELLED',
            start_time: new Date(Date.now() + 60 * 60 * 1000),
        });

        await expect(cancelAppointmentService('client1', 'appt1')).rejects.toMatchObject({ status: 409 });
    });

    it('lanza 409 si el turno ya pasó', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'PENDING',
            start_time: new Date(Date.now() - 60 * 60 * 1000),
        });

        await expect(cancelAppointmentService('client1', 'appt1')).rejects.toMatchObject({ status: 409 });
    });

    it('cancela un turno propio y futuro', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'PENDING',
            start_time: new Date(Date.now() + 60 * 60 * 1000),
        });
        prisma.appointment.update.mockResolvedValue({ id: 'appt1', status: 'CANCELLED' });

        const result = await cancelAppointmentService('client1', 'appt1');

        expect(result.status).toBe('CANCELLED');
        expect(prisma.appointment.update).toHaveBeenCalledWith({
            where: { id: 'appt1' },
            data: { status: 'CANCELLED' },
        });
    });
});

describe('rescheduleAppointmentService', () => {
    const futureStart = () => new Date(Date.now() + 60 * 60 * 1000);

    beforeEach(() => {
        // El reloj se fija a media mañana de un lunes: `futureStart()` cae una
        // hora después, siempre dentro del mismo día. Sin esto los tests fallan
        // si se corren de noche, porque el turno se pasa de la medianoche y deja
        // de entrar en el horario de atención.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T10:00:00-03:00'));
    });

    it('lanza 404 si el turno no existe o es de otro cliente', async () => {
        prisma.appointment.findUnique.mockResolvedValue(null);

        await expect(
            rescheduleAppointmentService('client1', 'appt1', futureStart())
        ).rejects.toMatchObject({ status: 404 });
    });

    it('lanza 409 si el turno está cancelado', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'CANCELLED',
            professional_id: 'prof',
            professional_service: { duration: 30 },
        });

        await expect(
            rescheduleAppointmentService('client1', 'appt1', futureStart())
        ).rejects.toMatchObject({ status: 409 });
    });

    it('lanza 409 si el nuevo horario cae en un corte del profesional', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T08:00:00-03:00'));

        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'PENDING',
            professional_id: 'prof',
            professional_service: { duration: 30 },
        });
        prisma.availability.findMany.mockResolvedValue([
            { weekday: 1, start_minutes: 540, end_minutes: 780 },
            { weekday: 1, start_minutes: 840, end_minutes: 1080 },
        ]);

        await expect(
            rescheduleAppointmentService('client1', 'appt1', new Date('2026-08-03T13:00:00-03:00'))
        ).rejects.toMatchObject({ status: 409, message: 'El profesional no atiende en ese horario' });

        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('lanza 400 si el nuevo horario no es futuro', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'PENDING',
            professional_id: 'prof',
            professional_service: { duration: 30 },
        });

        const pastStart = new Date(Date.now() - 60 * 60 * 1000);

        await expect(
            rescheduleAppointmentService('client1', 'appt1', pastStart)
        ).rejects.toMatchObject({ status: 400 });
    });

    it('lanza 409 si el nuevo horario choca con otro turno del profesional', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'PENDING',
            professional_id: 'prof',
            professional_service: { duration: 30 },
        });
        prisma.appointment.findMany.mockResolvedValue([{ id: 'other' }]);

        await expect(
            rescheduleAppointmentService('client1', 'appt1', futureStart())
        ).rejects.toMatchObject({ status: 409 });

        expect(prisma.appointment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: { not: 'appt1' },
                    status: { not: 'CANCELLED' },
                }),
            })
        );
        expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('reprograma calculando el nuevo end_time a partir de la duración', async () => {
        prisma.appointment.findUnique.mockResolvedValue({
            id: 'appt1',
            client_id: 'client1',
            status: 'PENDING',
            professional_id: 'prof',
            professional_service: { duration: 45 },
        });
        prisma.appointment.findMany.mockResolvedValue([]);
        prisma.appointment.update.mockImplementation(({ data }) => Promise.resolve({ id: 'appt1', ...data }));

        const newStart = futureStart();
        const result = await rescheduleAppointmentService('client1', 'appt1', newStart);

        expect(result.start_time).toEqual(newStart);
        expect(result.end_time).toEqual(new Date(newStart.getTime() + 45 * 60 * 1000));
        expect(prisma.appointment.update).toHaveBeenCalledWith({
            where: { id: 'appt1' },
            data: { start_time: newStart, end_time: result.end_time },
        });
    });
});

// Un turno confirmado que ya pasó se cierra solo. Antes se quedaba para siempre
// en CONFIRMED y el historial no distinguía "se atendió" de "no vino".
describe('closePastAppointments', () => {
    it('solo toca los CONFIRMED que ya terminaron, y del dueño indicado', async () => {
        prisma.appointment.updateMany.mockResolvedValue({ count: 2 });

        await closePastAppointments({ professional_id: 'prof' });

        const [{ where, data }] = prisma.appointment.updateMany.mock.calls[0];
        expect(where.professional_id).toBe('prof');
        expect(where.status).toBe('CONFIRMED');
        expect(where.end_time).toEqual({ lt: expect.any(Date) });
        expect(data).toEqual({ status: 'COMPLETED' });
    });

    // Filtrar por CONFIRMED es lo que hace que el cierre automático sea seguro
    // de correr en cada listado: no pisa un NO_SHOW marcado a mano, ni revive
    // un cancelado, ni cierra un pendiente que nunca se aceptó.
    it('no puede pisar lo que el profesional marcó a mano', async () => {
        prisma.appointment.updateMany.mockResolvedValue({ count: 0 });

        await closePastAppointments({ client_id: 'cli' });

        const [{ where }] = prisma.appointment.updateMany.mock.calls[0];
        expect(where.status).toBe('CONFIRMED');
        expect(where.client_id).toBe('cli');
    });

    it('acota al cliente cuando lo consulta un cliente', async () => {
        prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

        await closePastAppointments({ client_id: 'cli1' });

        const [{ where }] = prisma.appointment.updateMany.mock.calls[0];
        expect(where.client_id).toBe('cli1');
        expect(where.professional_id).toBeUndefined();
    });
});
