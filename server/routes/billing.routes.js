import express from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import {
    getMySubscription,
    subscribe,
    cancelSubscription,
    webhook,
} from '../controllers/billing.controller.js';

const router = express.Router();

// El webhook va ANTES del requireAuth y fuera del router.use: lo llama Mercado
// Pago, que obviamente no tiene un JWT nuestro. Lo que lo protege es la firma
// que se valida en el controller.
router.post('/webhook', webhook);

// El resto es del profesional logueado. Un cliente (role USER) no paga nada.
router.use(requireAuth, requireRole('PROFESSIONAL'));

router.get('/subscription', getMySubscription);
router.post('/subscribe', subscribe);
router.post('/cancel', cancelSubscription);

export { router as billingRouter };
