import { sendMail } from '../src/lib/mailer.js';

// `include` de Prisma con todo lo que estas plantillas necesitan nombrar (quién,
// con quién, qué servicio). Lo usan los servicios que disparan mails.
const notificationInclude = {
    client: { select: { firts_name: true, last_name: true, email: true, phone: true } },
    professional: {
        select: {
            firts_name: true,
            last_name: true,
            email: true,
            slug: true,
            notify_on_booking: true,
        },
    },
    professional_service: { select: { duration: true, service: { select: { name: true } } } },
};

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const TIME_ZONE = process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

// Los turnos se guardan en UTC; el mail lo lee una persona, así que se muestra
// en la zona horaria del negocio, no en la del server.
function formatDateTime(date) {
    return new Date(date).toLocaleString('es-AR', {
        timeZone: TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function fullName(person) {
    return `${person.firts_name} ${person.last_name}`;
}

// El texto que redacta el profesional termina dentro del HTML del mail: se
// escapa para que un "<" o un "&" no rompan (ni inyecten) el markup.
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Convierte el mensaje redactado a mano en HTML, respetando los saltos de
// línea que haya escrito el profesional.
function messageToHtml(message) {
    return escapeHtml(message.trim()).replace(/\r?\n/g, '<br>');
}

// Los clientes de mail ignoran <style> y las hojas externas, así que todo el
// estilo va inline.
function layout({ title, accent, intro, rows, cta }) {
    const rowsHtml = rows
        .filter(([, value]) => value)
        .map(
            ([label, value]) => `
                <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px;">${label}</td>
                    <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${value}</td>
                </tr>`
        )
        .join('');

    const ctaHtml = cta
        ? `<a href="${cta.href}" style="display:inline-block;margin-top:24px;background:${accent};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500;">${cta.label}</a>`
        : '';

    return `
<div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 8px;font-size:20px;color:${accent};">${title}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.5;">${intro}</p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #f1f5f9;">${rowsHtml}</table>
        ${ctaHtml}
    </div>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#94a3b8;text-align:center;">
        Este es un mensaje automático de Turnos.
    </p>
</div>`;
}

function appointmentRows(appointment) {
    return [
        ['Servicio', appointment.professional_service.service.name],
        ['Fecha y hora', formatDateTime(appointment.start_time)],
        ['Duración', `${appointment.professional_service.duration} min`],
        ['Notas', appointment.notes],
    ];
}

// Ningún mail debe tumbar la operación que lo dispara: si el turno se creó o se
// aceptó bien, un fallo de Resend se loguea y listo.
async function safeSend(payload) {
    try {
        return await sendMail(payload);
    } catch (error) {
        console.error(`[mail] falló el envío de "${payload.subject}" a ${payload.to}:`, error.message);
        return { failed: true };
    }
}

// Al profesional: alguien le reservó. El texto cambia según si el turno quedó
// esperando su decisión o si su modo automático ya lo confirmó.
const notifyProfessionalOfBooking = async (appointment) => {
    // El profesional puede apagar este aviso desde Configuración; el turno le
    // aparece igual en el panel. Los mails al cliente no se tocan.
    if (appointment.professional?.notify_on_booking === false) {
        return;
    }

    const client = appointment.client;
    const pending = appointment.status === 'PENDING';

    return safeSend({
        to: appointment.professional.email,
        subject: pending
            ? `Nuevo turno solicitado — ${formatDateTime(appointment.start_time)}`
            : `Nuevo turno confirmado — ${formatDateTime(appointment.start_time)}`,
        html: layout({
            title: pending ? 'Tenés un turno para revisar' : 'Nuevo turno en tu agenda',
            accent: '#4f46e5',
            intro: pending
                ? `<strong>${fullName(client)}</strong> solicitó un turno con vos. Entrá al panel para aceptarlo o rechazarlo.`
                : `<strong>${fullName(client)}</strong> reservó un turno y se confirmó automáticamente.`,
            rows: [
                ['Cliente', fullName(client)],
                ['Email', client.email],
                ['Teléfono', client.phone],
                ...appointmentRows(appointment),
            ],
            cta: pending
                ? { href: `${APP_URL}/panel/solicitudes`, label: 'Ver solicitudes' }
                : { href: `${APP_URL}/panel/calendario`, label: 'Ver mi calendario' },
        }),
    });
};

// Al cliente: el profesional aceptó (o el turno entró confirmado directo).
// `message` es el texto que el profesional redactó al aceptar; si no escribió
// nada (o si el turno se confirmó solo), va el texto estándar.
const notifyClientOfConfirmation = async (appointment, message) => {
    return safeSend({
        to: appointment.client.email,
        subject: `Turno confirmado — ${formatDateTime(appointment.start_time)}`,
        html: layout({
            title: '¡Tu turno fue confirmado!',
            accent: '#059669',
            intro: message
                ? messageToHtml(message)
                : `<strong>${fullName(appointment.professional)}</strong> confirmó tu turno. Te esperamos.`,
            rows: [
                ['Profesional', fullName(appointment.professional)],
                ...appointmentRows(appointment),
            ],
            cta: { href: `${APP_URL}/mis-turnos`, label: 'Ver mis turnos' },
        }),
    });
};

// Al cliente: el profesional rechazó la solicitud.
const notifyClientOfRejection = async (appointment, message) => {
    const slug = appointment.professional.slug;

    return safeSend({
        to: appointment.client.email,
        subject: `Turno cancelado — ${formatDateTime(appointment.start_time)}`,
        html: layout({
            title: 'Tu turno no pudo confirmarse',
            accent: '#e11d48',
            intro: message
                ? messageToHtml(message)
                : `<strong>${fullName(appointment.professional)}</strong> no pudo tomar el turno que pediste. Podés elegir otro horario cuando quieras.`,
            rows: [
                ['Profesional', fullName(appointment.professional)],
                ...appointmentRows(appointment),
            ],
            cta: slug ? { href: `${APP_URL}/turnos/${slug}`, label: 'Elegir otro horario' } : null,
        }),
    });
};

// El cliente sigue viendo la pantalla de confirmación mientras esto corre: no se
// espera el envío para responderle.
const notifyInBackground = (task) => {
    task.catch((error) => console.error('[mail] error inesperado:', error));
};

// Al cliente: el profesional dio de baja un turno que ya estaba tomado. Es
// distinto del rechazo de una solicitud (ese turno nunca llegó a existir para el
// cliente); acá había algo agendado y hay que ser claro con eso.
const notifyClientOfCancellationByProfessional = async (appointment, message) => {
    const slug = appointment.professional.slug;

    return safeSend({
        to: appointment.client.email,
        subject: `Se canceló tu turno — ${formatDateTime(appointment.start_time)}`,
        html: layout({
            title: 'Se canceló tu turno',
            accent: '#e11d48',
            intro: message
                ? messageToHtml(message)
                : `<strong>${fullName(appointment.professional)}</strong> tuvo que cancelar el turno que tenías reservado. Podés elegir otro horario cuando quieras.`,
            rows: [
                ['Profesional', fullName(appointment.professional)],
                ...appointmentRows(appointment),
            ],
            cta: slug ? { href: `${APP_URL}/turnos/${slug}`, label: 'Elegir otro horario' } : null,
        }),
    });
};

// Al cliente: el turno se movió. El mail lleva el horario nuevo, no el viejo.
const notifyClientOfReschedule = async (appointment, previousStart, message) => {
    const slug = appointment.professional.slug;

    return safeSend({
        to: appointment.client.email,
        subject: `Se movió tu turno — ${formatDateTime(appointment.start_time)}`,
        html: layout({
            title: 'Tu turno cambió de horario',
            accent: '#4f46e5',
            intro: message
                ? messageToHtml(message)
                : `<strong>${fullName(appointment.professional)}</strong> movió el turno que tenías reservado. Si no te sirve el horario nuevo, escribile.`,
            rows: [
                ['Profesional', fullName(appointment.professional)],
                ['Antes era', formatDateTime(previousStart)],
                ...appointmentRows(appointment),
            ],
            cta: slug ? { href: `${APP_URL}/turnos/${slug}`, label: 'Ver otros horarios' } : null,
        }),
    });
};

// Link para volver a entrar cuando alguien se olvidó la contraseña. No lleva
// ningún dato de la cuenta más que el nombre: si el mail llegó a la persona
// equivocada, no le sirve de nada salvo que también abra el link.
const notifyPasswordReset = async (user, resetUrl, expiresInHours) => {
    return safeSend({
        to: user.email,
        subject: 'Restablecer tu contraseña de Turnos',
        html: layout({
            title: 'Restablecer tu contraseña',
            accent: '#4f46e5',
            intro: `Hola ${escapeHtml(user.firts_name)}, pediste volver a entrar a tu cuenta. Tocá el botón para elegir una contraseña nueva.`,
            rows: [['El link vence en', `${expiresInHours} h`]],
            cta: { href: resetUrl, label: 'Elegir contraseña nueva' },
        }),
    });
};

// Link mágico: es el login del cliente, que nunca eligió una contraseña. Como
// el link ES la sesión, el mail no lleva ningún dato de los turnos: si llegó a
// la persona equivocada, no le muestra nada por sí solo.
const notifyMagicLink = async (user, accessUrl, expiresInMinutes) => {
    const result = await safeSend({
        to: user.email,
        subject: 'Tu link para ver tus turnos',
        html: layout({
            title: 'Entrá a ver tus turnos',
            accent: '#4f46e5',
            intro: `Hola ${escapeHtml(user.firts_name)}, tocá el botón para ver, reprogramar o cancelar tus turnos. No hace falta contraseña.`,
            rows: [
                ['El link vence en', `${expiresInMinutes} minutos`],
                ['Se puede usar', 'una sola vez'],
            ],
            cta: { href: accessUrl, label: 'Ver mis turnos' },
        }),
    });

    // Sin RESEND_API_KEY el mail no sale y el link queda inalcanzable: el flujo
    // sería imposible de probar en local. Solo se loguea cuando el envío está
    // apagado; con Resend configurado, el link nunca toca la consola.
    if (result?.skipped) {
        console.warn(`[mail] link de acceso para ${user.email}: ${accessUrl}`);
    }

    return result;
};

export {
    notificationInclude,
    notifyMagicLink,
    notifyProfessionalOfBooking,
    notifyClientOfConfirmation,
    notifyClientOfRejection,
    notifyClientOfCancellationByProfessional,
    notifyClientOfReschedule,
    notifyPasswordReset,
    notifyInBackground,
};
