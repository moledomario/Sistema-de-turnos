import { validateClient } from '../schemas/clients.js';
import { findOrCreateClientService } from '../services/client.service.js';

const createClient = async (req, res) => {
    try {
        const validation = validateClient(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
        }
        const client = await findOrCreateClientService(validation.data);
        res.status(200).json({ message: 'Cliente obtenido exitosamente', client });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear el cliente' });
    }
};

export { createClient };
