import crypto from 'node:crypto';

// Cliente mínimo de la API de suscripciones de Mercado Pago (preapproval).
//
// Va con `fetch` y sin el SDK oficial a propósito: son tres endpoints, Node 20+
// ya trae fetch global, y el SDK agrega una dependencia más que mantener y
// auditar para no ahorrar casi nada.
//
// Modelo elegido: suscripción SIN plan asociado y con pago pendiente
// (`status: "pending"`). MP devuelve un `init_point`, mandamos al profesional
// ahí y la tarjeta la carga en el checkout de ellos. Nosotros nunca vemos los
// datos de la tarjeta, que es justo lo que no queremos tocar (PCI).
const API_BASE = 'https://api.mercadopago.com';

const getAccessToken = () => process.env.MP_ACCESS_TOKEN || null;
const getWebhookSecret = () => process.env.MP_WEBHOOK_SECRET || null;

// Sin token no hay integración posible. No se valida al arrancar (a diferencia
// de JWT_SECRET) porque el resto de la app funciona igual sin cobros: lo que
// tiene que fallar con un mensaje claro es el intento de suscribirse, no el
// server entero.
const isConfigured = () => Boolean(getAccessToken());

class MercadoPagoError extends Error {
    constructor(message, { status, body } = {}) {
        super(message);
        this.name = 'MercadoPagoError';
        this.status = status;
        this.body = body;
    }
}

async function mpRequest(path, { method = 'GET', body, idempotencyKey } = {}) {
    const token = getAccessToken();
    if (!token) {
        throw new MercadoPagoError('MP_ACCESS_TOKEN no está configurada');
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                // MP la usa para no duplicar la suscripción si el pedido se
                // reintenta (timeout de red, doble click que llega dos veces).
                ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    } catch (error) {
        // MP caído o sin red: distinto de "MP contestó que no".
        throw new MercadoPagoError(`No se pudo contactar a Mercado Pago: ${error.message}`);
    }

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // MP contestó algo que no es JSON (una página de error, un proxy).
        data = null;
    }

    if (!response.ok) {
        // El mensaje de MP sirve para el log, no para el cliente: puede traer
        // detalles de la cuenta o del token. Quien llama decide qué mostrar.
        const detail = data?.message || data?.error || text?.slice(0, 200) || 'sin detalle';
        throw new MercadoPagoError(`Mercado Pago respondió ${response.status}: ${detail}`, {
            status: response.status,
            body: data,
        });
    }

    return data;
}

// Crea la suscripción y devuelve, entre otras cosas, `id` e `init_point`.
// `externalReference` es nuestro id de usuario: es lo que permite reconciliar
// si algún día llega un webhook de una suscripción que no tenemos guardada.
async function createPreapproval({
    reason,
    externalReference,
    payerEmail,
    backUrl,
    amount,
    currencyId = 'ARS',
    idempotencyKey,
}) {
    return mpRequest('/preapproval', {
        method: 'POST',
        idempotencyKey,
        body: {
            reason,
            external_reference: externalReference,
            payer_email: payerEmail,
            back_url: backUrl,
            auto_recurring: {
                frequency: 1,
                frequency_type: 'months',
                transaction_amount: amount,
                currency_id: currencyId,
            },
            status: 'pending',
        },
    });
}

const getPreapproval = (preapprovalId) =>
    mpRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`);

// Una cuota concreta de una suscripción. El webhook
// `subscription_authorized_payment` avisa por cada cobro mensual, pero el id
// que manda es el de la cuota, no el de la suscripción: hay que pedir esto para
// saber a qué preapproval pertenece.
const getAuthorizedPayment = (authorizedPaymentId) =>
    mpRequest(`/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);

// Ojo con la escritura: MP usa `canceled`, con una sola L (verificado en las
// referencias de update-preapproval y search-preapproval). Es irreversible: una
// suscripción cancelada no se reactiva, hay que crear una nueva.
const cancelPreapproval = (preapprovalId) =>
    mpRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
        method: 'PUT',
        body: { status: 'canceled' },
    });

// Traduce el estado de MP al enum SubscriptionStatus de la base. Acepta las dos
// escrituras de "cancelado" porque MP no fue consistente históricamente y no
// quiero que un cambio de una letra nos deje mostrando la suscripción como
// activa cuando ya no lo está.
function mapPreapprovalStatus(mpStatus) {
    switch (mpStatus) {
        case 'pending':
            return 'PENDING';
        case 'authorized':
            return 'AUTHORIZED';
        case 'paused':
            return 'PAUSED';
        case 'canceled':
        case 'cancelled':
            return 'CANCELLED';
        default:
            return null;
    }
}

// Valida la firma que MP manda en cada webhook. Sin esto, la URL del webhook es
// pública y cualquiera puede activarle el plan NEGOCIO a quien quiera con un
// POST.
//
// El manifest es, textual de la documentación:
//   id:[data.id];request-id:[x-request-id];ts:[ts];
// y si alguno de esos valores no vino en la notificación, se saca del manifest
// en vez de mandarlo vacío.
//
// No se valida qué tan viejo es el `ts` a propósito: MP reintenta las
// notificaciones que fallan, y una ventana de tiempo rechazaría esos reintentos
// legítimos. El replay no hace daño porque el handler es idempotente (relee el
// estado desde MP y lo vuelve a escribir igual).
function verifyWebhookSignature({ signatureHeader, requestId, dataId, secret = getWebhookSecret() }) {
    if (!secret) return { valid: false, reason: 'MP_WEBHOOK_SECRET no está configurada' };
    if (!signatureHeader) return { valid: false, reason: 'falta el header x-signature' };

    // Formato: "ts=1704908010,v1=abc123..."
    const parts = String(signatureHeader).split(',');
    let ts = null;
    let v1 = null;
    for (const part of parts) {
        const [rawKey, ...rest] = part.split('=');
        const key = rawKey?.trim();
        const value = rest.join('=').trim();
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
    }

    if (!ts || !v1) return { valid: false, reason: 'x-signature mal formado' };

    const manifest = [
        // La documentación pide pasarlo a minúsculas si viene con mayúsculas.
        dataId ? `id:${String(dataId).toLowerCase()};` : '',
        requestId ? `request-id:${requestId};` : '',
        `ts:${ts};`,
    ].join('');

    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    // Comparación de tiempo constante: con `===` se puede sacar la firma byte a
    // byte midiendo cuánto tarda en fallar.
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(v1, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length) {
        return { valid: false, reason: 'firma inválida' };
    }
    if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
        return { valid: false, reason: 'firma inválida' };
    }

    return { valid: true };
}

export {
    MercadoPagoError,
    isConfigured,
    createPreapproval,
    getPreapproval,
    getAuthorizedPayment,
    cancelPreapproval,
    mapPreapprovalStatus,
    verifyWebhookSignature,
};
