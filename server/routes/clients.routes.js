import express from 'express';
import { createClient } from '../controllers/clients.controller.js';

const router = express.Router();

router.post('/', createClient);

export { router as clientsRouter };
