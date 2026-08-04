// Catálogo de presentación de los planes. El precio que se cobra de verdad NO
// sale de acá: sale de `server/src/lib/plans.js`, porque un monto que viaja
// desde el navegador es un monto que cualquiera puede editar. Si cambiás un
// precio, cambialo en los dos archivos.
// El `id` coincide con el enum Plan de la base, que es lo que tiene cada cuenta.
export const PLANS = [
    {
        id: "INDIVIDUAL",
        name: "Individual",
        price: 9999,
        description: "Para un profesional que atiende solo.",
        features: [
            "1 profesional",
            "Turnos ilimitados",
            "Tu link de reserva propio",
            "Calendario y horarios de atención",
            "Servicios y precios propios",
        ],
    },
    {
        id: "EQUIPO",
        name: "Equipo",
        price: 24999,
        description: "Para consultorios o locales con varios profesionales.",
        features: [
            "Hasta 5 profesionales",
            "Todo lo del plan Individual",
            "Panel compartido del negocio",
            "Reportes de turnos",
            "Soporte por email prioritario",
        ],
        recommended: true,
    },
    {
        id: "NEGOCIO",
        name: "Negocio",
        price: 49999,
        description: "Para cadenas o negocios con muchos profesionales.",
        features: [
            "Profesionales ilimitados",
            "Todo lo del plan Equipo",
            "Marca personalizada (logo y colores)",
            "Soporte prioritario por WhatsApp",
            "Onboarding asistido",
        ],
    },
];

export function findPlan(planId) {
    return PLANS.find((plan) => plan.id === planId) ?? PLANS[0];
}

export function formatPrice(price) {
    return price.toLocaleString("es-AR");
}

// Espejo del enum SubscriptionStatus de la base. Es distinto del plan: el plan
// dice qué contrató, esto dice si lo está pagando.
export const SUBSCRIPTION_LABELS = {
    NONE: { text: "Sin suscripción", tone: "slate" },
    PENDING: { text: "Esperando el pago", tone: "amber" },
    AUTHORIZED: { text: "Activa", tone: "emerald" },
    PAUSED: { text: "Pausada", tone: "amber" },
    CANCELLED: { text: "Cancelada", tone: "rose" },
};

export function findSubscriptionLabel(status) {
    return SUBSCRIPTION_LABELS[status] ?? SUBSCRIPTION_LABELS.NONE;
}

// Los estados en los que hay algo que cancelar en Mercado Pago.
export function isSubscriptionCancellable(status) {
    return ["PENDING", "AUTHORIZED", "PAUSED"].includes(status);
}
