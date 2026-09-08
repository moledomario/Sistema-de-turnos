// Quién puede usar la app y quién no.
//
// El permiso sale de dos campos que son cosas distintas a propósito
// (ver el comentario de `plan` en el schema):
//   - `subscription_status`: si está pagando hoy.
//   - `trial_ends_at`: hasta cuándo puede usarla sin pagar.
// `plan` NO entra acá: dice qué contrató, no si tiene derecho a entrar.
//
// Vive en un archivo aparte y sin Prisma adentro para que la regla exista una
// sola vez (la usan el middleware del panel y el alta de turnos públicos) y
// para poder testearla con objetos comunes, igual que schedule.js.

// Días de prueba de una cuenta nueva.
const TRIAL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// Fin de la prueba para una cuenta que se crea en `from`.
//
// Suma 14 × 24 h, no "14 días de calendario". La diferencia solo aparece si en
// el medio hay cambio de horario de verano, y ahí la prueba termina una hora
// antes o después de la hora en que se creó la cuenta. Para un plazo de dos
// semanas eso da igual — es distinto de los horarios de atención, donde la
// zona del negocio sí es determinante (ver src/lib/schedule.js).
const trialEndsAt = (from = new Date()) => new Date(from.getTime() + TRIAL_DAYS * DAY_MS);

// Días que le quedan de prueba, redondeando para arriba: con 12 horas por
// delante querés leer "te queda 1 día", no "te quedan 0".
const trialDaysLeft = (trialEnd, now) => {
    const remaining = trialEnd.getTime() - now;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / DAY_MS);
};

// Estado de acceso de una cuenta. `user` necesita solo `subscription_status` y
// `trial_ends_at`; se le puede pasar el objeto entero de Prisma o un select
// chiquito. `now` es inyectable para poder testear los bordes sin esperar.
//
// `reason` es un código estable: el front lo traduce a un mensaje, así que
// cambiarlo rompe la UI.
const getAccessState = (user, now = Date.now()) => {
    const trialEnd = user?.trial_ends_at ? new Date(user.trial_ends_at) : null;
    const hadTrial = Boolean(trialEnd);
    const trialActive = hadTrial && trialEnd.getTime() > now;

    const base = {
        trial_ends_at: trialEnd,
        trial_days_left: hadTrial ? trialDaysLeft(trialEnd, now) : null,
    };

    // Pagando al día. Es el único estado de MP que habilita: PAUSED es lo que
    // pone Mercado Pago cuando la tarjeta rebota, así que tratarlo como activo
    // sería regalar el servicio a cualquiera que deje de tener fondos. Igual no
    // corta de un día para el otro si la prueba sigue viva: cae al caso de
    // abajo y la prueba lo cubre.
    if (user?.subscription_status === 'AUTHORIZED') {
        return { ...base, active: true, reason: 'subscription' };
    }

    if (trialActive) {
        return { ...base, active: true, reason: 'trial' };
    }

    // Se distingue "se te venció la prueba" de "nunca tuviste" porque el
    // mensaje que corresponde es distinto, y porque una cuenta que canceló
    // después de haber pagado no tiene que leer "empezá tu prueba".
    return { ...base, active: false, reason: hadTrial ? 'trial_expired' : 'no_access' };
};

const hasActiveAccess = (user, now = Date.now()) => getAccessState(user, now).active;

// Lo que necesita `getAccessState`, para reusar en los `select` de Prisma y no
// olvidarse un campo (si falta `trial_ends_at`, la cuenta se lee como vencida).
const accessSelect = {
    subscription_status: true,
    trial_ends_at: true,
};

export {
    TRIAL_DAYS,
    trialEndsAt,
    trialDaysLeft,
    getAccessState,
    hasActiveAccess,
    accessSelect,
};
