import {
    validateAvailabilityCreate,
    validateAvailabilityDay,
    validateProfessionalServiceCreate,
    validateProfessionalServiceUpdate,
    validateSettingsUpdate,
    validateRequestResponse,
    validateAttendance,
    validateBookingCreate,
    validateBookingReschedule,
    validateAccountUpdate,
    validatePasswordChange,
    validateTeamMemberCreate,
    validateTeamMemberUpdate,
} from '../schemas/panel.js';
import {
    getMyAvailabilityService,
    createAvailabilityService,
    replaceAvailabilityDayService,
    deleteAvailabilityService,
    getMyBookingsService,
    createBookingService,
    cancelBookingService,
    setAttendanceService,
    rescheduleBookingService,
    getPendingRequestsService,
    respondToRequestService,
    acceptAllRequestsService,
    getMySettingsService,
    updateMySettingsService,
    changeMyPasswordService,
    getMyAccountService,
    updateMyAccountService,
    completeOnboardingService,
    getMyTeamService,
    createTeamMemberService,
    updateTeamMemberService,
    deleteTeamMemberService,
    getServiceCatalogService,
    getMyServicesService,
    createMyServiceService,
    updateMyServiceService,
    deleteMyServiceService,
} from '../services/panel.service.js';

// A qué profesional del equipo se refiere la operación. Viaja por querystring
// (?member_id=) incluso en los POST porque es alcance, no contenido: así los
// schemas de zod del cuerpo quedan igual. Sin el parámetro, el service cae en
// el dueño de la cuenta, que es lo que hace que una cuenta que trabaja sola no
// tenga que mandar nada.
const memberOf = (req) => req.query?.member_id || undefined;

const getMyAvailability = async (req, res) => {
    try {
        const availability = await getMyAvailabilityService(req.user.sub, memberOf(req));
        res.status(200).json({ availability });
    } catch {
        res.status(500).json({ message: 'Error al obtener los horarios' });
    }
};

const createAvailability = async (req, res) => {
    const validation = validateAvailabilityCreate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const availability = await createAvailabilityService(req.user.sub, validation.data, memberOf(req));
        res.status(201).json({ message: 'Horario creado', availability });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al crear el horario' });
    }
};

const replaceAvailabilityDay = async (req, res) => {
    const validation = validateAvailabilityDay(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const { weekday, ranges } = validation.data;
        const { availability, conflicts } = await replaceAvailabilityDayService(req.user.sub, weekday, ranges, memberOf(req));
        res.status(200).json({ message: 'Horario actualizado', availability, conflicts });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al guardar el horario' });
    }
};

const deleteAvailability = async (req, res) => {
    try {
        await deleteAvailabilityService(req.user.sub, req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al borrar el horario' });
    }
};

const getMyBookings = async (req, res) => {
    try {
        const appointments = await getMyBookingsService(req.user.sub);
        res.status(200).json({ appointments });
    } catch {
        res.status(500).json({ message: 'Error al obtener tus turnos' });
    }
};

const createBooking = async (req, res) => {
    const validation = validateBookingCreate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const appointment = await createBookingService(req.user.sub, validation.data);
        res.status(201).json({ message: 'Turno agendado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al agendar el turno' });
    }
};

const cancelBooking = async (req, res) => {
    const validation = validateRequestResponse(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const appointment = await cancelBookingService(
            req.user.sub,
            req.params.id,
            validation.data.message
        );
        res.status(200).json({ message: 'Turno cancelado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al cancelar el turno' });
    }
};

// El profesional marca si el cliente vino o no. Los turnos pasados ya llegan
// como COMPLETED por el cierre automático; esto sirve para corregir los que no.
const setAttendance = async (req, res) => {
    const validation = validateAttendance(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const appointment = await setAttendanceService(
            req.user.sub,
            req.params.id,
            validation.data.attended
        );
        res.status(200).json({
            message: validation.data.attended ? 'Marcado como atendido' : 'Marcado como ausente',
            appointment,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al marcar la asistencia' });
    }
};

const rescheduleBooking = async (req, res) => {
    const validation = validateBookingReschedule(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const { start_time, message } = validation.data;
        const appointment = await rescheduleBookingService(
            req.user.sub,
            req.params.id,
            start_time,
            message
        );
        res.status(200).json({ message: 'Turno reprogramado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al mover el turno' });
    }
};

const getPendingRequests = async (req, res) => {
    try {
        const requests = await getPendingRequestsService(req.user.sub);
        res.status(200).json({ requests });
    } catch {
        res.status(500).json({ message: 'Error al obtener las solicitudes' });
    }
};

const acceptRequest = async (req, res) => {
    const validation = validateRequestResponse(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const appointment = await respondToRequestService(
            req.user.sub,
            req.params.id,
            true,
            validation.data.message
        );
        res.status(200).json({ message: 'Turno aceptado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al aceptar el turno' });
    }
};

const rejectRequest = async (req, res) => {
    const validation = validateRequestResponse(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const appointment = await respondToRequestService(
            req.user.sub,
            req.params.id,
            false,
            validation.data.message
        );
        res.status(200).json({ message: 'Turno rechazado', appointment });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al rechazar el turno' });
    }
};

const acceptAllRequests = async (req, res) => {
    const validation = validateRequestResponse(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const { accepted } = await acceptAllRequestsService(req.user.sub, validation.data.message);
        res.status(200).json({ message: `${accepted} turno(s) aceptado(s)`, accepted });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al aceptar los turnos' });
    }
};

const getMySettings = async (req, res) => {
    try {
        const settings = await getMySettingsService(req.user.sub);
        res.status(200).json({ settings });
    } catch {
        res.status(500).json({ message: 'Error al obtener la configuración' });
    }
};

const updateMySettings = async (req, res) => {
    const validation = validateSettingsUpdate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const settings = await updateMySettingsService(req.user.sub, validation.data);
        res.status(200).json({ message: 'Configuración actualizada', settings });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al guardar la configuración' });
    }
};

const changeMyPassword = async (req, res) => {
    const validation = validatePasswordChange(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        await changeMyPasswordService(req.user.sub, validation.data);
        res.status(200).json({ message: 'Contraseña actualizada' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al cambiar la contraseña' });
    }
};

const getMyAccount = async (req, res) => {
    try {
        const account = await getMyAccountService(req.user.sub);
        res.status(200).json({ account });
    } catch {
        res.status(500).json({ message: 'Error al obtener los datos de tu cuenta' });
    }
};

const updateMyAccount = async (req, res) => {
    const validation = validateAccountUpdate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const account = await updateMyAccountService(req.user.sub, validation.data);
        res.status(200).json({ message: 'Cuenta actualizada', account });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al actualizar tu cuenta' });
    }
};

const completeOnboarding = async (req, res) => {
    try {
        const result = await completeOnboardingService(req.user.sub);
        res.status(200).json({ message: 'Onboarding completado', ...result });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al terminar el onboarding' });
    }
};

const getMyTeam = async (req, res) => {
    try {
        const team = await getMyTeamService(req.user.sub);
        res.status(200).json({ team });
    } catch {
        res.status(500).json({ message: 'Error al obtener tus profesionales' });
    }
};

const createTeamMember = async (req, res) => {
    const validation = validateTeamMemberCreate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const member = await createTeamMemberService(req.user.sub, validation.data);
        res.status(201).json({ message: 'Profesional agregado', member });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al agregar el profesional' });
    }
};

const updateTeamMember = async (req, res) => {
    const validation = validateTeamMemberUpdate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const member = await updateTeamMemberService(req.user.sub, req.params.id, validation.data);
        res.status(200).json({ message: 'Profesional actualizado', member });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al actualizar el profesional' });
    }
};

const deleteTeamMember = async (req, res) => {
    try {
        await deleteTeamMemberService(req.user.sub, req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al borrar el profesional' });
    }
};

const getServiceCatalog = async (req, res) => {
    try {
        const services = await getServiceCatalogService();
        res.status(200).json({ services });
    } catch {
        res.status(500).json({ message: 'Error al obtener el catálogo de servicios' });
    }
};

const getMyServices = async (req, res) => {
    try {
        const services = await getMyServicesService(req.user.sub, memberOf(req));
        res.status(200).json({ services });
    } catch {
        res.status(500).json({ message: 'Error al obtener tus servicios' });
    }
};

const createMyService = async (req, res) => {
    const validation = validateProfessionalServiceCreate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const service = await createMyServiceService(req.user.sub, validation.data, memberOf(req));
        res.status(201).json({ message: 'Servicio agregado', service });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al agregar el servicio' });
    }
};

const updateMyService = async (req, res) => {
    const validation = validateProfessionalServiceUpdate(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: 'Datos inválidos', errors: validation.error.issues });
    }
    try {
        const service = await updateMyServiceService(req.user.sub, req.params.id, validation.data);
        res.status(200).json({ message: 'Servicio actualizado', service });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al actualizar el servicio' });
    }
};

const deleteMyService = async (req, res) => {
    try {
        await deleteMyServiceService(req.user.sub, req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Error al borrar el servicio' });
    }
};

export {
    getMyAvailability,
    createAvailability,
    replaceAvailabilityDay,
    deleteAvailability,
    getMyBookings,
    createBooking,
    cancelBooking,
    setAttendance,
    rescheduleBooking,
    getPendingRequests,
    acceptRequest,
    rejectRequest,
    acceptAllRequests,
    getMySettings,
    updateMySettings,
    changeMyPassword,
    getMyAccount,
    updateMyAccount,
    completeOnboarding,
    getMyTeam,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    getServiceCatalog,
    getMyServices,
    createMyService,
    updateMyService,
    deleteMyService,
};
