import crypto from 'crypto';
import { prisma } from '../src/lib/prisma.js';

//crea un cliente nuevo o reutiliza uno existente con el mismo email (alta rápida, sin login)

// La ruta es pública (la usa quien reserva sin cuenta), así que solo sale el id:
// es lo único que necesita el alta del turno. Devolver el registro entero
// convertía este endpoint en un buscador de nombres y teléfonos por email.
const clientSelect = { id: true };

const findOrCreateClientService = async (clientData) => {
    const existingClient = await prisma.user.findUnique({
        where: { email: clientData.email },
        select: clientSelect,
    });

    if (existingClient) {
        return existingClient;
    }

    try {
        const newClient = await prisma.user.create({
            data: {
                ...clientData,
                role: 'USER',
                password: crypto.randomUUID(),
            },
            select: clientSelect,
        });
        return newClient;
    } catch (error) {
        console.log(error);
        throw new Error('Error al crear el cliente');
    }
};

// Cliente cargado a mano por el profesional (alguien que llamó o cayó al local).
// El email es opcional: si no lo da, igual hace falta una fila `user` para
// colgarle el turno, así que se le pone una dirección que no existe y nunca va a
// recibir correo. Devuelve también si el email sirve para avisarle.
const findOrCreateManualClientService = async ({ firts_name, last_name, email, phone }) => {
    if (email) {
        const client = await findOrCreateClientService({ firts_name, last_name, email, phone });
        return { client, reachableByEmail: true };
    }

    const client = await prisma.user.create({
        data: {
            firts_name,
            last_name,
            phone,
            email: `sin-email-${crypto.randomUUID()}@turnos.local`,
            role: 'USER',
            password: crypto.randomUUID(),
        },
        select: clientSelect,
    });

    return { client, reachableByEmail: false };
};

export { findOrCreateClientService, findOrCreateManualClientService };
