// En producción hay que definir NEXT_PUBLIC_API_URL (el dominio del backend).
// Next.js reemplaza las NEXT_PUBLIC_* en tiempo de build, así que esto no se lee
// en caliente: si cambia, hay que volver a buildear. El fallback deja el
// desarrollo local andando sin configurar nada.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// El backend siempre responde JSON, salvo que algo se rompa antes de llegar a
// un handler (ruta inexistente, error no capturado): ahí Express devuelve una
// página de error en HTML. Sin esto, `response.json()` tira un SyntaxError
// críptico ("Unexpected token '<'") en vez de un mensaje entendible.
async function parseJsonSafe(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export async function getProfessionalBySlug(slug) {
    const response = await fetch(`${API_URL}/professionals/slug/${slug}`);
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al obtener el profesional");
    }
    return data;
}

export async function getAvailableSlots(professionalId, serviceId, date) {
    const url = `${API_URL}/professionals/${professionalId}/availability?service_id=${serviceId}&date=${date}`;
    const response = await fetch(url);
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al obtener los horarios");
    }
    return data;
}

export async function createClient(clientData) {
    const response = await fetch(`${API_URL}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientData),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al guardar tus datos");
    }
    return data;
}

export async function createAppointment(appointmentData, token) {
    const response = await fetch(`${API_URL}/appointments`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(appointmentData),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al confirmar el turno");
    }
    return data;
}

export async function registerUser(userData) {
    const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al crear la cuenta");
    }
    return data;
}

export async function loginUser(credentials) {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al iniciar sesión");
    }
    return data;
}

export async function requestPasswordReset(email) {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al pedir el link");
    }
    return data;
}

export async function resetPassword(token, newPassword) {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al restablecer la contraseña");
    }
    return data;
}

// Login del cliente por mail: no tiene contraseña (se dio de alta al reservar),
// así que el link que le llega es su forma de entrar.
export async function requestMagicLink(email) {
    const response = await fetch(`${API_URL}/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al pedir el link");
    }
    return data;
}

export async function verifyMagicLink(token) {
    const response = await fetch(`${API_URL}/auth/magic-link/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al validar el link");
    }
    return data;
}

export async function getMe(token) {
    const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error al obtener el usuario");
    }
    return data;
}

async function panelRequest(path, token, options = {}) {
    const response = await fetch(`${API_URL}/panel${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });
    if (response.status === 204) return null;
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error en el panel");
    }
    return data;
}

async function appointmentsRequest(path, token, options = {}) {
    const response = await fetch(`${API_URL}/appointments${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });
    if (response.status === 204) return null;
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error con el turno");
    }
    return data;
}

export function getMyAppointments(token) {
    return appointmentsRequest("/me", token);
}

export function cancelAppointment(token, id) {
    return appointmentsRequest(`/${id}/cancel`, token, { method: "PATCH" });
}

export function rescheduleAppointment(token, id, startTime) {
    return appointmentsRequest(`/${id}/reschedule`, token, {
        method: "PATCH",
        body: JSON.stringify({ start_time: startTime }),
    });
}

export function getMyBookings(token) {
    return panelRequest("/appointments", token);
}

export function getPendingRequests(token) {
    return panelRequest("/requests", token);
}

// `message` es el texto que el profesional le escribe al cliente; si va vacío,
// el mail sale con el texto estándar.
export function acceptRequest(token, id, message) {
    return panelRequest(`/requests/${id}/accept`, token, {
        method: "PATCH",
        body: JSON.stringify({ message }),
    });
}

export function rejectRequest(token, id, message) {
    return panelRequest(`/requests/${id}/reject`, token, {
        method: "PATCH",
        body: JSON.stringify({ message }),
    });
}

export function acceptAllRequests(token, message) {
    return panelRequest("/requests/accept-all", token, {
        method: "POST",
        body: JSON.stringify({ message }),
    });
}

export function createBooking(token, bookingData) {
    return panelRequest("/appointments", token, {
        method: "POST",
        body: JSON.stringify(bookingData),
    });
}

export function cancelBooking(token, id, message) {
    return panelRequest(`/appointments/${id}/cancel`, token, {
        method: "PATCH",
        body: JSON.stringify({ message }),
    });
}

// Marca si el cliente vino (COMPLETED) o no (NO_SHOW). Solo vale para turnos ya
// pasados; no le manda ningún mail al cliente.
export function setAttendance(token, id, attended) {
    return panelRequest(`/appointments/${id}/attendance`, token, {
        method: "PATCH",
        body: JSON.stringify({ attended }),
    });
}

export function rescheduleBooking(token, id, startTime, message) {
    return panelRequest(`/appointments/${id}/reschedule`, token, {
        method: "PATCH",
        body: JSON.stringify({ start_time: startTime, message }),
    });
}

export function getPanelSettings(token) {
    return panelRequest("/settings", token);
}

export function updatePanelSettings(token, settings) {
    return panelRequest("/settings", token, {
        method: "PATCH",
        body: JSON.stringify(settings),
    });
}

export function changeMyPassword(token, passwords) {
    return panelRequest("/settings/password", token, {
        method: "PATCH",
        body: JSON.stringify(passwords),
    });
}

export function getMyAccount(token) {
    return panelRequest("/account", token);
}

export function updateMyAccount(token, accountData) {
    return panelRequest("/account", token, {
        method: "PATCH",
        body: JSON.stringify(accountData),
    });
}

export function completeOnboarding(token) {
    return panelRequest("/onboarding/complete", token, { method: "POST" });
}

export function getMyTeam(token) {
    return panelRequest("/team", token);
}

export function createTeamMember(token, memberData) {
    return panelRequest("/team", token, {
        method: "POST",
        body: JSON.stringify(memberData),
    });
}

export function updateTeamMember(token, id, memberData) {
    return panelRequest(`/team/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(memberData),
    });
}

export function deleteTeamMember(token, id) {
    return panelRequest(`/team/${id}`, token, { method: "DELETE" });
}

async function billingRequest(path, token, options = {}) {
    const response = await fetch(`${API_URL}/billing${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.message || "Error con la suscripción");
    }
    return data;
}

export function getMySubscription(token) {
    return billingRequest("/subscription", token);
}

// Devuelve `init_point`: la URL del checkout de Mercado Pago donde el
// profesional carga la tarjeta. El plan NO cambia acá, cambia cuando MP nos
// avisa por webhook que la suscripción quedó autorizada.
export function subscribeToPlan(token, plan) {
    return billingRequest("/subscribe", token, {
        method: "POST",
        body: JSON.stringify({ plan }),
    });
}

export function cancelSubscription(token) {
    return billingRequest("/cancel", token, { method: "POST" });
}

export function getMyAvailability(token) {
    return panelRequest("/availability", token);
}

// Guarda el día entero: `ranges` vacío deja el día cerrado y más de un rango
// significa que el día tiene cortes.
export function saveAvailabilityDay(token, { weekday, ranges }) {
    return panelRequest("/availability/day", token, {
        method: "PUT",
        body: JSON.stringify({ weekday, ranges }),
    });
}

export function getMyServices(token) {
    return panelRequest("/services", token);
}

export function createMyService(token, serviceData) {
    return panelRequest("/services", token, {
        method: "POST",
        body: JSON.stringify(serviceData),
    });
}

export function updateMyService(token, id, serviceData) {
    return panelRequest(`/services/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(serviceData),
    });
}

export function deleteMyService(token, id) {
    return panelRequest(`/services/${id}`, token, { method: "DELETE" });
}
