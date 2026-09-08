import { describe, it, expect } from 'vitest';
import {
    TRIAL_DAYS,
    trialEndsAt,
    trialDaysLeft,
    getAccessState,
    hasActiveAccess,
    accessSelect,
} from './access.js';

// Esta es la regla que decide quién puede usar la app, así que se testea con
// `now` explícito en vez de con el reloj del sistema: los bordes (el instante
// exacto en que vence la prueba) son justamente lo que hay que fijar, y con el
// reloj real no se pueden escribir.
const AHORA = new Date('2026-08-07T12:00:00.000Z').getTime();

const DIA = 24 * 60 * 60 * 1000;

// Azúcar para leer los casos: "una prueba que vence en 3 días".
const enDias = (dias) => new Date(AHORA + dias * DIA);

describe('trialEndsAt', () => {
    it('deja la prueba a 14 días de la fecha de alta', () => {
        const alta = new Date('2026-08-07T12:00:00.000Z');
        expect(trialEndsAt(alta).toISOString()).toBe('2026-08-21T12:00:00.000Z');
    });

    it('TRIAL_DAYS es lo que efectivamente suma', () => {
        const alta = new Date('2026-01-01T00:00:00.000Z');
        const fin = trialEndsAt(alta);
        expect((fin.getTime() - alta.getTime()) / DIA).toBe(TRIAL_DAYS);
    });
});

describe('trialDaysLeft', () => {
    it('redondea para arriba: con 12 h por delante queda 1 día', () => {
        expect(trialDaysLeft(new Date(AHORA + DIA / 2), AHORA)).toBe(1);
    });

    it('cuenta exacto cuando faltan días enteros', () => {
        expect(trialDaysLeft(enDias(5), AHORA)).toBe(5);
    });

    it('una prueba vencida da 0, no un número negativo', () => {
        expect(trialDaysLeft(enDias(-3), AHORA)).toBe(0);
    });

    it('el instante exacto del vencimiento ya es 0', () => {
        expect(trialDaysLeft(new Date(AHORA), AHORA)).toBe(0);
    });
});

describe('getAccessState: quién entra', () => {
    it('con la suscripción autorizada entra, aunque la prueba haya vencido', () => {
        const state = getAccessState(
            { subscription_status: 'AUTHORIZED', trial_ends_at: enDias(-30) },
            AHORA
        );

        expect(state.active).toBe(true);
        expect(state.reason).toBe('subscription');
    });

    it('con la prueba vigente entra, aunque no haya suscripción', () => {
        const state = getAccessState(
            { subscription_status: 'NONE', trial_ends_at: enDias(5) },
            AHORA
        );

        expect(state.active).toBe(true);
        expect(state.reason).toBe('trial');
        expect(state.trial_days_left).toBe(5);
    });

    // PAUSED es lo que pone Mercado Pago cuando la tarjeta rebota. No habilita
    // por sí solo, pero tampoco corta de golpe si la prueba sigue viva.
    it('PAUSED no habilita, pero la prueba vigente lo cubre', () => {
        const conPrueba = getAccessState(
            { subscription_status: 'PAUSED', trial_ends_at: enDias(2) },
            AHORA
        );
        expect(conPrueba.active).toBe(true);
        expect(conPrueba.reason).toBe('trial');

        const sinPrueba = getAccessState(
            { subscription_status: 'PAUSED', trial_ends_at: enDias(-1) },
            AHORA
        );
        expect(sinPrueba.active).toBe(false);
    });

    it('PENDING no habilita: creó la suscripción pero todavía no pagó', () => {
        const state = getAccessState(
            { subscription_status: 'PENDING', trial_ends_at: enDias(-1) },
            AHORA
        );

        expect(state.active).toBe(false);
    });

    it('cancelada con la prueba vencida no entra', () => {
        const state = getAccessState(
            { subscription_status: 'CANCELLED', trial_ends_at: enDias(-1) },
            AHORA
        );

        expect(state.active).toBe(false);
        expect(state.reason).toBe('trial_expired');
    });
});

describe('getAccessState: el borde del vencimiento', () => {
    it('un milisegundo antes de vencer todavía entra', () => {
        const state = getAccessState(
            { subscription_status: 'NONE', trial_ends_at: new Date(AHORA + 1) },
            AHORA
        );

        expect(state.active).toBe(true);
    });

    // El instante exacto cuenta como vencido: si no, una prueba "hasta las
    // 12:00" seguiría abierta a las 12:00 en punto.
    it('en el instante exacto del vencimiento ya no entra', () => {
        const state = getAccessState(
            { subscription_status: 'NONE', trial_ends_at: new Date(AHORA) },
            AHORA
        );

        expect(state.active).toBe(false);
        expect(state.reason).toBe('trial_expired');
    });
});

describe('getAccessState: motivos', () => {
    it('distingue "se venció" de "nunca tuvo"', () => {
        const vencida = getAccessState(
            { subscription_status: 'NONE', trial_ends_at: enDias(-1) },
            AHORA
        );
        expect(vencida.reason).toBe('trial_expired');

        const nunca = getAccessState({ subscription_status: 'NONE', trial_ends_at: null }, AHORA);
        expect(nunca.reason).toBe('no_access');
        expect(nunca.trial_days_left).toBe(null);
    });

    // La regla se aplica sobre lo que venga de un select de Prisma; si el
    // select se olvida un campo, no puede explotar: tiene que negar el acceso.
    it('sin usuario, o con el objeto vacío, no da acceso en vez de romper', () => {
        expect(getAccessState(null, AHORA).active).toBe(false);
        expect(getAccessState(undefined, AHORA).active).toBe(false);
        expect(getAccessState({}, AHORA).active).toBe(false);
        expect(getAccessState({}, AHORA).reason).toBe('no_access');
    });

    it('acepta la fecha como string, que es como viaja en JSON', () => {
        const state = getAccessState(
            { subscription_status: 'NONE', trial_ends_at: enDias(3).toISOString() },
            AHORA
        );

        expect(state.active).toBe(true);
        expect(state.trial_days_left).toBe(3);
    });
});

describe('hasActiveAccess', () => {
    it('es el `active` de getAccessState', () => {
        const conAcceso = { subscription_status: 'AUTHORIZED', trial_ends_at: null };
        const sinAcceso = { subscription_status: 'NONE', trial_ends_at: enDias(-1) };

        expect(hasActiveAccess(conAcceso, AHORA)).toBe(true);
        expect(hasActiveAccess(sinAcceso, AHORA)).toBe(false);
    });
});

describe('accessSelect', () => {
    // Si alguien saca un campo de acá, las cuentas se empiezan a leer como
    // vencidas en silencio. Este test es para que se entere por un test rojo.
    it('pide exactamente los campos que lee la regla', () => {
        expect(accessSelect).toEqual({
            subscription_status: true,
            trial_ends_at: true,
        });
    });
});
