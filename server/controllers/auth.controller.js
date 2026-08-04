import {
    validateRegister,
    validateLogin,
    validateForgotPassword,
    validateResetPassword,
    validateMagicLink,
    validateMagicLinkToken,
} from '../schemas/auth.js';
import {
    registerService,
    loginService,
    getUserByIdService,
    requestPasswordResetService,
    resetPasswordService,
    requestMagicLinkService,
    verifyMagicLinkService,
} from '../services/auth.service.js';

const register = async (req, res) => {
    try {
        const validation = validateRegister(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
        }
        const { user, token } = await registerService(validation.data);
        res.status(201).json({ message: 'Cuenta creada exitosamente', user, token });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al crear la cuenta' });
    }
};

const login = async (req, res) => {
    try {
        const validation = validateLogin(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
        }
        const { user, token } = await loginService(validation.data);
        res.status(200).json({ message: 'Sesión iniciada exitosamente', user, token });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al iniciar sesión' });
    }
};

// La respuesta es siempre la misma, exista o no la cuenta: si cambiara, este
// endpoint serviría para averiguar qué emails están registrados.
const forgotPassword = async (req, res) => {
    const validation = validateForgotPassword(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }

    const respuestaGenerica = {
        message: 'Si ese email tiene una cuenta, te mandamos un link para restablecer la contraseña.',
    };

    try {
        await requestPasswordResetService(validation.data.email);
        res.status(200).json(respuestaGenerica);
    } catch (error) {
        // Tampoco se filtra por el error: se loguea y sale la misma respuesta.
        console.error('[auth] falló el pedido de restablecer contraseña:', error.message);
        res.status(200).json(respuestaGenerica);
    }
};

const resetPassword = async (req, res) => {
    const validation = validateResetPassword(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const { token, new_password } = validation.data;
        await resetPasswordService(token, new_password);
        res.status(200).json({ message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al restablecer la contraseña' });
    }
};

// Igual que forgotPassword: la respuesta es siempre la misma, exista o no la
// cuenta, para que nadie pueda averiguar qué emails reservaron turnos.
const magicLink = async (req, res) => {
    const validation = validateMagicLink(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }

    const respuestaGenerica = {
        message: 'Si ese email tiene turnos, te mandamos un link para verlos.',
    };

    try {
        await requestMagicLinkService(validation.data.email);
        res.status(200).json(respuestaGenerica);
    } catch (error) {
        console.error('[auth] falló el pedido de link mágico:', error.message);
        res.status(200).json(respuestaGenerica);
    }
};

const verifyMagicLink = async (req, res) => {
    const validation = validateMagicLinkToken(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const { user, token } = await verifyMagicLinkService(validation.data.token);
        res.status(200).json({ message: 'Sesión iniciada exitosamente', user, token });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al validar el link' });
    }
};

const me = async (req, res) => {
    try {
        const user = await getUserByIdService(req.user.sub);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener el usuario' });
    }
};

export { register, login, me, forgotPassword, resetPassword, magicLink, verifyMagicLink };
