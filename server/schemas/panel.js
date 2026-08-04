import { z } from 'zod';
import { imageDataUrlSchema } from './image.js';

// Si el servicio pide seña, el cliente necesita saber cuánto transferir y a
// dónde: los dos campos son obligatorios. Vale al crear y al editar, y por eso
// el formulario manda siempre los tres juntos.
const depositNeedsBankDetails = (data) =>
    data.requires_deposit !== true || Boolean(data.bank_details?.trim());

const depositRefinement = {
    message: 'Poné los datos de la cuenta donde el cliente tiene que transferir la seña',
    path: ['bank_details'],
};

const depositNeedsAmount = (data) =>
    data.requires_deposit !== true || (data.deposit_amount ?? 0) > 0;

const depositAmountRefinement = {
    message: 'Poné de cuánto es la seña',
    path: ['deposit_amount'],
};

const availabilitySchema = z.object({
    weekday: z.number().int().min(0).max(6),
    start_minutes: z.number().int().min(0).max(1439),
    end_minutes: z.number().int().min(0).max(1440),
}).refine((data) => data.end_minutes > data.start_minutes, {
    message: 'El horario de fin debe ser posterior al de inicio',
    path: ['end_minutes'],
});

const availabilityRangeSchema = z.object({
    start_minutes: z.number().int().min(0).max(1439),
    end_minutes: z.number().int().min(1).max(1440),
}).refine((range) => range.end_minutes > range.start_minutes, {
    message: 'El horario de fin debe ser posterior al de inicio',
    path: ['end_minutes'],
});

// El día entero de una: sin bloques es un día cerrado, y con más de uno el día
// tiene cortes (ej. 09:00-13:00 y 16:00-20:00, con el corte en el medio).
const availabilityDaySchema = z.object({
    weekday: z.number().int().min(0).max(6),
    ranges: z.array(availabilityRangeSchema).max(6, 'Demasiados bloques para un mismo día'),
}).refine((data) => {
    const sorted = [...data.ranges].sort((a, b) => a.start_minutes - b.start_minutes);
    return sorted.every((range, i) => i === 0 || range.start_minutes >= sorted[i - 1].end_minutes);
}, {
    message: 'Los bloques de un mismo día no se pueden superponer',
    path: ['ranges'],
});

const professionalServiceCreateSchema = z.object({
    service_id: z.string().optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    duration: z.number().int().min(5, 'La duración mínima es 5 minutos'),
    price: z.number().int().nonnegative().optional(),
    image: imageDataUrlSchema.optional(),
    requires_deposit: z.boolean().optional(),
    deposit_amount: z.number().int().positive('La seña tiene que ser mayor a cero').optional(),
    bank_details: z.string().trim().max(500, 'Los datos de la cuenta son demasiado largos').optional(),
}).refine((data) => data.service_id || data.name, {
    message: 'Elegí un servicio existente o escribí uno nuevo',
    path: ['name'],
}).refine(depositNeedsBankDetails, depositRefinement)
    .refine(depositNeedsAmount, depositAmountRefinement);

// En la edición todo es opcional, y `null` sirve para vaciar un campo (sacar la
// foto, borrar el precio) sin confundirlo con "no lo mandes".
const professionalServiceUpdateSchema = z.object({
    duration: z.number().int().min(5, 'La duración mínima es 5 minutos').optional(),
    price: z.number().int().nonnegative().nullable().optional(),
    image: imageDataUrlSchema.nullable().optional(),
    requires_deposit: z.boolean().optional(),
    deposit_amount: z
        .number()
        .int()
        .positive('La seña tiene que ser mayor a cero')
        .nullable()
        .optional(),
    bank_details: z.string().trim().max(500, 'Los datos de la cuenta son demasiado largos').nullable().optional(),
}).refine(depositNeedsBankDetails, depositRefinement)
    .refine(depositNeedsAmount, depositAmountRefinement);

// Todos los campos son opcionales para que la pantalla de configuración pueda
// mandar solo lo que cambió, sin pisar el resto.
const settingsUpdateSchema = z
    .object({
        auto_accept: z.boolean().optional(),
        min_notice_hours: z
            .number()
            .int()
            .min(0)
            .max(720, 'La antelación mínima no puede pasar de 30 días')
            .optional(),
        max_days_ahead: z
            .number()
            .int()
            .min(1, 'Tiene que poderse reservar al menos con un día')
            .max(365, 'El máximo es un año')
            .optional(),
        cancel_notice_hours: z
            .number()
            .int()
            .min(0)
            .max(720, 'El límite para cancelar no puede pasar de 30 días')
            .optional(),
        notify_on_booking: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'No hay nada para actualizar',
    });

const passwordChangeSchema = z.object({
    current_password: z.string().min(1, 'Escribí tu contraseña actual'),
    new_password: z.string().min(8, 'La contraseña nueva debe tener al menos 8 caracteres'),
});

// Datos de la cuenta que el dueño puede corregir desde el panel. El email y el
// rol quedan afuera a propósito: tocan la sesión y el login.
const accountUpdateSchema = z.object({
    firts_name: z.string().trim().min(1, 'El nombre no puede quedar vacío').max(80),
    last_name: z.string().trim().min(1, 'El apellido no puede quedar vacío').max(80),
    phone: z.string().trim().max(30).nullable().optional(),
    image: imageDataUrlSchema.nullable().optional(),
    description: z
        .string()
        .trim()
        .max(500, 'La descripción es demasiado larga')
        .nullable()
        .optional(),
    // El slug es la parte pública del link de reserva, así que se normaliza
    // antes de validarlo: quien lo escribe no tiene por qué saber el formato.
    slug: z
        .string()
        .trim()
        .transform((value) => value.toLowerCase())
        .pipe(
            z
                .string()
                .min(3, 'El link tiene que tener al menos 3 caracteres')
                .max(40, 'El link es demasiado largo')
                .regex(
                    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                    'Usá solo letras, números y guiones (sin espacios ni acentos)'
                )
        )
        .optional(),
});

const teamMemberCreateSchema = z.object({
    name: z.string().trim().min(1, 'Ponele un nombre al profesional').max(80),
    description: z.string().trim().max(300, 'La descripción es demasiado larga').optional(),
    image: imageDataUrlSchema.optional(),
});

// Igual que en servicios, `null` sirve para vaciar un campo.
const teamMemberUpdateSchema = z.object({
    name: z.string().trim().min(1, 'Ponele un nombre al profesional').max(80).optional(),
    description: z.string().trim().max(300, 'La descripción es demasiado larga').nullable().optional(),
    image: imageDataUrlSchema.nullable().optional(),
});

// El mensaje que el profesional le manda al cliente al aceptar o rechazar. Es
// opcional: sin él, el mail sale con el texto estándar.
const requestResponseSchema = z.object({
    message: z.string().trim().max(1000, 'El mensaje es demasiado largo').optional(),
});

// Si el cliente vino o no. Es obligatorio y booleano a propósito: no hay un
// valor por defecto razonable, marcar asistencia es siempre una decisión
// explícita del profesional.
const attendanceSchema = z.object({
    attended: z.boolean({ message: 'Indicá si el cliente vino o no' }),
});

// Turno cargado a mano desde el panel. El email del cliente es opcional: muchos
// de estos turnos se toman por teléfono o en el mostrador, y si no lo dan el
// turno se agenda igual (sin mail de confirmación).
const bookingCreateSchema = z.object({
    service_id: z.string().min(1, 'Elegí un servicio'),
    start_time: z
        .string()
        .transform((value) => new Date(value))
        .refine((date) => !Number.isNaN(date.getTime()), 'La fecha no es válida'),
    notes: z.string().trim().max(1000).optional(),
    client: z.object({
        firts_name: z.string().trim().min(1, 'Poné el nombre del cliente').max(80),
        last_name: z.string().trim().max(80).optional().default(''),
        email: z.string().email('Email inválido').optional(),
        phone: z.string().trim().max(30).optional(),
    }),
});

function validateBookingCreate(data) {
    return bookingCreateSchema.safeParse(data);
}

// El profesional mueve un turno de su agenda. El mensaje es el mismo campo
// opcional que ya usa para aceptar o rechazar solicitudes.
const bookingRescheduleSchema = z.object({
    start_time: z
        .string()
        .transform((value) => new Date(value))
        .refine((date) => !Number.isNaN(date.getTime()), 'La fecha no es válida'),
    message: z.string().trim().max(1000, 'El mensaje es demasiado largo').optional(),
});

function validateBookingReschedule(data) {
    return bookingRescheduleSchema.safeParse(data);
}

function validateAttendance(data) {
    return attendanceSchema.safeParse(data ?? {});
}

function validateRequestResponse(data) {
    return requestResponseSchema.safeParse(data ?? {});
}

function validateSettingsUpdate(data) {
    return settingsUpdateSchema.safeParse(data);
}

function validatePasswordChange(data) {
    return passwordChangeSchema.safeParse(data);
}

function validateAccountUpdate(data) {
    return accountUpdateSchema.safeParse(data);
}

function validateTeamMemberCreate(data) {
    return teamMemberCreateSchema.safeParse(data);
}

function validateTeamMemberUpdate(data) {
    return teamMemberUpdateSchema.safeParse(data);
}

function validateAvailabilityCreate(data) {
    return availabilitySchema.safeParse(data);
}

function validateAvailabilityDay(data) {
    return availabilityDaySchema.safeParse(data);
}

function validateProfessionalServiceCreate(data) {
    return professionalServiceCreateSchema.safeParse(data);
}

function validateProfessionalServiceUpdate(data) {
    return professionalServiceUpdateSchema.safeParse(data);
}

export {
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
};
