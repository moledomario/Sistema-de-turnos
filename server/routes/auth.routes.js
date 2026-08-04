import express from 'express';
import {
    register,
    login,
    me,
    forgotPassword,
    resetPassword,
    magicLink,
    verifyMagicLink,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Login del cliente por mail: pedir el link y canjearlo.
router.post('/magic-link', magicLink);
router.post('/magic-link/verify', verifyMagicLink);
router.get('/me', requireAuth, me);

export { router as authRouter };
