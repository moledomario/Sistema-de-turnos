import { z } from 'zod';

// El registro es solo para profesionales: quien viene a reservar un turno no
// necesita cuenta, entra por el link del profesional y se identifica con su
// email al confirmar (ver findOrCreateClientService). Por eso el rol no se
// acepta desde el body: lo fija el servicio.
const registerSchema = z.object({
    firts_name: z.string().min(1, 'El nombre es obligatorio'),
    last_name: z.string().min(1, 'El apellido es obligatorio'),
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    phone: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'La contraseña es obligatoria'),
});

const forgotPasswordSchema = z.object({
    email: z.string().email('Email inválido'),
});

const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Falta el token'),
    new_password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

// Link mágico: pedirlo solo necesita el email, canjearlo solo el token.
const magicLinkSchema = z.object({
    email: z.string().email('Email inválido'),
});

const magicLinkTokenSchema = z.object({
    token: z.string().min(1, 'Falta el token'),
});

function validateMagicLink(data) {
    return magicLinkSchema.safeParse(data);
}

function validateMagicLinkToken(data) {
    return magicLinkTokenSchema.safeParse(data);
}

function validateForgotPassword(data) {
    return forgotPasswordSchema.safeParse(data);
}

function validateResetPassword(data) {
    return resetPasswordSchema.safeParse(data);
}

function validateRegister(data) {
    return registerSchema.safeParse(data);
}

function validateLogin(data) {
    return loginSchema.safeParse(data);
}

export {
    validateRegister,
    validateLogin,
    validateForgotPassword,
    validateResetPassword,
    validateMagicLink,
    validateMagicLinkToken,
};
