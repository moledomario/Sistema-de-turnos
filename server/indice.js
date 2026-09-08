import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { professionalsRouter } from './routes/professionals.routes.js';
import { clientsRouter } from './routes/clients.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { panelRouter } from './routes/panel.routes.js';

// Sin estas variables el server no sirve para nada: sin JWT_SECRET no se puede
// firmar ni verificar un token, y sin DATABASE_CONNECTION no hay base. Mejor no
// arrancar que arrancar y que reviente recién en el primer login, en producción
// y sin que el error diga qué falta.
const missingEnv = ['JWT_SECRET', 'DATABASE_CONNECTION'].filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
    console.error(`Faltan variables de entorno obligatorias: ${missingEnv.join(', ')}`);
    process.exit(1);
}

const app = express();

// Detrás de un proxy (Render, Railway, Nginx) el IP real del visitante viene en
// X-Forwarded-For. Sin esto el rate limit vería el IP del proxy para todos y un
// solo abusador dejaría afuera al resto.
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Solo el front puede pegarle a la API. Estaba en '*', que dejaba a cualquier
// página hacer pedidos en nombre del usuario. CORS_ORIGINS admite varios
// separados por coma (ej. el dominio de producción y el de preview).
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.APP_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// En desarrollo se acepta cualquier puerto de localhost: si el 3000 está
// ocupado, Next arranca en otro y con la lista fija el front quedaba bloqueado
// por un error de CORS difícil de leer. En producción manda la lista y nada más.
const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
    cors({
        origin: (origin, callback) => {
            // Sin Origin (curl, health checks, server a server) no hay nada que
            // restringir: CORS es una protección del navegador.
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            if (!isProduction && isLocalhost(origin)) return callback(null, true);
            return callback(null, false);
        },
    })
);

// Las fotos de servicios y los comprobantes de seña viajan como data URL dentro
// del JSON, así que no entran en el límite de 100kb que trae express por
// defecto. El tope real de cada imagen lo pone la validación de los schemas.
app.use(express.json({ limit: '5mb' }));

// Lo que se puede abusar desde afuera sin cuenta: probar contraseñas de a miles,
// pedir mails de recuperación en masa (los paga el profesional) o crear usuarios
// en loop. El límite es por IP y ventana.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' },
});

// Reservar es una acción legítima y repetida, así que va más holgado que el
// login: esto frena el scripting, no al cliente que duda y reintenta.
const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados pedidos seguidos. Esperá un momento.' },
});

// Van montados por ruta y no sobre todo /auth a propósito: /auth/me lo consulta
// el front en cada carga de página, y limitarlo cortaría el uso normal.
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth/forgot-password', authLimiter);
app.use('/auth/reset-password', authLimiter);
// Cubre también /auth/magic-link/verify (app.use matchea por prefijo). Pedir el
// link manda un mail por pedido, así que sin límite es un cañón de spam gratis
// apuntable a cualquier cliente.
app.use('/auth/magic-link', authLimiter);
app.use('/clients', bookingLimiter);

// De /appointments solo el POST es público; el resto pide token y lo usa gente
// logueada mirando sus turnos.
app.use('/appointments', (req, res, next) =>
    req.method === 'POST' ? bookingLimiter(req, res, next) : next()
);

// Ruta raíz simple (health check)
app.get('/', (req, res) => {
    res.status(200).json({ message: 'API de turnos funcionando' });
});

// Todas las rutas de turnos cuelgan de /appointments
app.use('/appointments', appointmentsRouter);

// Rutas de profesionales cuelgan de /professionals
app.use('/professionals', professionalsRouter);

// Rutas de clientes cuelgan de /clients
app.use('/clients', clientsRouter);

// Rutas de autenticación cuelgan de /auth
app.use('/auth', authRouter);

// Panel del profesional (gestionar disponibilidad y servicios propios)
app.use('/panel', panelRouter);



// Una ruta que no existe también contesta JSON. Antes caía en el manejador por
// defecto de Express, que devuelve HTML, y el front tenía que adivinar.
app.use((req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
});

// Red de seguridad final. Los controllers ya manejan sus propios errores; esto
// atrapa lo que se escape antes de llegar a ellos (JSON malformado, un body
// gigante, un throw inesperado) para que el front reciba JSON siempre y nunca
// una página de error.
// eslint-disable-next-line no-unused-vars -- Express reconoce el handler de errores por los 4 argumentos
app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'El cuerpo del pedido no es JSON válido' });
    }
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ message: 'El contenido es demasiado pesado' });
    }

    console.error('[error no manejado]', error);
    // El mensaje no se reenvía al cliente: un error inesperado puede traer
    // detalles internos (consultas, rutas de archivos) que no tiene por qué ver.
    res.status(error?.status || 500).json({ message: 'Error interno del servidor' });
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
