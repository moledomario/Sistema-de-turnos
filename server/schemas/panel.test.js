import { describe, it, expect } from 'vitest';
import {
    validateAvailabilityDay,
    validateProfessionalServiceCreate,
    validateProfessionalServiceUpdate,
    validateTeamMemberCreate,
    validateAccountUpdate,
} from './panel.js';

const day = (ranges) => validateAvailabilityDay({ weekday: 1, ranges });

describe('validateAvailabilityDay', () => {
    it('acepta un día con un solo bloque', () => {
        expect(day([{ start_minutes: 540, end_minutes: 1080 }]).success).toBe(true);
    });

    it('acepta un día partido en dos por un corte', () => {
        const result = day([
            { start_minutes: 540, end_minutes: 780 },
            { start_minutes: 960, end_minutes: 1200 },
        ]);

        expect(result.success).toBe(true);
    });

    it('acepta un día sin bloques (cerrado)', () => {
        expect(day([]).success).toBe(true);
    });

    it('rechaza un bloque que termina antes de empezar', () => {
        const result = day([{ start_minutes: 1080, end_minutes: 540 }]);

        expect(result.success).toBe(false);
    });

    it('rechaza bloques superpuestos aunque vengan desordenados', () => {
        const result = day([
            { start_minutes: 960, end_minutes: 1200 },
            { start_minutes: 540, end_minutes: 1020 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toMatch(/superponer/);
    });

    it('deja pegar dos bloques que se tocan justo (sin corte en el medio)', () => {
        const result = day([
            { start_minutes: 540, end_minutes: 780 },
            { start_minutes: 780, end_minutes: 1080 },
        ]);

        expect(result.success).toBe(true);
    });

    it('rechaza un weekday fuera de 0-6', () => {
        expect(validateAvailabilityDay({ weekday: 7, ranges: [] }).success).toBe(false);
    });
});

describe('validateProfessionalServiceCreate', () => {
    const base = { name: 'Consulta', duration: 30 };
    // Un pixel PNG, suficiente para que pase el formato de data URL.
    const imagen =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    it('acepta un servicio mínimo, sin foto ni seña', () => {
        expect(validateProfessionalServiceCreate(base).success).toBe(true);
    });

    it('acepta una imagen en data URL', () => {
        expect(validateProfessionalServiceCreate({ ...base, image: imagen }).success).toBe(true);
    });

    it('rechaza una imagen que no es data URL', () => {
        const result = validateProfessionalServiceCreate({
            ...base,
            image: 'https://example.com/foto.png',
        });

        expect(result.success).toBe(false);
    });

    it('rechaza una imagen más pesada que el tope', () => {
        const enorme = `data:image/jpeg;base64,${'A'.repeat(800_000)}`;

        expect(validateProfessionalServiceCreate({ ...base, image: enorme }).success).toBe(false);
    });

    it('exige datos de la cuenta si el servicio pide seña', () => {
        const result = validateProfessionalServiceCreate({ ...base, requires_deposit: true });

        expect(result.success).toBe(false);
        expect(result.error.issues[0].path).toEqual(['bank_details']);
    });

    it('no acepta datos de la cuenta en blanco cuando pide seña', () => {
        const result = validateProfessionalServiceCreate({
            ...base,
            requires_deposit: true,
            bank_details: '   ',
        });

        expect(result.success).toBe(false);
    });

    it('exige el monto si el servicio pide seña', () => {
        const result = validateProfessionalServiceCreate({
            ...base,
            requires_deposit: true,
            bank_details: 'Alias: mi.alias',
        });

        expect(result.success).toBe(false);
        expect(result.error.issues[0].path).toEqual(['deposit_amount']);
    });

    it('rechaza una seña de cero o negativa', () => {
        const conMonto = (deposit_amount) =>
            validateProfessionalServiceCreate({
                ...base,
                requires_deposit: true,
                bank_details: 'Alias: mi.alias',
                deposit_amount,
            });

        expect(conMonto(0).success).toBe(false);
        expect(conMonto(-500).success).toBe(false);
    });

    it('acepta seña con monto y datos de la cuenta', () => {
        const result = validateProfessionalServiceCreate({
            ...base,
            requires_deposit: true,
            deposit_amount: 2000,
            bank_details: 'Alias: mi.alias',
        });

        expect(result.success).toBe(true);
    });

    it('no pide monto si el servicio no lleva seña', () => {
        expect(
            validateProfessionalServiceCreate({ ...base, requires_deposit: false }).success
        ).toBe(true);
    });

    it('no pide cuenta si el servicio no lleva seña', () => {
        expect(
            validateProfessionalServiceCreate({ ...base, requires_deposit: false }).success
        ).toBe(true);
    });
});

describe('validateTeamMemberCreate', () => {
    it('acepta un profesional con solo el nombre', () => {
        expect(validateTeamMemberCreate({ name: 'Ana' }).success).toBe(true);
    });

    it('rechaza un nombre vacío o en blanco', () => {
        expect(validateTeamMemberCreate({ name: '   ' }).success).toBe(false);
        expect(validateTeamMemberCreate({}).success).toBe(false);
    });

    it('rechaza una descripción más larga que el tope', () => {
        const result = validateTeamMemberCreate({ name: 'Ana', description: 'x'.repeat(301) });

        expect(result.success).toBe(false);
    });

    it('rechaza una foto que no es data URL', () => {
        const result = validateTeamMemberCreate({ name: 'Ana', image: 'https://example.com/a.png' });

        expect(result.success).toBe(false);
    });
});

describe('validateAccountUpdate', () => {
    it('acepta nombre y apellido, con teléfono opcional', () => {
        expect(validateAccountUpdate({ firts_name: 'Ana', last_name: 'Pérez' }).success).toBe(true);
        expect(
            validateAccountUpdate({ firts_name: 'Ana', last_name: 'Pérez', phone: null }).success
        ).toBe(true);
    });

    it('rechaza dejar el nombre en blanco', () => {
        const result = validateAccountUpdate({ firts_name: '  ', last_name: 'Pérez' });

        expect(result.success).toBe(false);
    });

    it('acepta la foto del local y su descripción', () => {
        const result = validateAccountUpdate({
            firts_name: 'Ana',
            last_name: 'Pérez',
            image: 'data:image/png;base64,iVBORw0KGgo=',
            description: 'Peluquería en Palermo, atendemos con turno previo.',
        });

        expect(result.success).toBe(true);
    });

    it('deja sacar la foto y la descripción con null', () => {
        const result = validateAccountUpdate({
            firts_name: 'Ana',
            last_name: 'Pérez',
            image: null,
            description: null,
        });

        expect(result.success).toBe(true);
    });

    it('rechaza una descripción más larga que el tope', () => {
        const result = validateAccountUpdate({
            firts_name: 'Ana',
            last_name: 'Pérez',
            description: 'x'.repeat(501),
        });

        expect(result.success).toBe(false);
    });

    it('normaliza el link de reserva a minúsculas', () => {
        const result = validateAccountUpdate({
            firts_name: 'Ana',
            last_name: 'Pérez',
            slug: '  Ana-Perez  ',
        });

        expect(result.success).toBe(true);
        expect(result.data.slug).toBe('ana-perez');
    });

    it('rechaza links con espacios, acentos o símbolos', () => {
        const base = { firts_name: 'Ana', last_name: 'Pérez' };

        expect(validateAccountUpdate({ ...base, slug: 'ana perez' }).success).toBe(false);
        expect(validateAccountUpdate({ ...base, slug: 'ana-pérez' }).success).toBe(false);
        expect(validateAccountUpdate({ ...base, slug: 'ana_perez' }).success).toBe(false);
        expect(validateAccountUpdate({ ...base, slug: '-ana-' }).success).toBe(false);
        expect(validateAccountUpdate({ ...base, slug: 'ab' }).success).toBe(false);
    });

    it('ignora los campos que no se pueden cambiar desde el panel', () => {
        const result = validateAccountUpdate({
            firts_name: 'Ana',
            last_name: 'Pérez',
            email: 'otro@mail.com',
            role: 'ADMIN',
            plan: 'NEGOCIO',
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ firts_name: 'Ana', last_name: 'Pérez' });
    });
});

describe('validateProfessionalServiceUpdate', () => {
    it('deja vaciar la foto y el precio con null', () => {
        const result = validateProfessionalServiceUpdate({ image: null, price: null });

        expect(result.success).toBe(true);
    });

    it('sigue exigiendo la cuenta al activar la seña', () => {
        expect(validateProfessionalServiceUpdate({ requires_deposit: true }).success).toBe(false);
    });

    it('deja apagar la seña sin mandar la cuenta', () => {
        expect(validateProfessionalServiceUpdate({ requires_deposit: false }).success).toBe(true);
    });
});
