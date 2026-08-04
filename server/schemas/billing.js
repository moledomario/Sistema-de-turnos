import { z } from 'zod';
import { PLAN_IDS } from '../src/lib/plans.js';

// El plan es lo único que manda el front. El precio NO viaja en el pedido: sale
// del catálogo del server (src/lib/plans.js), porque si no cualquiera edita el
// body y se suscribe al plan más caro por dos pesos.
const subscribeSchema = z.object({
    plan: z.enum(PLAN_IDS),
});

function validateSubscribe(data) {
    return subscribeSchema.safeParse(data ?? {});
}

export { validateSubscribe };
