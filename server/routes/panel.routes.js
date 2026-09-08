import express from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import {
    getMyAvailability,
    createAvailability,
    replaceAvailabilityDay,
    deleteAvailability,
    getMyBookings,
    createBooking,
    cancelBooking,
    setAttendance,
    rescheduleBooking,
    getPendingRequests,
    acceptRequest,
    rejectRequest,
    acceptAllRequests,
    getMySettings,
    updateMySettings,
    changeMyPassword,
    getMyAccount,
    updateMyAccount,
    completeOnboarding,
    getMyTeam,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    getServiceCatalog,
    getMyServices,
    createMyService,
    updateMyService,
    deleteMyService,
} from '../controllers/panel.controller.js';

const router = express.Router();

router.use(requireAuth, requireRole('PROFESSIONAL'));

// `requireActiveSubscription` va ruta por ruta y no con un router.use por
// método, porque la línea que separa lo bloqueado de lo abierto es semántica,
// no mecánica: hay escrituras que tienen que seguir funcionando con la cuenta
// vencida. El criterio completo está en el middleware. Al agregar una ruta
// nueva, decidí en cuál de los dos grupos cae.

router.get('/availability', getMyAvailability);
router.post('/availability', createAvailability);
router.put('/availability/day', replaceAvailabilityDay);
router.delete('/availability/:id', deleteAvailability);

router.get('/appointments', getMyBookings);
// Anotar un turno a mano es tomar trabajo nuevo: se bloquea.
router.post('/appointments', createBooking);
// Las tres de abajo son sobre turnos que YA existen. Quedan abiertas: si la
// prueba vence con la agenda llena, el profesional tiene que poder avisar y
// acomodar, y el cliente que ya reservó no tiene por qué quedarse colgado.
router.patch('/appointments/:id/cancel', cancelBooking);
// Marcar si el cliente vino (COMPLETED) o no (NO_SHOW).
router.patch('/appointments/:id/attendance', setAttendance);
router.patch('/appointments/:id/reschedule', rescheduleBooking);

// Las solicitudes pendientes entraron antes del vencimiento y hay alguien
// esperando una respuesta del otro lado: aceptar y rechazar quedan abiertas.
router.get('/requests', getPendingRequests);
router.post('/requests/accept-all', acceptAllRequests);
router.patch('/requests/:id/accept', acceptRequest);
router.patch('/requests/:id/reject', rejectRequest);

router.get('/settings', getMySettings);
router.patch('/settings', updateMySettings);
// Cambiar la contraseña nunca se cobra: es higiene de seguridad, no una
// función del producto.
router.patch('/settings/password', changeMyPassword);

router.get('/account', getMyAccount);
router.patch('/account', updateMyAccount);
// Abierta a propósito: el front manda al onboarding mientras esté sin
// completar, así que bloquear esto dejaría a la cuenta dando vueltas sin poder
// llegar nunca a la pantalla de suscripción.
router.post('/onboarding/complete', completeOnboarding);

router.get('/team', getMyTeam);
router.post('/team', createTeamMember);
router.patch('/team/:id', updateTeamMember);
router.delete('/team/:id', deleteTeamMember);

router.get('/services/catalog', getServiceCatalog);
router.get('/services', getMyServices);
router.post('/services', createMyService);
router.patch('/services/:id', updateMyService);
router.delete('/services/:id', deleteMyService);

export { router as panelRouter };
