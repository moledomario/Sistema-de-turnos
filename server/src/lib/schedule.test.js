import { describe, it, expect } from 'vitest';
import { zonedTime, zonedDayStart, weekdayOf, minutesOf, fitsInWindows } from './schedule.js';

// Estos helpers son los que traducen "de 9 a 18" (lo que el profesional carga en
// el panel) a instantes reales. Antes leían la zona del proceso, así que el
// mismo código daba horarios distintos corriendo en Buenos Aires que en un
// server UTC. Todos los tests pasan la zona explícita, así valen igual sin
// importar dónde corran.
const ARG = 'America/Argentina/Buenos_Aires'; // sin horario de verano
const MAD = 'Europe/Madrid'; // con horario de verano, para los bordes

describe('zonedTime', () => {
    it('traduce una hora de pared al instante real de esa zona', () => {
        // 09:00 en Argentina (UTC-3) son las 12:00 UTC.
        expect(zonedTime('2026-08-10', 540, ARG).toISOString()).toBe('2026-08-10T12:00:00.000Z');
    });

    it('la misma hora de pared en otra zona es otro instante', () => {
        expect(zonedTime('2026-08-10', 540, MAD).toISOString()).toBe('2026-08-10T07:00:00.000Z');
    });

    it('con 1440 minutos cae en la medianoche del día siguiente', () => {
        expect(zonedTime('2026-08-10', 24 * 60, ARG).toISOString()).toBe(
            zonedDayStart('2026-08-11', ARG).toISOString()
        );
    });

    it('zonedDayStart es la medianoche de la zona, no la de UTC', () => {
        expect(zonedDayStart('2026-08-10', ARG).toISOString()).toBe('2026-08-10T03:00:00.000Z');
    });
});

// El día en que arranca el horario de verano dura 23 h y la hora de las 02:00 no
// existe. Es el caso que rompe cualquier implementación que sume offsets fijos.
describe('zonedTime en el salto de horario de verano', () => {
    const DIA_DEL_SALTO = '2026-03-29'; // en Madrid, 02:00 -> 03:00

    it('antes del salto usa el offset de invierno', () => {
        expect(zonedTime(DIA_DEL_SALTO, 60, MAD).toISOString()).toBe('2026-03-29T00:00:00.000Z');
    });

    it('después del salto usa el de verano', () => {
        expect(zonedTime(DIA_DEL_SALTO, 180, MAD).toISOString()).toBe('2026-03-29T01:00:00.000Z');
    });

    // Por esto el fin del día se pide como "1440 minutos" y no como "+24 h": con
    // 24 h fijas el rango se pasaba una hora al día siguiente.
    it('ese día dura 23 horas, no 24', () => {
        const inicio = zonedTime(DIA_DEL_SALTO, 0, MAD);
        const fin = zonedTime(DIA_DEL_SALTO, 24 * 60, MAD);

        expect((fin - inicio) / 3_600_000).toBe(23);
    });
});

describe('weekdayOf', () => {
    // Un turno del domingo a la noche en Argentina cae en lunes si se lo lee en
    // UTC: sin esto se buscaba la disponibilidad del día equivocado.
    it('usa el día de la zona del negocio, no el de UTC', () => {
        const domingoALaNoche = zonedTime('2026-08-02', 22 * 60, ARG);

        expect(domingoALaNoche.toISOString()).toBe('2026-08-03T01:00:00.000Z'); // lunes en UTC
        expect(weekdayOf(domingoALaNoche, ARG)).toBe(0); // pero domingo para el negocio
    });

    it('lunes es 1', () => {
        expect(weekdayOf(zonedTime('2026-08-03', 540, ARG), ARG)).toBe(1);
    });
});

describe('minutesOf', () => {
    it('devuelve los minutos desde la medianoche de la zona del negocio', () => {
        expect(minutesOf(zonedTime('2026-08-10', 540, ARG), ARG)).toBe(540);
        expect(minutesOf(zonedTime('2026-08-02', 22 * 60, ARG), ARG)).toBe(1320);
    });
});

describe('fitsInWindows', () => {
    const nueveASeis = [{ start_minutes: 540, end_minutes: 1080 }];

    it('acepta un turno que entra entero en la franja', () => {
        const start = zonedTime('2026-08-10', 540, ARG);
        const end = new Date(start.getTime() + 30 * 60_000);

        expect(fitsInWindows(start, end, nueveASeis, ARG)).toBe(true);
    });

    it('rechaza uno que empieza dentro pero termina afuera', () => {
        const start = zonedTime('2026-08-10', 1060, ARG); // 17:40
        const end = new Date(start.getTime() + 30 * 60_000); // 18:10

        expect(fitsInWindows(start, end, nueveASeis, ARG)).toBe(false);
    });

    it('rechaza uno anterior a la apertura', () => {
        const start = zonedTime('2026-08-10', 480, ARG); // 08:00
        const end = new Date(start.getTime() + 30 * 60_000);

        expect(fitsInWindows(start, end, nueveASeis, ARG)).toBe(false);
    });
});
