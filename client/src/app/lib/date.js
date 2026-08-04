// "Hoy" en formato YYYY-MM-DD según el reloj de quien está mirando la pantalla.
//
// Ojo con la tentación de usar `toISOString().slice(0, 10)`: eso da la fecha en
// UTC, así que en Argentina (UTC-3) a partir de las 21:00 devuelve el día
// siguiente. En un selector de fecha eso se traduce en que el cliente no puede
// elegir hoy porque el `min` ya se corrió a mañana.
export function todayISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}
