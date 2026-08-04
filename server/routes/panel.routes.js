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

router.get('/availability', getMyAvailability);
router.post('/availability', createAvailability);
router.put('/availability/day', replaceAvailabilityDay);
router.delete('/availability/:id', deleteAvailability);

router.get('/appointments', getMyBookings);
router.post('/appointments', createBooking);
router.patch('/appointments/:id/cancel', cancelBooking);
// Marcar si el cliente vino (COMPLETED) o no (NO_SHOW).
router.patch('/appointments/:id/attendance', setAttendance);
router.patch('/appointments/:id/reschedule', rescheduleBooking);

router.get('/requests', getPendingRequests);
router.post('/requests/accept-all', acceptAllRequests);
router.patch('/requests/:id/accept', acceptRequest);
router.patch('/requests/:id/reject', rejectRequest);

router.get('/settings', getMySettings);
router.patch('/settings', updateMySettings);
router.patch('/settings/password', changeMyPassword);

router.get('/account', getMyAccount);
router.patch('/account', updateMyAccount);
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
