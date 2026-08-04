import { validateAppointment, validateReschedule } from '../schemas/appointments.js';
import { validateAvailabilityQuery } from '../schemas/availability.js';
import {
    createAppointmentService,
    getAppointmentsService,
    getProfessionalService,
    getProfessionalBySlugService,
    getAllProfessionalsService,
    getAvailableSlotsService,
    getMyAppointmentsService,
    cancelAppointmentService,
    rescheduleAppointmentService,
} from '../services/appointment.service.js';

const createAppointment = async (req, res) => {
    try {
        const validation = validateAppointment(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
        }
        // Si hay un usuario logueado, el turno se asocia a su cuenta (ignora
        // cualquier client_id que venga en el body); si no, es un invitado que
        // ya creó/reusó su cliente vía POST /clients y manda ese id.
        const client_id = req.user?.sub ?? validation.data.client_id;
        if (!client_id) {
            return res.status(400).json({ message: 'Faltan los datos del cliente' });
        }
        const appointmentData = { ...validation.data, client_id };
        const newAppointment = await createAppointmentService(appointmentData);

        res.status(200).json({ message: 'Cita creada exitosamente', appointment: newAppointment });

    } catch (error) {
        // Los errores de regla (horario ocupado, fuera de atención) traen status
        // y un mensaje que le sirve a quien está reservando; el resto es un 500
        // genérico para no filtrar detalles internos.
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error al crear la cita' })
    }
};

const getAppointments = async (req, res) => {
    try {
        const appointments = await getAppointmentsService();
        if (!appointments) {
            return res.status(404).json({ message: 'No se encontraron citas' });
        }
        res.status(200).json({ message: 'Citas obtenidas exitosamente', appointments });
    } catch (error) {

        res.status(400).json({ message: 'Error al obtener las citas' })

    }
};

const getProfessional = async (req, res) => {
    try {
        const { id } = req.params;
        const services = await getProfessionalService(id);
        if (!services) {
            return res.status(404).json({ message: 'No se encontraron servicios' });
        }
        res.status(200).json({ message: 'Servicios obtenidos exitosamente', services });
    } catch (error) {
        console.log(error);
        res.status(400).json({ message: 'ERROR' })

    }
}

const getProfessionalBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const data = await getProfessionalBySlugService(slug);
        res.status(200).json({ message: 'Profesional obtenido exitosamente', ...data });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al obtener el profesional' });
    }
};

const getAllProfessionals = async (req, res) => {
    try {
        const professionals = await getAllProfessionalsService();
        if (!professionals) {
            return res.status(404).json({ message: 'No se encontraron profesionales' });
        }
        res.status(200).json({ message: 'Profesionales obtenidos exitosamente', professionals });
    } catch (error) {
        console.log(error);
        res.status(400).json({ message: 'Nunca mas' })
    }
}

const getAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const validation = validateAvailabilityQuery(req.query);
        if (!validation.success) {
            return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
        }
        const { service_id, date } = validation.data;
        const slots = await getAvailableSlotsService(id, service_id, date);
        res.status(200).json({ message: 'Horarios obtenidos exitosamente', slots });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Error al obtener los horarios' });
    }
};

const getMyAppointments = async (req, res) => {
    try {
        const appointments = await getMyAppointmentsService(req.user.sub);
        res.status(200).json({ message: 'Turnos obtenidos exitosamente', appointments });
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener tus turnos' });
    }
};

const cancelAppointment = async (req, res) => {
    try {
        const appointment = await cancelAppointmentService(req.user.sub, req.params.id);
        res.status(200).json({ message: 'Turno cancelado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al cancelar el turno' });
    }
};

const rescheduleAppointment = async (req, res) => {
    const validation = validateReschedule(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const appointment = await rescheduleAppointmentService(req.user.sub, req.params.id, validation.data.start_time);
        res.status(200).json({ message: 'Turno reprogramado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al reprogramar el turno' });
    }
};

export {
    createAppointment,
    getAppointments,
    getProfessional,
    getProfessionalBySlug,
    getAllProfessionals,
    getAvailability,
    getMyAppointments,
    cancelAppointment,
    rescheduleAppointment,
};