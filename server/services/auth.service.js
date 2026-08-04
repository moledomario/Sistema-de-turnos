import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma.js';
import { notifyPasswordReset, notifyMagicLink, notifyInBackground } from './notification.service.js';

const RESET_TOKEN_HOURS = 1;
// Más corto que el de contraseña: el link mágico es la sesión misma, no un paso
// previo, así que conviene que caduque rápido si el mail queda abierto en otro
// lado. Media hora alcanza para ir al correo y volver.
const MAGIC_TOKEN_MINUTES = 30;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// En la base va el hash, no el token: el que viaja por mail es el único que
// sirve, y si la base se filtra los links guardados no valen nada.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const userSelect = {
    id: true,
    firts_name: true,
    last_name: true,
    email: true,
    phone: true,
    role: true,
    slug: true,
    onboarding_completed: true,
};

function signToken(user) {
    return jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function slugifyName(firstName, lastName) {
    return `${firstName} ${lastName}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Genera un slug único para el link de reserva del profesional (ej. "carlos-gomez",
// o "carlos-gomez-2" si ya existe), a partir de su nombre.
async function generateUniqueSlug(firstName, lastName) {
    const base = slugifyName(firstName, lastName) || 'profesional';
    let slug = base;
    let suffix = 2;

    while (await prisma.user.findUnique({ where: { slug } })) {
        slug = `${base}-${suffix}`;
        suffix += 1;
    }

    return slug;
}

const registerService = async ({ password, ...data }) => {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
        const error = new Error('Ya existe una cuenta con ese email');
        error.status = 409;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Todas las cuentas que se registran son profesionales; los clientes se dan
    // de alta solos al reservar, sin cuenta ni contraseña.
    const user = await prisma.user.create({
        data: {
            ...data,
            password: hashedPassword,
            role: 'PROFESSIONAL',
            slug: await generateUniqueSlug(data.firts_name, data.last_name),
        },
        select: userSelect,
    });

    const token = signToken(user);
    return { user, token };
};

const loginService = async ({ email, password }) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        const error = new Error('Email o contraseña incorrectos');
        error.status = 401;
        throw error;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
        const error = new Error('Email o contraseña incorrectos');
        error.status = 401;
        throw error;
    }

    const safeUser = await prisma.user.findUnique({ where: { id: user.id }, select: userSelect });
    const token = signToken(user);
    return { user: safeUser, token };
};

const getUserByIdService = async (id) => {
    return prisma.user.findUnique({ where: { id }, select: userSelect });
};

// Arranca la recuperación. No devuelve nada ni distingue casos a propósito: el
// controller contesta siempre lo mismo, así este endpoint no sirve para
// averiguar qué emails tienen cuenta.
const requestPasswordResetService = async (email) => {
    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, firts_name: true, role: true },
    });

    // Los clientes invitados también son filas `user`, pero nunca eligieron una
    // contraseña ni entran al sistema: mandarles un link los convertiría en
    // usuarios con login sin haberlo pedido.
    if (!user || (user.role !== 'PROFESSIONAL' && user.role !== 'ADMIN')) {
        return;
    }

    const token = crypto.randomBytes(32).toString('hex');

    await prisma.user.update({
        where: { id: user.id },
        data: {
            reset_token_hash: hashToken(token),
            reset_token_expires: new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000),
        },
    });

    notifyInBackground(
        notifyPasswordReset(user, `${APP_URL}/recuperar/${token}`, RESET_TOKEN_HOURS)
    );
};

const resetPasswordService = async (token, newPassword) => {
    const user = await prisma.user.findFirst({
        where: {
            reset_token_hash: hashToken(token),
            reset_token_expires: { gt: new Date() },
        },
        select: { id: true },
    });

    if (!user) {
        const error = new Error('El link no es válido o ya venció. Pedí uno nuevo.');
        error.status = 400;
        throw error;
    }

    // El token se quema en el mismo update que cambia la contraseña: un link
    // sirve una sola vez.
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: await bcrypt.hash(newPassword, 10),
            reset_token_hash: null,
            reset_token_expires: null,
        },
    });
};

// Link mágico para el cliente. Quien reserva como invitado queda como fila
// `user` con una contraseña aleatoria que nadie eligió ni conoce, así que no
// tiene forma de entrar a ver sus turnos: el link por mail es su login.
// Igual que la recuperación, no devuelve nada ni distingue casos, para que el
// endpoint no sirva de buscador de emails registrados.
const requestMagicLinkService = async (email) => {
    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, firts_name: true, role: true },
    });

    // Solo clientes. Un profesional tiene contraseña y su propio flujo de
    // recuperación; darle además un login por mail sería una segunda puerta a
    // todo el panel sin que la haya pedido.
    if (!user || user.role !== 'USER') {
        return;
    }

    const token = crypto.randomBytes(32).toString('hex');

    await prisma.user.update({
        where: { id: user.id },
        data: {
            magic_token_hash: hashToken(token),
            magic_token_expires: new Date(Date.now() + MAGIC_TOKEN_MINUTES * 60 * 1000),
        },
    });

    notifyInBackground(
        notifyMagicLink(user, `${APP_URL}/acceso/${token}`, MAGIC_TOKEN_MINUTES)
    );
};

// Canjea el token del mail por una sesión. Devuelve lo mismo que un login
// normal, así el front lo guarda igual que cualquier otra sesión.
const verifyMagicLinkService = async (token) => {
    const user = await prisma.user.findFirst({
        where: {
            magic_token_hash: hashToken(token),
            magic_token_expires: { gt: new Date() },
        },
        select: { id: true },
    });

    if (!user) {
        const error = new Error('El link no es válido o ya venció. Pedí uno nuevo.');
        error.status = 400;
        throw error;
    }

    // El token se quema al usarlo: el link sirve una sola vez, así que si el
    // mail se reenvía o queda en un historial, ya no abre nada.
    const safeUser = await prisma.user.update({
        where: { id: user.id },
        data: { magic_token_hash: null, magic_token_expires: null },
        select: userSelect,
    });

    return { user: safeUser, token: signToken(safeUser) };
};

export {
    registerService,
    loginService,
    getUserByIdService,
    requestPasswordResetService,
    resetPasswordService,
    requestMagicLinkService,
    verifyMagicLinkService,
};
