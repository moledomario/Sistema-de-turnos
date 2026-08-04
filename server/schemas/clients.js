import { z } from 'zod';

const clientSchema = z.object({
    firts_name: z.string().min(1, 'El nombre es obligatorio'),
    last_name: z.string().min(1, 'El apellido es obligatorio'),
    email: z.string().email('Email inválido'),
    phone: z.string().optional(),
});

function validateClient(client) {
    return clientSchema.safeParse(client);
}

export { validateClient };
