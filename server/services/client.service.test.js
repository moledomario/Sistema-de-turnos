import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
    prisma: {
        user: { findUnique: vi.fn(), create: vi.fn() },
    },
}));

const { prisma } = await import('../src/lib/prisma.js');
const { findOrCreateClientService, findOrCreateManualClientService } = await import(
    './client.service.js'
);

const datos = { firts_name: 'Ana', last_name: 'Pérez', email: 'ana@test.com' };

beforeEach(() => {
    vi.clearAllMocks();
});

describe('findOrCreateClientService', () => {
    // La ruta es pública: si devolviera el registro completo, cualquiera podría
    // averiguar el nombre y el teléfono de un email ajeno.
    it('no expone datos personales del cliente que ya existía', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'cliente1' });

        const client = await findOrCreateClientService(datos);

        expect(client).toEqual({ id: 'cliente1' });
        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ select: { id: true } })
        );
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('tampoco los expone al crear uno nuevo', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ id: 'cliente2' });

        const client = await findOrCreateClientService(datos);

        expect(client).toEqual({ id: 'cliente2' });
    });

    it('crea al invitado con rol USER y una contraseña que no sirve para entrar', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ id: 'cliente2' });

        await findOrCreateClientService(datos);

        const { data } = prisma.user.create.mock.calls[0][0];
        expect(data.role).toBe('USER');
        expect(data.password).toEqual(expect.any(String));
        expect(data.password).not.toBe('');
    });
});

describe('findOrCreateManualClientService', () => {
    // El turno del mostrador suele venir con nombre y a lo sumo un teléfono.
    const sinEmail = { firts_name: 'Ana', last_name: 'Pérez', phone: '1122334455' };

    it('con email reutiliza el cliente que ya existía y avisa que se le puede escribir', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'cliente1' });

        const result = await findOrCreateManualClientService({ ...datos, email: 'ana@test.com' });

        expect(result).toEqual({ client: { id: 'cliente1' }, reachableByEmail: true });
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    // Muchos turnos se cargan por teléfono o en el mostrador y no hay email. La
    // fila igual necesita uno porque es único en la tabla, así que se le pone
    // una dirección que no puede recibir correo.
    it('sin email crea el cliente con una dirección que no existe', async () => {
        prisma.user.create.mockResolvedValue({ id: 'cliente2' });

        const result = await findOrCreateManualClientService(sinEmail);

        expect(result.reachableByEmail).toBe(false);
        const { data } = prisma.user.create.mock.calls[0][0];
        expect(data.email).toMatch(/^sin-email-.*@turnos\.local$/);
        expect(data.role).toBe('USER');
    });

    it('sin email no busca por email antes de crear', async () => {
        prisma.user.create.mockResolvedValue({ id: 'cliente2' });

        await findOrCreateManualClientService(sinEmail);

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('genera una dirección distinta por cliente', async () => {
        prisma.user.create.mockResolvedValue({ id: 'cliente2' });

        await findOrCreateManualClientService(sinEmail);
        await findOrCreateManualClientService(sinEmail);

        const [primero, segundo] = prisma.user.create.mock.calls.map(([{ data }]) => data.email);
        expect(primero).not.toBe(segundo);
    });
});
