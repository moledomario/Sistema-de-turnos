import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole, optionalAuth } from './auth.middleware.js';

const mockRes = () => {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
};

beforeEach(() => {
    process.env.JWT_SECRET = 'secreto-de-test';
});

const tokenPara = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });

describe('requireAuth', () => {
    it('corta con 401 si no viene el header', () => {
        const res = mockRes();
        const next = vi.fn();

        requireAuth({ headers: {} }, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('corta con 401 si el token está firmado con otro secreto', () => {
        const res = mockRes();
        const next = vi.fn();
        const ajeno = jwt.sign({ sub: 'x' }, 'otro-secreto');

        requireAuth({ headers: { authorization: `Bearer ${ajeno}` } }, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('deja pasar y expone el payload en req.user', () => {
        const req = { headers: { authorization: `Bearer ${tokenPara({ sub: 'u1', role: 'USER' })}` } };
        const next = vi.fn();

        requireAuth(req, mockRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toMatchObject({ sub: 'u1', role: 'USER' });
    });
});

describe('requireRole', () => {
    // Lo que protege GET /appointments, que devuelve los turnos de todos los
    // profesionales con los datos de contacto de sus clientes.
    it('corta con 403 si el rol no está en la lista', () => {
        const res = mockRes();
        const next = vi.fn();

        requireRole('ADMIN')({ user: { role: 'PROFESSIONAL' } }, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('corta con 403 si no hay usuario en el request', () => {
        const res = mockRes();
        const next = vi.fn();

        requireRole('ADMIN')({}, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('deja pasar al rol habilitado', () => {
        const next = vi.fn();

        requireRole('ADMIN')({ user: { role: 'ADMIN' } }, mockRes(), next);

        expect(next).toHaveBeenCalled();
    });

    it('admite varios roles', () => {
        const next = vi.fn();

        requireRole('ADMIN', 'PROFESSIONAL')({ user: { role: 'PROFESSIONAL' } }, mockRes(), next);

        expect(next).toHaveBeenCalled();
    });
});

describe('optionalAuth', () => {
    it('sigue como invitado si no hay token', () => {
        const req = { headers: {} };
        const next = vi.fn();

        optionalAuth(req, mockRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeUndefined();
    });

    it('sigue como invitado si el token es inválido, sin cortar la reserva', () => {
        const req = { headers: { authorization: 'Bearer roto' } };
        const next = vi.fn();

        optionalAuth(req, mockRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeUndefined();
    });

    it('identifica al usuario si el token es válido', () => {
        const req = { headers: { authorization: `Bearer ${tokenPara({ sub: 'u1' })}` } };
        const next = vi.fn();

        optionalAuth(req, mockRes(), next);

        expect(req.user).toMatchObject({ sub: 'u1' });
    });
});
