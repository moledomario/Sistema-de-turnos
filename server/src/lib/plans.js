// Catálogo de planes del lado del server.
//
// Existe aparte de `client/src/lib/plans.js` a propósito: el precio que se le
// cobra a alguien no puede venir del navegador. Si el monto llegara en el body
// del pedido, cualquiera podría abrir las devtools y suscribirse al plan
// NEGOCIO por un peso. Acá está el precio que manda; el del cliente es solo la
// vidriera (descripciones, features, orden de las columnas).
//
// Si cambiás un precio, cambialo en los dos archivos.
// `maxMembers` en null es "sin límite". Es lo único que hoy diferencia de
// verdad a un plan de otro, así que el precio y este número van juntos: si
// cambiás uno sin mirar el otro, los planes dejan de tener sentido.
const PLANS = {
    INDIVIDUAL: { id: 'INDIVIDUAL', name: 'Individual', price: 9999, maxMembers: 1 },
    EQUIPO: { id: 'EQUIPO', name: 'Equipo', price: 24999, maxMembers: 5 },
    NEGOCIO: { id: 'NEGOCIO', name: 'Negocio', price: 49999, maxMembers: null },
};

// Cuántos profesionales puede tener una cuenta que está en la prueba gratis.
//
// No se usa su `plan` (que arranca en INDIVIDUAL y permitiría uno solo) porque
// entonces nadie podría probar el equipo antes de pagarlo, que es justo lo que
// tiene que decidir durante la prueba. Se le da el límite del plan Equipo.
//
// Contrapartida asumida: alguien puede cargar 5 profesionales en la prueba y
// después suscribirse a Individual. En ese caso NO se le borra nada (destruir
// datos en silencio no es una opción) — simplemente no puede crear más, y el
// panel le muestra que está por encima de su plan.
const TRIAL_MAX_MEMBERS = PLANS.EQUIPO.maxMembers;

// Los ids coinciden con el enum Plan de la base, que es lo que guarda cada
// cuenta. El schema de zod valida contra esta lista.
const PLAN_IDS = Object.keys(PLANS);

const getPlan = (planId) => PLANS[planId] ?? null;

// Tope de profesionales de una cuenta, según si está pagando o de prueba.
// `access` es lo que devuelve getAccessState (src/lib/access.js).
const maxMembersFor = (user, access) => {
    // Con la suscripción al día manda el plan contratado. En cualquier otro
    // caso (prueba corriendo) manda el tope de prueba: no se mira `plan`
    // porque hasta que MP no confirma el pago, ese campo sigue en el default.
    if (access?.reason === 'subscription') {
        const plan = getPlan(user?.plan);
        // Ojo con el `??` acá: NEGOCIO tiene maxMembers en null a propósito
        // ("sin tope"), y `null ?? 1` da 1. Hay que distinguir "el plan no
        // existe" de "el plan no tiene límite", que es lo que hace este if.
        if (!plan) return PLANS.INDIVIDUAL.maxMembers;
        return plan.maxMembers;
    }

    return TRIAL_MAX_MEMBERS;
};

export { PLANS, PLAN_IDS, TRIAL_MAX_MEMBERS, getPlan, maxMembersFor };
