import { validateSubscribe } from '../schemas/billing.js';
import { verifyWebhookSignature } from '../src/lib/mercadopago.js';
import {
    getMySubscriptionService,
    startSubscriptionService,
    handleWebhookService,
    cancelSubscriptionService,
} from '../services/billing.service.js';

const getMySubscription = async (req, res) => {
    try {
        const subscription = await getMySubscriptionService(req.user.sub);
        res.status(200).json({ subscription });
    } catch {
        res.status(500).json({ message: 'Error al obtener la suscripción' });
    }
};

const subscribe = async (req, res) => {
    const validation = validateSubscribe(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }

    try {
        const result = await startSubscriptionService(req.user.sub, validation.data.plan);
        res.status(201).json(result);
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        // Un error de la API de MP puede traer detalles de la cuenta o del
        // token: se loguea entero y al cliente le va un mensaje genérico.
        console.error('[billing] error al crear la suscripción', error);
        res.status(502).json({ message: 'No se pudo iniciar la suscripción con Mercado Pago' });
    }
};

const cancelSubscription = async (req, res) => {
    try {
        const subscription = await cancelSubscriptionService(req.user.sub);
        res.status(200).json({ subscription });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('[billing] error al cancelar la suscripción', error);
        res.status(502).json({ message: 'No se pudo cancelar la suscripción en Mercado Pago' });
    }
};

// Webhook de Mercado Pago. Es público (MP no manda nuestro JWT), así que lo
// único que separa una notificación real de una inventada es la firma.
const webhook = async (req, res) => {
    // La firma se calcula con el data.id que viene en el QUERY STRING, no con
    // el del body: así lo define la documentación de MP. Para procesar sirve
    // cualquiera de los dos, pero para validar solo vale el de la URL.
    const queryDataId = req.query['data.id'];

    const { valid, reason } = verifyWebhookSignature({
        signatureHeader: req.headers['x-signature'],
        requestId: req.headers['x-request-id'],
        dataId: queryDataId,
    });

    if (!valid) {
        console.warn(`[billing] webhook rechazado: ${reason}`);
        // 401 y no 400: es un problema de autenticidad. MP no reintenta por
        // esto, y está bien, porque una notificación falsa no queremos que
        // vuelva.
        return res.status(401).json({ message: 'Firma inválida' });
    }

    const type = req.query.type || req.body?.type;
    const dataId = queryDataId || req.body?.data?.id;

    try {
        const result = await handleWebhookService({ type, dataId });
        // Siempre 200 cuando la firma era válida y no se rompió nada: para MP,
        // "ignorado" también es procesado. Si devolviéramos otra cosa,
        // reintentaría para siempre una notificación que nunca nos va a
        // interesar.
        res.status(200).json({ received: true, ...result });
    } catch (error) {
        // Acá sí conviene fallar: si MP no contestó o la base estaba caída,
        // el 500 hace que MP lo reintente más tarde.
        console.error('[billing] error procesando el webhook', error);
        res.status(500).json({ message: 'Error procesando la notificación' });
    }
};

export { getMySubscription, subscribe, cancelSubscription, webhook };
