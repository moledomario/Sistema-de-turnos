import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
    prisma: {
        user: { findUnique: vi.fn(), update: vi.fn() },
    },
}));

// El cliente de MP se mockea entero: los tests de acá son de la lógica de
// negocio (a quién se le aplica qué plan y cuándo), no de la API de Mercado
// Pago, que ya tiene sus propios tests en src/lib/mercadopago.test.js.
vi.mock('../src/lib/mercadopago.js', async () => {
    const actual = await vi.importActual('../src/lib/mercadopago.js');
    return {
        ...actual,
        isConfigured: vi.fn(() => true),
        createPreapproval: vi.fn(),
        getPreapproval: vi.fn(),
        getAuthorizedPayment: vi.fn(),
        cancelPreapproval: vi.fn(),
    };
});

const { prisma } = await import('../src/lib/prisma.js');
const {
    isConfigured,
    createPreapproval,
    getPreapproval,
    getAuthorizedPayment,
    cancelPreapproval,
} = await import('../src/lib/mercadopago.js');
const {
    shouldResync,
    getMySubscriptionService,
    startSubscriptionService,
    syncSubscriptionService,
    handleWebhookService,
    cancelSubscriptionService,
} = await import('./billing.service.js');

const USER_ID = '11111111-1111-1111-1111-111111111111';

const unUsuario = (overrides = {}) => ({
    id: USER_ID,
    email: 'pro@test.com',
    subscription_status: 'NONE',
    mp_preapproval_id: null,
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    isConfigured.mockReturnValue(true);
    process.env.APP_URL = 'https://app.test';
    prisma.user.update.mockResolvedValue({});
});

describe('startSubscriptionService', () => {
    it('crea la suscripción y devuelve el init_point', async () => {
        prisma.user.findUnique.mockResolvedValue(unUsuario());
        createPreapproval.mockResolvedValue({
            id: 'pre-1',
            init_point: 'https://mp/checkout?preapproval_id=pre-1',
            status: 'pending',
        });

        const result = await startSubscriptionService(USER_ID, 'EQUIPO');

        expect(result).toEqual({
            init_point: 'https://mp/checkout?preapproval_id=pre-1',
            preapproval_id: 'pre-1',
        });
    });

    it('usa el precio del catálogo del server, no uno que venga de afuera', async () => {
        prisma.user.findUnique.mockResolvedValue(unUsuario());
        createPreapproval.mockResolvedValue({ id: 'pre-1', init_point: 'https://mp/x', status: 'pending' });

        await startSubscriptionService(USER_ID, 'NEGOCIO');

        expect(createPreapproval).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 49999,
                payerEmail: 'pro@test.com',
                externalReference: `${USER_ID}:NEGOCIO`,
                backUrl: 'https://app.test/panel/suscripcion',
            })
        );
    });

    it('guarda el id de MP y el estado, pero NO cambia el plan todavía', async () => {
        prisma.user.findUnique.mockResolvedValue(unUsuario());
        createPreapproval.mockResolvedValue({ id: 'pre-1', init_point: 'https://mp/x', status: 'pending' });

        await startSubscriptionService(USER_ID, 'NEGOCIO');

        const { data } = prisma.user.update.mock.calls[0][0];
        expect(data).toEqual({ mp_preapproval_id: 'pre-1', subscription_status: 'PENDING' });
        // Lo importante: sin esto, crear una suscripción y no pagarla nunca
        // alcanzaría para quedarse con el plan más caro.
        expect(data).not.toHaveProperty('plan');
    });

    it('rechaza un plan que no existe sin llamar a Mercado Pago', async () => {
        prisma.user.findUnique.mockResolvedValue(unUsuario());

        await expect(startSubscriptionService(USER_ID, 'PLAN_TRUCHO')).rejects.toMatchObject({
            status: 400,
        });
        expect(createPreapproval).not.toHaveBeenCalled();
    });

    it.each(['AUTHORIZED', 'PAUSED'])(
        'no deja crear una segunda suscripción si ya hay una en %s',
        async (status) => {
            prisma.user.findUnique.mockResolvedValue(
                unUsuario({ subscription_status: status, mp_preapproval_id: 'pre-viejo' })
            );

            await expect(startSubscriptionService(USER_ID, 'EQUIPO')).rejects.toMatchObject({
                status: 409,
            });
            expect(createPreapproval).not.toHaveBeenCalled();
        }
    );

    it.each(['NONE', 'PENDING', 'CANCELLED'])(
        'sí deja suscribirse de nuevo si la anterior quedó en %s',
        async (status) => {
            prisma.user.findUnique.mockResolvedValue(unUsuario({ subscription_status: status }));
            createPreapproval.mockResolvedValue({ id: 'pre-2', init_point: 'https://mp/x', status: 'pending' });

            await expect(startSubscriptionService(USER_ID, 'EQUIPO')).resolves.toBeTruthy();
        }
    );

    it('devuelve 503 si Mercado Pago no está configurado', async () => {
        isConfigured.mockReturnValue(false);

        await expect(startSubscriptionService(USER_ID, 'EQUIPO')).rejects.toMatchObject({
            status: 503,
        });
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('falla si MP contesta sin init_point, en vez de dar por buena la suscripción', async () => {
        prisma.user.findUnique.mockResolvedValue(unUsuario());
        createPreapproval.mockResolvedValue({ id: 'pre-1', status: 'pending' });

        await expect(startSubscriptionService(USER_ID, 'EQUIPO')).rejects.toMatchObject({
            status: 502,
        });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });
});

describe('syncSubscriptionService', () => {
    const preapproval = (overrides = {}) => ({
        id: 'pre-1',
        status: 'authorized',
        external_reference: `${USER_ID}:EQUIPO`,
        next_payment_date: '2026-09-04T11:12:25.892-03:00',
        ...overrides,
    });

    it('aplica el plan cuando la suscripción queda autorizada', async () => {
        getPreapproval.mockResolvedValue(preapproval());
        prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

        await syncSubscriptionService('pre-1');

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: USER_ID },
            data: {
                mp_preapproval_id: 'pre-1',
                subscription_status: 'AUTHORIZED',
                subscription_next_payment: new Date('2026-09-04T11:12:25.892-03:00'),
                subscription_synced_at: expect.any(Date),
                plan: 'EQUIPO',
            },
        });
    });

    it.each(['pending', 'paused', 'canceled'])(
        'con estado %s actualiza el estado pero no toca el plan',
        async (mpStatus) => {
            getPreapproval.mockResolvedValue(preapproval({ status: mpStatus, next_payment_date: null }));
            prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

            await syncSubscriptionService('pre-1');

            const { data } = prisma.user.update.mock.calls[0][0];
            expect(data).not.toHaveProperty('plan');
            expect(data.subscription_next_payment).toBeNull();
        }
    );

    it('es idempotente: correrlo dos veces deja lo mismo', async () => {
        // El reloj se congela porque el update lleva subscription_synced_at:
        // sin esto las dos corridas difieren en esa marca y el test compararía
        // el reloj en vez de la lógica.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-04T12:00:00-03:00'));

        getPreapproval.mockResolvedValue(preapproval());
        prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

        await syncSubscriptionService('pre-1');
        const primera = prisma.user.update.mock.calls[0][0];

        await syncSubscriptionService('pre-1');
        const segunda = prisma.user.update.mock.calls[1][0];

        expect(segunda).toEqual(primera);

        vi.useRealTimers();
    });

    it('ignora un estado de MP que no conoce en vez de adivinar', async () => {
        getPreapproval.mockResolvedValue(preapproval({ status: 'algo_nuevo' }));

        const result = await syncSubscriptionService('pre-1');

        expect(result.ignored).toBe(true);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('cae al external_reference si no encuentra al usuario por el id de MP', async () => {
        getPreapproval.mockResolvedValue(preapproval());
        // Primera búsqueda (por mp_preapproval_id) vacía, segunda (por id) sí.
        prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: USER_ID });

        const result = await syncSubscriptionService('pre-1');

        expect(result.updated).toBe(true);
        expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
            where: { id: USER_ID },
            select: { id: true },
        });
    });

    it('ignora la notificación si no hay usuario para esa suscripción', async () => {
        getPreapproval.mockResolvedValue(preapproval({ external_reference: 'otra-cosa' }));
        prisma.user.findUnique.mockResolvedValue(null);

        const result = await syncSubscriptionService('pre-1');

        expect(result.ignored).toBe(true);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('no aplica un plan si el external_reference trae uno que no existe', async () => {
        getPreapproval.mockResolvedValue(
            preapproval({ external_reference: `${USER_ID}:PLAN_TRUCHO` })
        );
        prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

        await syncSubscriptionService('pre-1');

        expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('plan');
    });
});

describe('shouldResync', () => {
    const AHORA = new Date('2026-08-04T12:00:00-03:00').getTime();
    const haceMinutos = (min) => new Date(AHORA - min * 60 * 1000);

    it('no pide nada si nunca hubo suscripción', () => {
        expect(shouldResync({ mp_preapproval_id: null, subscription_status: 'NONE' }, AHORA)).toBe(
            false
        );
    });

    it('no pide nada si está cancelada (en MP es un estado irreversible)', () => {
        expect(
            shouldResync(
                { mp_preapproval_id: 'pre-1', subscription_status: 'CANCELLED' },
                AHORA
            )
        ).toBe(false);
    });

    it('relee siempre si está esperando el pago', () => {
        // Es el caso que justifica todo esto: el profesional vuelve del checkout
        // y sin el webhook se quedaría en PENDING para siempre.
        expect(
            shouldResync(
                {
                    mp_preapproval_id: 'pre-1',
                    subscription_status: 'PENDING',
                    subscription_synced_at: haceMinutos(0),
                },
                AHORA
            )
        ).toBe(true);
    });

    it('con una suscripción activa recién sincronizada, no vuelve a preguntar', () => {
        expect(
            shouldResync(
                {
                    mp_preapproval_id: 'pre-1',
                    subscription_status: 'AUTHORIZED',
                    subscription_synced_at: haceMinutos(5),
                },
                AHORA
            )
        ).toBe(false);
    });

    it('con una suscripción activa vieja, vuelve a preguntar', () => {
        expect(
            shouldResync(
                {
                    mp_preapproval_id: 'pre-1',
                    subscription_status: 'AUTHORIZED',
                    subscription_synced_at: haceMinutos(90),
                },
                AHORA
            )
        ).toBe(true);
    });

    it('si nunca se sincronizó, pregunta', () => {
        expect(
            shouldResync(
                {
                    mp_preapproval_id: 'pre-1',
                    subscription_status: 'AUTHORIZED',
                    subscription_synced_at: null,
                },
                AHORA
            )
        ).toBe(true);
    });
});

describe('getMySubscriptionService', () => {
    const guardada = (overrides = {}) => ({
        plan: 'INDIVIDUAL',
        subscription_status: 'PENDING',
        subscription_next_payment: null,
        mp_preapproval_id: 'pre-1',
        subscription_synced_at: null,
        ...overrides,
    });

    it('resincroniza con MP cuando está esperando el pago y devuelve el estado nuevo', async () => {
        prisma.user.findUnique
            // lectura inicial
            .mockResolvedValueOnce(guardada())
            // búsqueda de usuario dentro de syncSubscriptionService
            .mockResolvedValueOnce({ id: USER_ID })
            // relectura final, ya actualizada
            .mockResolvedValueOnce({
                plan: 'EQUIPO',
                subscription_status: 'AUTHORIZED',
                subscription_next_payment: null,
                mp_preapproval_id: 'pre-1',
            });

        getPreapproval.mockResolvedValue({
            id: 'pre-1',
            status: 'authorized',
            external_reference: `${USER_ID}:EQUIPO`,
        });

        const result = await getMySubscriptionService(USER_ID);

        expect(getPreapproval).toHaveBeenCalledWith('pre-1');
        expect(result.subscription_status).toBe('AUTHORIZED');
    });

    it('no llama a MP si no hay nada que resincronizar', async () => {
        prisma.user.findUnique.mockResolvedValue(
            guardada({ subscription_status: 'NONE', mp_preapproval_id: null })
        );

        await getMySubscriptionService(USER_ID);

        expect(getPreapproval).not.toHaveBeenCalled();
    });

    it('no llama a MP si Mercado Pago no está configurado', async () => {
        isConfigured.mockReturnValue(false);
        prisma.user.findUnique.mockResolvedValue(guardada());

        const result = await getMySubscriptionService(USER_ID);

        expect(getPreapproval).not.toHaveBeenCalled();
        expect(result.subscription_status).toBe('PENDING');
    });

    it('si MP está caído devuelve lo guardado en vez de romper la pantalla', async () => {
        prisma.user.findUnique.mockResolvedValue(guardada());
        getPreapproval.mockRejectedValue(new Error('MP caído'));

        const result = await getMySubscriptionService(USER_ID);

        expect(result.subscription_status).toBe('PENDING');
        expect(result.plan).toBe('INDIVIDUAL');
    });

    it('no filtra subscription_synced_at al front', async () => {
        isConfigured.mockReturnValue(false);
        prisma.user.findUnique.mockResolvedValue(guardada({ subscription_synced_at: new Date() }));

        const result = await getMySubscriptionService(USER_ID);

        expect(result).not.toHaveProperty('subscription_synced_at');
    });

    it('devuelve null si el usuario no existe', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        expect(await getMySubscriptionService(USER_ID)).toBeNull();
    });
});

describe('handleWebhookService', () => {
    it('con subscription_preapproval sincroniza usando el id que llega', async () => {
        getPreapproval.mockResolvedValue({
            id: 'pre-1',
            status: 'authorized',
            external_reference: `${USER_ID}:EQUIPO`,
        });
        prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

        await handleWebhookService({ type: 'subscription_preapproval', dataId: 'pre-1' });

        expect(getPreapproval).toHaveBeenCalledWith('pre-1');
    });

    it('con subscription_authorized_payment primero resuelve a qué suscripción pertenece', async () => {
        getAuthorizedPayment.mockResolvedValue({ id: 'cuota-9', preapproval_id: 'pre-1' });
        getPreapproval.mockResolvedValue({
            id: 'pre-1',
            status: 'authorized',
            external_reference: `${USER_ID}:EQUIPO`,
        });
        prisma.user.findUnique.mockResolvedValue({ id: USER_ID });

        await handleWebhookService({ type: 'subscription_authorized_payment', dataId: 'cuota-9' });

        expect(getAuthorizedPayment).toHaveBeenCalledWith('cuota-9');
        expect(getPreapproval).toHaveBeenCalledWith('pre-1');
    });

    it('ignora los tipos que no son de suscripciones', async () => {
        const result = await handleWebhookService({ type: 'payment', dataId: '123' });

        expect(result.ignored).toBe(true);
        expect(getPreapproval).not.toHaveBeenCalled();
    });

    it('ignora una notificación sin data.id', async () => {
        const result = await handleWebhookService({ type: 'subscription_preapproval' });

        expect(result.ignored).toBe(true);
        expect(getPreapproval).not.toHaveBeenCalled();
    });
});

describe('cancelSubscriptionService', () => {
    it('cancela en MP y deja el estado local en CANCELLED', async () => {
        prisma.user.findUnique.mockResolvedValue({
            mp_preapproval_id: 'pre-1',
            subscription_status: 'AUTHORIZED',
        });
        prisma.user.update.mockResolvedValue({ subscription_status: 'CANCELLED' });

        await cancelSubscriptionService(USER_ID);

        expect(cancelPreapproval).toHaveBeenCalledWith('pre-1');
        expect(prisma.user.update.mock.calls[0][0].data).toEqual({
            subscription_status: 'CANCELLED',
            subscription_next_payment: null,
        });
    });

    it('404 si nunca hubo suscripción', async () => {
        prisma.user.findUnique.mockResolvedValue({
            mp_preapproval_id: null,
            subscription_status: 'NONE',
        });

        await expect(cancelSubscriptionService(USER_ID)).rejects.toMatchObject({ status: 404 });
        expect(cancelPreapproval).not.toHaveBeenCalled();
    });

    it('409 si ya estaba cancelada', async () => {
        prisma.user.findUnique.mockResolvedValue({
            mp_preapproval_id: 'pre-1',
            subscription_status: 'CANCELLED',
        });

        await expect(cancelSubscriptionService(USER_ID)).rejects.toMatchObject({ status: 409 });
        expect(cancelPreapproval).not.toHaveBeenCalled();
    });

    it('no toca la base si MP falla al cancelar', async () => {
        prisma.user.findUnique.mockResolvedValue({
            mp_preapproval_id: 'pre-1',
            subscription_status: 'AUTHORIZED',
        });
        cancelPreapproval.mockRejectedValue(new Error('MP caído'));

        await expect(cancelSubscriptionService(USER_ID)).rejects.toThrow('MP caído');
        // Si se marcara CANCELLED igual, la suscripción seguiría cobrando en MP
        // mientras la app la muestra como cancelada.
        expect(prisma.user.update).not.toHaveBeenCalled();
    });
});
