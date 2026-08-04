import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
    prisma: {
        user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
}));

vi.mock('./notification.service.js', () => ({
    notifyPasswordReset: vi.fn(),
    notifyMagicLink: vi.fn(),
    notifyInBackground: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hasheada'), compare: vi.fn() },
}));

vi.mock('jsonwebtoken', () => ({
    default: { sign: vi.fn(() => 'token') },
}));

const { prisma } = await import('../src/lib/prisma.js');
const { notifyPasswordReset, notifyMagicLink } = await import('./notification.service.js');
const {
    registerService,
    requestPasswordResetService,
    resetPasswordService,
    requestMagicLinkService,
    verifyMagicLinkService,
} = await import('./auth.service.js');

const datosDeRegistro = {
    firts_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@test.com',
    password: 'unaclavelarga',
};

beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) => Promise.resolve({ id: 'nuevo', ...data }));
});

describe('registerService', () => {
    it('lanza 409 si el email ya tiene cuenta', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'existente' });

        await expect(registerService(datosDeRegistro)).rejects.toMatchObject({ status: 409 });
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    // Registrarse es solo para quien ofrece turnos: los clientes se dan de alta
    // solos al reservar, sin cuenta.
    it('crea siempre una cuenta profesional, con su link de reserva', async () => {
        await registerService(datosDeRegistro);

        expect(prisma.user.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ role: 'PROFESSIONAL', slug: 'ana-perez' }),
            })
        );
    });

    it('ignora un rol mandado a mano en el body', async () => {
        await registerService({ ...datosDeRegistro, role: 'ADMIN' });

        const { data } = prisma.user.create.mock.calls[0][0];
        expect(data.role).toBe('PROFESSIONAL');
    });

    it('nunca guarda la contraseña en texto plano', async () => {
        await registerService(datosDeRegistro);

        const { data } = prisma.user.create.mock.calls[0][0];
        expect(data.password).toBe('hasheada');
    });

    it('le agrega un sufijo al slug si el nombre ya está tomado', async () => {
        // El primer findUnique es el del email; después van los del slug.
        prisma.user.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'otra' })
            .mockResolvedValueOnce(null);

        await registerService(datosDeRegistro);

        const { data } = prisma.user.create.mock.calls[0][0];
        expect(data.slug).toBe('ana-perez-2');
    });
});

describe('requestPasswordResetService', () => {
    const profesional = { id: 'prof1', email: 'ana@test.com', firts_name: 'Ana', role: 'PROFESSIONAL' };

    it('no hace nada ni falla si el email no tiene cuenta', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(requestPasswordResetService('nadie@test.com')).resolves.toBeUndefined();
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(notifyPasswordReset).not.toHaveBeenCalled();
    });

    // Un invitado que reservó un turno es una fila `user` con rol USER y una
    // contraseña random: mandarle el link lo convertiría en un usuario con login.
    it('ignora a los clientes invitados', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...profesional, role: 'USER' });

        await requestPasswordResetService('ana@test.com');

        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(notifyPasswordReset).not.toHaveBeenCalled();
    });

    it('guarda el hash del token, nunca el token que viaja en el mail', async () => {
        prisma.user.findUnique.mockResolvedValue(profesional);
        prisma.user.update.mockResolvedValue({});

        await requestPasswordResetService('ana@test.com');

        const { data } = prisma.user.update.mock.calls[0][0];
        const [, url] = notifyPasswordReset.mock.calls[0];
        const tokenDelMail = url.split('/').pop();

        expect(data.reset_token_hash).toHaveLength(64); // sha256 en hex
        expect(data.reset_token_hash).not.toBe(tokenDelMail);
        expect(data.reset_token_expires.getTime()).toBeGreaterThan(Date.now());
    });

    it('manda un token distinto en cada pedido', async () => {
        prisma.user.findUnique.mockResolvedValue(profesional);
        prisma.user.update.mockResolvedValue({});

        await requestPasswordResetService('ana@test.com');
        await requestPasswordResetService('ana@test.com');

        const [primero, segundo] = prisma.user.update.mock.calls.map(([{ data }]) => data.reset_token_hash);
        expect(primero).not.toBe(segundo);
    });
});

describe('resetPasswordService', () => {
    it('lanza 400 si el token no existe o ya venció', async () => {
        prisma.user.findFirst.mockResolvedValue(null);

        await expect(resetPasswordService('token-viejo', 'nuevaclave123')).rejects.toMatchObject({
            status: 400,
        });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('busca por hash y exige que no esté vencido', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'prof1' });
        prisma.user.update.mockResolvedValue({});

        await resetPasswordService('el-token', 'nuevaclave123');

        const { where } = prisma.user.findFirst.mock.calls[0][0];
        expect(where.reset_token_hash).toHaveLength(64);
        expect(where.reset_token_hash).not.toBe('el-token');
        expect(where.reset_token_expires).toEqual({ gt: expect.any(Date) });
    });

    it('guarda la contraseña hasheada y quema el token', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'prof1' });
        prisma.user.update.mockResolvedValue({});

        await resetPasswordService('el-token', 'nuevaclave123');

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'prof1' },
            data: {
                password: 'hasheada',
                reset_token_hash: null,
                reset_token_expires: null,
            },
        });
    });
});

// El link mágico es el login del cliente: reservó como invitado, nunca eligió
// una contraseña y sin esto no tiene forma de volver a ver sus turnos.
describe('requestMagicLinkService', () => {
    const cliente = { id: 'cli1', email: 'juan@test.com', firts_name: 'Juan', role: 'USER' };

    it('no hace nada ni falla si el email no reservó nunca', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(requestMagicLinkService('nadie@test.com')).resolves.toBeUndefined();
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(notifyMagicLink).not.toHaveBeenCalled();
    });

    // Un profesional tiene contraseña y su propio flujo de recuperación: darle
    // además un login por mail sería una segunda puerta al panel entero.
    it('ignora a los profesionales', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...cliente, role: 'PROFESSIONAL' });

        await requestMagicLinkService('juan@test.com');

        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(notifyMagicLink).not.toHaveBeenCalled();
    });

    it('ignora también a los ADMIN', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...cliente, role: 'ADMIN' });

        await requestMagicLinkService('juan@test.com');

        expect(notifyMagicLink).not.toHaveBeenCalled();
    });

    it('guarda el hash del token, nunca el token que viaja en el mail', async () => {
        prisma.user.findUnique.mockResolvedValue(cliente);
        prisma.user.update.mockResolvedValue({});

        await requestMagicLinkService('juan@test.com');

        const { data } = prisma.user.update.mock.calls[0][0];
        const [, url] = notifyMagicLink.mock.calls[0];
        const tokenDelMail = url.split('/').pop();

        expect(data.magic_token_hash).toHaveLength(64); // sha256 en hex
        expect(data.magic_token_hash).not.toBe(tokenDelMail);
        expect(url).toContain('/acceso/');
        expect(data.magic_token_expires.getTime()).toBeGreaterThan(Date.now());
    });

    // No debe pisar el token de recuperación: son flujos distintos y pedir uno
    // no puede invalidar el otro.
    it('no toca los campos de recuperación de contraseña', async () => {
        prisma.user.findUnique.mockResolvedValue(cliente);
        prisma.user.update.mockResolvedValue({});

        await requestMagicLinkService('juan@test.com');

        const { data } = prisma.user.update.mock.calls[0][0];
        expect(data).not.toHaveProperty('reset_token_hash');
        expect(data).not.toHaveProperty('reset_token_expires');
    });

    it('manda un token distinto en cada pedido', async () => {
        prisma.user.findUnique.mockResolvedValue(cliente);
        prisma.user.update.mockResolvedValue({});

        await requestMagicLinkService('juan@test.com');
        await requestMagicLinkService('juan@test.com');

        const [primero, segundo] = prisma.user.update.mock.calls.map(
            ([{ data }]) => data.magic_token_hash
        );
        expect(primero).not.toBe(segundo);
    });
});

describe('verifyMagicLinkService', () => {
    it('lanza 400 si el token no existe o ya venció', async () => {
        prisma.user.findFirst.mockResolvedValue(null);

        await expect(verifyMagicLinkService('token-viejo')).rejects.toMatchObject({ status: 400 });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('busca por hash y exige que no esté vencido', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'cli1' });
        prisma.user.update.mockResolvedValue({ id: 'cli1', role: 'USER' });

        await verifyMagicLinkService('el-token');

        const { where } = prisma.user.findFirst.mock.calls[0][0];
        expect(where.magic_token_hash).toHaveLength(64);
        expect(where.magic_token_hash).not.toBe('el-token');
        expect(where.magic_token_expires).toEqual({ gt: expect.any(Date) });
    });

    // Si el mail se reenvía o queda en un historial, el link ya no abre nada.
    it('quema el token al usarlo y devuelve la sesión', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'cli1' });
        prisma.user.update.mockResolvedValue({ id: 'cli1', email: 'juan@test.com', role: 'USER' });

        const result = await verifyMagicLinkService('el-token');

        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'cli1' },
                data: { magic_token_hash: null, magic_token_expires: null },
            })
        );
        expect(result.token).toBe('token');
        expect(result.user.id).toBe('cli1');
    });

    // La respuesta va al navegador del cliente: no puede arrastrar la contraseña
    // ni los tokens que quedaron en la fila.
    it('no devuelve la contraseña ni los tokens en el usuario', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'cli1' });
        prisma.user.update.mockResolvedValue({ id: 'cli1', role: 'USER' });

        await verifyMagicLinkService('el-token');

        const { select } = prisma.user.update.mock.calls[0][0];
        expect(select.password).toBeUndefined();
        expect(select.magic_token_hash).toBeUndefined();
        expect(select.reset_token_hash).toBeUndefined();
        expect(select.id).toBe(true);
    });
});
