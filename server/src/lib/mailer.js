import { Resend } from 'resend';

// Sin RESEND_API_KEY el server tiene que seguir funcionando igual (tests,
// desarrollo local, alguien que clona el repo): en vez de romper, los mails se
// loguean por consola y se marcan como omitidos.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.MAIL_FROM || 'Turnos <onboarding@resend.dev>';

const sendMail = async ({ to, subject, html }) => {
    if (!resend) {
        console.warn(`[mail] RESEND_API_KEY no configurada, no se envió "${subject}" a ${to}`);
        return { skipped: true };
    }

    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

    if (error) {
        throw new Error(error.message || 'Error al enviar el email');
    }

    return data;
};

export { sendMail };
