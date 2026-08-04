import { z } from 'zod';

const availabilityQuerySchema = z.object({
    service_id: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
});

function validateAvailabilityQuery(query) {
    return availabilityQuerySchema.safeParse(query);
}

export { validateAvailabilityQuery };
