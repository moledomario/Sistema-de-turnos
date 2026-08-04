import express from 'express';
import { requireAuth, requireRole, optionalAuth } from '../middlewares/auth.middleware.js';
import {
    createAppointment,
    getAppointments,
    getMyAppointments,
    cancelAppointment,
    rescheduleAppointment,
} from '../controllers/appointments.controller.js';

const router = express.Router();

router.post('/', optionalAuth, createAppointment);

// Devuelve TODOS los turnos de TODOS los profesionales, con los datos de
// contacto de cada cliente. No lo consume la app: es una herramienta interna, y
// por eso queda restringida a ADMIN. Cada uno ve los suyos por /appointments/me
// (cliente) o /panel/appointments (profesional).
router.get('/', requireAuth, requireRole('ADMIN'), getAppointments);

router.get('/me', requireAuth, getMyAppointments);
router.patch('/:id/cancel', requireAuth, cancelAppointment);
router.patch('/:id/reschedule', requireAuth, rescheduleAppointment);

export { router as appointmentsRouter };
