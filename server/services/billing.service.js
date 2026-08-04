import { prisma } from '../src/lib/prisma.js';
import { getPlan } from '../src/lib/plans.js';
import {
    isConfigured,
    createPreapproval,
    getPreapproval,
    getAuthorizedPayment,
    cancelPreapproval,
    mapPreapprovalStatus,
} from '../src/lib/mercadopago.js';

// Lo único que el front necesita saber de la suscripción. El id de MP va porque
// sirve para soporte ("pasame el id de la suscripción"), no tiene nada secreto.
const subscriptionSelect = {
    plan: true,
    subscription_status: true,
    subscription_next_payment: true,
    mp_preapproval_id: true,
};

const httpError = (message, status) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

// El `external_reference` que le mandamos a MP y que MP nos devuelve en cada
// notificación. Lleva el plan además del usuario porque el plan NO se guarda al
// crear la suscripción: si lo guardáramos ahí, cualquiera se cambiaría al plan
// más caro creando una suscripción y no pagándola nunca. El plan recién se
// aplica cuando MP confirma que hay medio de pago (AUTHORIZED), y para saber
// cuál era hay que recordarlo en algún lado: este es ese lado.
const buildExternalReference = (userId, planId) => `${userId}:${planId}`;

const parseExternalReference = (externalReference) => {
    const [userId, planId] = String(externalReference || '').split(':');
    return {
        userId: userId || null,
        planId: getPlan(planId) ? planId : null,
    };
};

// Cada cuánto vale la pena volver a preguntarle a MP por una suscripción que ya
// está resuelta. Una hora es de sobra: los cambios normales (pausa, baja, tarjeta
// que rebota) llegan por webhook, y esto es la red por si alguno se pierde.
const SYNC_TTL_MS = 60 * 60 * 1000;

// El webhook es la vía principal para enterarse de los cambios, pero no es
// infalible: puede no estar configurado todavía, puede perderse, o MP puede
// dejar de reintentar. Sin esto, un profesional que pagó se queda en PENDING
// para siempre y no hay forma de salir de ese estado desde la app.
const shouldResync = (user, now = Date.now()) => {
    if (!user?.mp_preapproval_id) return false;

    // Cancelada es terminal del lado de MP ("irreversible state"): no hay nada
    // que releer, y releerlo sería una llamada por cada carga de página.
    if (user.subscription_status === 'CANCELLED') return false;

    // Esperando el pago es transitorio, y encima el profesional está mirando la
    // pantalla justo en ese momento (vuelve del checkout): acá sí se relee
    // siempre, que es el caso que hace que todo esto valga la pena.
    if (user.subscription_status === 'PENDING') return true;

    if (!user.subscription_synced_at) return true;
    return now - new Date(user.subscription_synced_at).getTime() > SYNC_TTL_MS;
};

const getMySubscriptionService = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ...subscriptionSelect, subscription_synced_at: true },
    });

    if (!user) return null;

    // eslint-disable-next-line no-unused-vars -- se saca del objeto que sale al front
    const { subscription_synced_at, ...subscription } = user;

    if (!isConfigured() || !shouldResync(user)) return subscription;

    try {
        await syncSubscriptionService(user.mp_preapproval_id);
    } catch (error) {
        // Que MP esté caído no puede romper la pantalla de Cuenta: se devuelve
        // lo último que sabemos, que es exactamente lo que se mostraba antes de
        // que existiera la resincronización.
        console.warn('[billing] no se pudo resincronizar con Mercado Pago:', error.message);
        return subscription;
    }

    return prisma.user.findUnique({
        where: { id: userId },
        select: subscriptionSelect,
    });
};

// Arranca la suscripción: crea el preapproval en MP y devuelve el `init_point`,
// que es la URL del checkout de MP donde el profesional carga la tarjeta.
// Todavía no cobramos nada ni le cambiamos el plan: eso pasa cuando vuelve el
// webhook diciendo que quedó autorizada.
const startSubscriptionService = async (userId, planId) => {
    if (!isConfigured()) {
        throw httpError('Los pagos todavía no están habilitados', 503);
    }

    const plan = getPlan(planId);
    if (!plan) {
        throw httpError('Ese plan no existe', 400);
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, subscription_status: true, mp_preapproval_id: true },
    });

    if (!user) {
        throw httpError('Usuario no encontrado', 404);
    }

    // Con una suscripción viva, crear otra dejaría dos débitos mensuales
    // corriendo contra la misma cuenta. Cambiar de plan es cancelar y volver a
    // suscribirse, que es como lo modela MP (el monto de un preapproval no se
    // edita desde acá).
    if (['AUTHORIZED', 'PAUSED'].includes(user.subscription_status)) {
        throw httpError(
            'Ya tenés una suscripción activa. Cancelala antes de contratar otro plan.',
            409
        );
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const preapproval = await createPreapproval({
        reason: `Turnos — Plan ${plan.name}`,
        externalReference: buildExternalReference(userId, plan.id),
        payerEmail: user.email,
        backUrl: `${appUrl}/panel/suscripcion`,
        amount: plan.price,
        // Si el pedido se reintenta (timeout, doble click), MP devuelve la
        // suscripción que ya creó en vez de crear una segunda.
        idempotencyKey: `sub-${userId}-${plan.id}`,
    });

    if (!preapproval?.init_point || !preapproval?.id) {
        throw httpError('Mercado Pago no devolvió el link de pago', 502);
    }

    await prisma.user.update({
        where: { id: userId },
        data: {
            mp_preapproval_id: preapproval.id,
            subscription_status: mapPreapprovalStatus(preapproval.status) || 'PENDING',
        },
    });

    return { init_point: preapproval.init_point, preapproval_id: preapproval.id };
};

// Relee la suscripción desde MP y deja la base igual a lo que dice MP. Es el
// corazón del webhook y es idempotente a propósito: MP manda la misma
// notificación más de una vez y reintenta las que fallan, así que correr esto
// dos veces tiene que dar el mismo resultado que correrlo una.
const syncSubscriptionService = async (preapprovalId) => {
    const preapproval = await getPreapproval(preapprovalId);

    const status = mapPreapprovalStatus(preapproval?.status);
    if (!status) {
        // Un estado que MP agregue en el futuro: mejor no tocar nada que
        // adivinar mal y dejar a alguien sin acceso.
        return { ignored: true, reason: `estado desconocido: ${preapproval?.status}` };
    }

    const { userId, planId } = parseExternalReference(preapproval.external_reference);

    // Se busca primero por el id de MP (lo guardamos al crear la suscripción) y
    // recién después por el external_reference. El segundo camino cubre el caso
    // en que la suscripción se creó pero el update local no llegó a grabarse.
    const user =
        (await prisma.user.findUnique({
            where: { mp_preapproval_id: preapproval.id },
            select: { id: true },
        })) ||
        (userId
            ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
            : null);

    if (!user) {
        // Puede pasar legítimamente: una suscripción creada desde otro entorno
        // (las credenciales de prueba y las de producción comparten webhook si
        // se configuran igual) o una cuenta borrada. No es un error nuestro.
        return { ignored: true, reason: 'no hay usuario para esa suscripción' };
    }

    const data = {
        mp_preapproval_id: preapproval.id,
        subscription_status: status,
        subscription_next_payment: preapproval.next_payment_date
            ? new Date(preapproval.next_payment_date)
            : null,
        // Marca de cuándo se leyó esto desde MP. La usa shouldResync para no
        // preguntar de nuevo en la siguiente carga de página.
        subscription_synced_at: new Date(),
    };

    // El plan se aplica solo cuando hay medio de pago válido. Al cancelar no se
    // vuelve atrás a propósito: el permiso lo da subscription_status, y
    // degradarle el plan además borraría el dato de qué tenía contratado.
    if (status === 'AUTHORIZED' && planId) {
        data.plan = planId;
    }

    await prisma.user.update({ where: { id: user.id }, data });

    return { updated: true, user_id: user.id, status };
};

// Traduce la notificación de MP a "qué suscripción hay que releer". El webhook
// no trae el estado nuevo: trae un id, y el estado se pide.
const handleWebhookService = async ({ type, dataId }) => {
    if (!dataId) {
        return { ignored: true, reason: 'la notificación no trae data.id' };
    }

    switch (type) {
        // Alta o cambio de estado de la suscripción: el id ES el del preapproval.
        case 'subscription_preapproval':
            return syncSubscriptionService(dataId);

        // Cada cuota mensual. El id es el de la cuota, así que primero hay que
        // preguntarle a MP de qué suscripción es. Sirve para enterarse cuando
        // una tarjeta empieza a rebotar.
        case 'subscription_authorized_payment': {
            const authorizedPayment = await getAuthorizedPayment(dataId);
            if (!authorizedPayment?.preapproval_id) {
                return { ignored: true, reason: 'la cuota no referencia una suscripción' };
            }
            return syncSubscriptionService(authorizedPayment.preapproval_id);
        }

        default:
            // MP manda varios tipos por la misma URL (pagos sueltos, planes).
            // Los que no son de suscripciones no nos interesan.
            return { ignored: true, reason: `tipo no manejado: ${type}` };
    }
};

const cancelSubscriptionService = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mp_preapproval_id: true, subscription_status: true },
    });

    if (!user?.mp_preapproval_id || user.subscription_status === 'NONE') {
        throw httpError('No tenés ninguna suscripción para cancelar', 404);
    }

    if (user.subscription_status === 'CANCELLED') {
        throw httpError('Esa suscripción ya está cancelada', 409);
    }

    await cancelPreapproval(user.mp_preapproval_id);

    // No se espera al webhook para reflejarlo: el profesional acaba de apretar
    // el botón y tiene que ver el cambio ahora. Cuando llegue la notificación
    // va a escribir lo mismo.
    return prisma.user.update({
        where: { id: userId },
        data: { subscription_status: 'CANCELLED', subscription_next_payment: null },
        select: subscriptionSelect,
    });
};

export {
    shouldResync,
    getMySubscriptionService,
    startSubscriptionService,
    syncSubscriptionService,
    handleWebhookService,
    cancelSubscriptionService,
    buildExternalReference,
    parseExternalReference,
};
