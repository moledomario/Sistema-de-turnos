// La disponibilidad se guarda como minutos desde medianoche en la hora del
// NEGOCIO (APP_TIMEZONE), no en la del proceso. La diferencia importa: el server
// local corre en Argentina, pero en Render/Railway corre en UTC, y leer los
// horarios con la zona del proceso movía todos los turnos (un "de 9 a 18"
// cargado desde el panel se ofrecía de 6 a 15). Estos helpers son el único
// criterio para decidir si un horario cae dentro de la atención, así la
// generación de horarios libres y la validación al reservar no se pueden ir por
// caminos distintos.

const TIME_ZONE = process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

// Armar un Intl.DateTimeFormat no es gratis y esto corre por cada slot de cada
// consulta de horarios, así que se reusa uno por zona.
const formatterCache = new Map();

const formatterFor = (timeZone) => {
    let formatter = formatterCache.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatterCache.set(timeZone, formatter);
    }
    return formatter;
};

// Año/mes/día/hora/minuto/segundo de ese instante tal como los lee un reloj
// puesto en la zona del negocio.
const partsInZone = (date, timeZone) => {
    const parts = {};
    for (const { type, value } of formatterFor(timeZone).formatToParts(date)) {
        if (type !== 'literal') parts[type] = Number(value);
    }
    return parts;
};

// Cuánto está corrida la zona respecto de UTC en ese instante concreto (en ms).
// Se calcula por instante y no como constante porque con horario de verano el
// mismo lugar cambia de offset a lo largo del año.
const zoneOffsetMs = (date, timeZone) => {
    const p = partsInZone(date, timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    // El formatter no expone milisegundos: se comparan los dos lados sin ellos.
    return asIfUtc - (date.getTime() - date.getMilliseconds());
};

// El instante real que corresponde a "tal fecha, tantos minutos después de la
// medianoche" leído en la zona del negocio. `minutes` puede pasarse de 1440
// (24*60 da la medianoche del día siguiente).
const zonedTime = (dateStr, minutes = 0, timeZone = TIME_ZONE) => {
    // Se arranca tratando la hora de pared como si fuera UTC y después se le
    // resta el offset de la zona.
    const wallClock = Date.parse(`${dateStr}T00:00:00Z`) + minutes * 60_000;
    const firstGuess = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
    // Segunda pasada: en los saltos de horario de verano el offset que aplica es
    // el del instante resultante, no el del tanteo inicial.
    return new Date(wallClock - zoneOffsetMs(new Date(firstGuess), timeZone));
};

// Medianoche de esa fecha en la zona del negocio.
const zonedDayStart = (dateStr, timeZone = TIME_ZONE) => zonedTime(dateStr, 0, timeZone);

// 0=domingo ... 6=sábado, según el día que sea en la zona del negocio. Un turno
// de las 22:00 en Argentina cae en UTC ya al día siguiente: sin esto se buscaba
// la disponibilidad del día equivocado.
const weekdayOf = (date, timeZone = TIME_ZONE) => {
    const p = partsInZone(date, timeZone);
    return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
};

const minutesOf = (date, timeZone = TIME_ZONE) => {
    const p = partsInZone(date, timeZone);
    return p.hour * 60 + p.minute;
};

// Un turno entra en el horario de atención solo si alguna franja lo contiene
// entero. El fin se mide como inicio + duración en vez de leer su hora: así un
// turno que termina a medianoche no se confunde con uno del día siguiente.
const fitsInWindows = (start, end, windows, timeZone = TIME_ZONE) => {
    const startMinutes = minutesOf(start, timeZone);
    const endMinutes = startMinutes + Math.round((end.getTime() - start.getTime()) / 60000);

    return windows.some(
        (window) => startMinutes >= window.start_minutes && endMinutes <= window.end_minutes
    );
};

// Ventana en la que un turno se puede reservar, según la configuración del
// profesional: ni antes de la antelación mínima ni más allá del máximo de días.
// Devuelve los dos extremos ya resueltos a fechas. Es aritmética de tiempo
// transcurrido, así que no depende de ninguna zona.
const bookingWindow = ({ min_notice_hours = 0, max_days_ahead = 60 } = {}, now = new Date()) => ({
    from: new Date(now.getTime() + min_notice_hours * 60 * 60 * 1000),
    until: new Date(now.getTime() + max_days_ahead * 24 * 60 * 60 * 1000),
});

export { weekdayOf, minutesOf, fitsInWindows, bookingWindow, zonedTime, zonedDayStart, TIME_ZONE };
