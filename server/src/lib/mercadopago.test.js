import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    verifyWebhookSignature,
    mapPreapprovalStatus,
    createPreapproval,
    cancelPreapproval,
    MercadoPagoError,
} from './mercadopago.js';

// Firmas calculadas aparte (node -e con crypto) sobre el manifest EXACTO que
// pide la documentación de Mercado Pago. Están hardcodeadas y no generadas con
// el mismo helper que valida: si se generaran acá, el test pasaría igual aunque
// el formato del manifest cambiara, que es justo lo que hay que fijar.
//
//   id:abc123;request-id:req-1;ts:1704908010;   con secreto "test-secret"
const SECRET = 'test-secret';
const FIRMA_COMPLETA = '28f6e07632cc836ec9d13c83c7e8cd6b718ee46eb5eb90547effbbd0a6fe5503';
const FIRMA_SIN_REQUEST_ID = 'cfd562d2d9f3c90d1ed117783a26efe777e0aa6e2e35041a6865dd2f4e97312b';
const FIRMA_SIN_DATA_ID = '5d1cfaa96d0c7f73032bc78956d7b21e29be6ddafc66da624d8d5267e5ac4117';
const FIRMA_MAYUSCULAS = 'e364d2bd8540cb1f49f8da7adef23216e42efcdf61bf1318601b5052b66583df';

describe('verifyWebhookSignature', () => {
    it('acepta una firma válida', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${FIRMA_COMPLETA}`,
            requestId: 'req-1',
            dataId: 'abc123',
            secret: SECRET,
        });

        expect(result.valid).toBe(true);
    });

    it('rechaza una firma que no corresponde', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${'0'.repeat(64)}`,
            requestId: 'req-1',
            dataId: 'abc123',
            secret: SECRET,
        });

        expect(result.valid).toBe(false);
    });

    it('rechaza si cambia el data.id aunque la firma esté bien formada', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${FIRMA_COMPLETA}`,
            requestId: 'req-1',
            dataId: 'otro-id',
            secret: SECRET,
        });

        expect(result.valid).toBe(false);
    });

    it('rechaza si cambia el ts (no se puede reusar la firma con otro timestamp)', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908011,v1=${FIRMA_COMPLETA}`,
            requestId: 'req-1',
            dataId: 'abc123',
            secret: SECRET,
        });

        expect(result.valid).toBe(false);
    });

    it('saca del manifest los valores que no vinieron: sin x-request-id', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${FIRMA_SIN_REQUEST_ID}`,
            requestId: undefined,
            dataId: 'abc123',
            secret: SECRET,
        });

        expect(result.valid).toBe(true);
    });

    it('saca del manifest los valores que no vinieron: sin data.id', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${FIRMA_SIN_DATA_ID}`,
            requestId: 'req-1',
            dataId: undefined,
            secret: SECRET,
        });

        expect(result.valid).toBe(true);
    });

    it('pasa el data.id a minúsculas, como pide la documentación', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${FIRMA_MAYUSCULAS}`,
            requestId: 'req-1',
            dataId: 'ORD01JQ4S',
            secret: SECRET,
        });

        expect(result.valid).toBe(true);
    });

    it('rechaza si no hay secreto configurado', () => {
        const result = verifyWebhookSignature({
            signatureHeader: `ts=1704908010,v1=${FIRMA_COMPLETA}`,
            requestId: 'req-1',
            dataId: 'abc123',
            secret: null,
        });

        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/MP_WEBHOOK_SECRET/);
    });

    it('rechaza si falta el header', () => {
        const result = verifyWebhookSignature({ dataId: 'abc123', secret: SECRET });

        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/x-signature/);
    });

    it.each(['', 'cualquier cosa', 'ts=1704908010', `v1=${FIRMA_COMPLETA}`, 'ts=,v1='])(
        'rechaza un header mal formado (%j) sin explotar',
        (header) => {
            const result = verifyWebhookSignature({
                signatureHeader: header,
                requestId: 'req-1',
                dataId: 'abc123',
                secret: SECRET,
            });

            expect(result.valid).toBe(false);
        }
    );

    it('no explota cuando la firma recibida tiene otro largo', () => {
        // timingSafeEqual tira si los buffers no miden lo mismo: sin el chequeo
        // de largo, un webhook con la firma cortada tumbaba el handler.
        const result = verifyWebhookSignature({
            signatureHeader: 'ts=1704908010,v1=abc',
            requestId: 'req-1',
            dataId: 'abc123',
            secret: SECRET,
        });

        expect(result.valid).toBe(false);
    });
});

describe('mapPreapprovalStatus', () => {
    it.each([
        ['pending', 'PENDING'],
        ['authorized', 'AUTHORIZED'],
        ['paused', 'PAUSED'],
        // MP escribe el cancelado con una sola L; se aceptan las dos por las
        // dudas de que cambie.
        ['canceled', 'CANCELLED'],
        ['cancelled', 'CANCELLED'],
    ])('traduce %s a %s', (mpStatus, expected) => {
        expect(mapPreapprovalStatus(mpStatus)).toBe(expected);
    });

    it('devuelve null ante un estado que no conoce', () => {
        expect(mapPreapprovalStatus('algo_nuevo')).toBeNull();
        expect(mapPreapprovalStatus(undefined)).toBeNull();
    });
});

describe('llamadas a la API', () => {
    beforeEach(() => {
        process.env.MP_ACCESS_TOKEN = 'TEST-token';
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        delete process.env.MP_ACCESS_TOKEN;
        vi.restoreAllMocks();
    });

    const okResponse = (body) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
    });

    it('crea el preapproval con el body que espera Mercado Pago', async () => {
        globalThis.fetch.mockResolvedValue(okResponse({ id: 'pre-1', init_point: 'https://mp/x' }));

        await createPreapproval({
            reason: 'Turnos — Plan Equipo',
            externalReference: 'user-1:EQUIPO',
            payerEmail: 'pro@test.com',
            backUrl: 'https://app.test/panel/suscripcion',
            amount: 24999,
            idempotencyKey: 'sub-user-1-EQUIPO',
        });

        const [url, options] = globalThis.fetch.mock.calls[0];
        expect(url).toBe('https://api.mercadopago.com/preapproval');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer TEST-token');
        expect(options.headers['X-Idempotency-Key']).toBe('sub-user-1-EQUIPO');

        expect(JSON.parse(options.body)).toEqual({
            reason: 'Turnos — Plan Equipo',
            external_reference: 'user-1:EQUIPO',
            payer_email: 'pro@test.com',
            back_url: 'https://app.test/panel/suscripcion',
            auto_recurring: {
                frequency: 1,
                frequency_type: 'months',
                transaction_amount: 24999,
                currency_id: 'ARS',
            },
            // Pendiente y no autorizada: la tarjeta la carga el profesional en
            // el checkout de MP, nosotros nunca la vemos.
            status: 'pending',
        });
    });

    it('cancela mandando el status que usa MP', async () => {
        globalThis.fetch.mockResolvedValue(okResponse({ id: 'pre-1', status: 'canceled' }));

        await cancelPreapproval('pre-1');

        const [url, options] = globalThis.fetch.mock.calls[0];
        expect(url).toBe('https://api.mercadopago.com/preapproval/pre-1');
        expect(options.method).toBe('PUT');
        expect(JSON.parse(options.body)).toEqual({ status: 'canceled' });
    });

    it('convierte un error de MP en MercadoPagoError con el status', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ message: 'invalid payer_email' }),
        });

        await expect(cancelPreapproval('pre-1')).rejects.toBeInstanceOf(MercadoPagoError);
    });

    it('falla claro si no hay token configurado', async () => {
        delete process.env.MP_ACCESS_TOKEN;

        await expect(cancelPreapproval('pre-1')).rejects.toThrow(/MP_ACCESS_TOKEN/);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
