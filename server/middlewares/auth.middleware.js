import jwt from 'jsonwebtoken';

const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: 'No autenticado' });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token inválido o expirado' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
        return res.status(403).json({ message: 'No tenés permiso para hacer esto' });
    }
    next();
};

// Igual que requireAuth pero no bloquea si no hay token (o es inválido): deja
// req.user sin definir para que la ruta pueda soportar tanto usuarios logueados
// como invitados.
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            // token inválido o vencido: seguimos como invitado
        }
    }
    next();
};

export { requireAuth, requireRole, optionalAuth };
