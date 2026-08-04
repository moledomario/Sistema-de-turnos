import express from 'express';
import {
    getProfessional,
    getProfessionalBySlug,
    getAllProfessionals,
    getAvailability,
} from '../controllers/appointments.controller.js';

const router = express.Router();

// GET /professionals/slug/:slug  → profesional + servicios, por su link único de reserva
router.get('/slug/:slug', getProfessionalBySlug);

// GET /professionals/:id/availability?service_id=&date=  → horarios libres
router.get('/:id/availability', getAvailability);

// GET /professionals/:id  → servicios que ofrece ese profesional
router.get('/:id', getProfessional);

// GET /professionals → todos los profesionales
router.get('/', getAllProfessionals);

export { router as professionalsRouter };
