// Catálogo de planes del lado del server.
//
// Existe aparte de `client/src/lib/plans.js` a propósito: el precio que se le
// cobra a alguien no puede venir del navegador. Si el monto llegara en el body
// del pedido, cualquiera podría abrir las devtools y suscribirse al plan
// NEGOCIO por un peso. Acá está el precio que manda; el del cliente es solo la
// vidriera (descripciones, features, orden de las columnas).
//
// Si cambiás un precio, cambialo en los dos archivos.
const PLANS = {
    INDIVIDUAL: { id: 'INDIVIDUAL', name: 'Individual', price: 9999 },
    EQUIPO: { id: 'EQUIPO', name: 'Equipo', price: 24999 },
    NEGOCIO: { id: 'NEGOCIO', name: 'Negocio', price: 49999 },
};

// Los ids coinciden con el enum Plan de la base, que es lo que guarda cada
// cuenta. El schema de zod valida contra esta lista.
const PLAN_IDS = Object.keys(PLANS);

const getPlan = (planId) => PLANS[planId] ?? null;

export { PLANS, PLAN_IDS, getPlan };
