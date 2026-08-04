import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const { sendMail } = await import('../src/lib/mailer.js');
const { notifyClientOfConfirmation, notifyClientOfRejection } = await import('./notification.service.js');

const appointment = {
    start_time: new Date('2026-08-02T12:00:00.000Z'),
    notes: null,
    client: { firts_name: 'Bruno', last_name: 'Gomez', email: 'bruno@test.com', phone: null },
    professional: { firts_name: 'Lucia', last_name: 'Peluquera', email: 'lucia@test.com', slug: 'lucia-peluquera' },
    professional_service: { duration: 45, service: { name: 'Corte y barba' } },
};

const lastHtml = () => sendMail.mock.calls.at(-1)[0].html;

beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({});
});

describe('mensaje redactado por el profesional', () => {
    it('reemplaza el texto estándar del mail de confirmación', async () => {
        await notifyClientOfConfirmation(appointment, 'Te espero con el mate listo');

        expect(lastHtml()).toContain('Te espero con el mate listo');
        expect(lastHtml()).not.toContain('confirmó tu turno');
    });

    it('usa el texto estándar si no se redactó nada', async () => {
        await notifyClientOfRejection(appointment);

        expect(lastHtml()).toContain('no pudo tomar el turno que pediste');
    });

    it('escapa el HTML del mensaje en vez de inyectarlo', async () => {
        await notifyClientOfConfirmation(appointment, '<script>alert(1)</script> 5 < 10 & listo');

        const html = lastHtml();
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('5 &lt; 10 &amp; listo');
    });

    it('respeta los saltos de línea', async () => {
        await notifyClientOfConfirmation(appointment, 'Primera línea\nSegunda línea');

        expect(lastHtml()).toContain('Primera línea<br>Segunda línea');
    });

    it('el mail sigue llevando los datos del turno además del mensaje', async () => {
        await notifyClientOfConfirmation(appointment, 'Nos vemos');

        const html = lastHtml();
        expect(html).toContain('Corte y barba');
        expect(html).toContain('45 min');
    });

    it('un fallo del envío no se propaga a quien aceptó el turno', async () => {
        sendMail.mockRejectedValue(new Error('Resend caído'));

        await expect(notifyClientOfConfirmation(appointment, 'Nos vemos')).resolves.toEqual({
            failed: true,
        });
    });
});
