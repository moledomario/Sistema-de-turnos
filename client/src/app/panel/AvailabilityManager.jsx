"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getMyAvailability, saveAvailabilityDay } from "../lib/api";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// En la base el domingo es 0, pero la semana laboral se lee mejor de lunes a domingo.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_MINUTES = 24 * 60;
const MIN_BLOCK = 30; // lo más corto que dejamos un bloque al partirlo en dos
const BREAK_LENGTH = 60; // duración del corte que proponemos por defecto
const DEFAULT_DAY = { start: "09:00", end: "18:00" };

// Los rangos necesitan una identidad estable para que React no mezcle los inputs
// cuando se agrega o se borra un bloque del medio.
let rangeCounter = 0;
const makeRange = (start, end) => ({ id: ++rangeCounter, start, end });

function minutesToTime(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}`;
}

function timeToMinutes(time) {
    const [h, m] = String(time).split(":").map(Number);
    return h * 60 + m;
}

const emptyWeek = () => Object.fromEntries(WEEK_ORDER.map((weekday) => [weekday, []]));

function groupByDay(slots) {
    const week = emptyWeek();
    for (const slot of slots) {
        week[slot.weekday] = [
            ...(week[slot.weekday] ?? []),
            makeRange(minutesToTime(slot.start_minutes), minutesToTime(slot.end_minutes)),
        ];
    }
    for (const weekday of WEEK_ORDER) {
        week[weekday].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    }
    return week;
}

const serializeDay = (ranges) => ranges.map((range) => `${range.start}-${range.end}`).join("|");

const sortedMinutes = (ranges) =>
    ranges
        .map((range) => ({ start: timeToMinutes(range.start), end: timeToMinutes(range.end) }))
        .sort((a, b) => a.start - b.start);

function validateDay(ranges) {
    const parsed = sortedMinutes(ranges);
    if (parsed.some(({ start, end }) => !Number.isFinite(start) || !Number.isFinite(end))) {
        return "Completá los dos horarios de cada bloque";
    }
    if (parsed.some(({ start, end }) => end <= start)) {
        return "El horario de fin tiene que ser posterior al de inicio";
    }
    if (parsed.some((range, i) => i > 0 && range.start < parsed[i - 1].end)) {
        return "Los bloques de ese día se superponen";
    }
    return null;
}

// Los huecos entre bloques son, justamente, los cortes del día.
function breaksOf(ranges) {
    const parsed = sortedMinutes(ranges);
    const breaks = [];
    for (let i = 1; i < parsed.length; i++) {
        if (parsed[i].start > parsed[i - 1].end) {
            breaks.push({ start: parsed[i - 1].end, end: parsed[i].start });
        }
    }
    return breaks;
}

export default function AvailabilityManager({ token }) {
    const [days, setDays] = useState(emptyWeek);
    const [savedDays, setSavedDays] = useState(emptyWeek);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();
    const [savingDay, setSavingDay] = useState(null);
    const [dayErrors, setDayErrors] = useState({});
    const [dayConflicts, setDayConflicts] = useState({});
    const [copyOpenFor, setCopyOpenFor] = useState(null);
    const [flash, setFlash] = useState(null);

    const loadSlots = () => {
        startTransition(async () => {
            try {
                const data = await getMyAvailability(token);
                const week = groupByDay(data.availability ?? []);
                setDays(week);
                setSavedDays(week);
                setError(null);
            } catch (err) {
                setError(err.message);
            }
        });
    };

    useEffect(loadSlots, [token]);

    useEffect(() => {
        if (!flash) return;
        const timer = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(timer);
    }, [flash]);

    // Todas las barras usan la misma ventana horaria para que los días se puedan
    // comparar de un vistazo.
    const timeline = useMemo(() => {
        const minutes = sortedMinutes(Object.values(days).flat()).filter(
            ({ start, end }) => Number.isFinite(start) && Number.isFinite(end)
        );
        if (minutes.length === 0) return { from: 8 * 60, to: 20 * 60 };
        const from = Math.max(0, Math.floor(Math.min(...minutes.map((r) => r.start)) / 60) * 60 - 60);
        const to = Math.min(DAY_MINUTES, Math.ceil(Math.max(...minutes.map((r) => r.end)) / 60) * 60 + 60);
        return { from, to: Math.max(to, from + 120) };
    }, [days]);

    const setDayRanges = (weekday, ranges) => {
        setDays((prev) => ({ ...prev, [weekday]: ranges }));
        setDayErrors((prev) => ({ ...prev, [weekday]: null }));
        // El aviso es sobre lo último que se guardó: si el día se vuelve a
        // tocar, deja de valer hasta el próximo guardado.
        setDayConflicts((prev) => ({ ...prev, [weekday]: null }));
    };

    const toggleDay = (weekday) => {
        setDayRanges(
            weekday,
            days[weekday].length > 0 ? [] : [makeRange(DEFAULT_DAY.start, DEFAULT_DAY.end)]
        );
    };

    const updateRange = (weekday, id, field, value) => {
        setDayRanges(
            weekday,
            days[weekday].map((range) => (range.id === id ? { ...range, [field]: value } : range))
        );
    };

    const removeRange = (weekday, id) => {
        setDayRanges(weekday, days[weekday].filter((range) => range.id !== id));
    };

    // "Agregar corte" parte el último bloque al medio y deja el hueco como corte.
    // Si ese bloque es muy corto para partirlo, suma uno nuevo más tarde.
    const addBreak = (weekday) => {
        const ranges = days[weekday];
        const last = ranges[ranges.length - 1];
        const start = timeToMinutes(last.start);
        const end = timeToMinutes(last.end);

        if (Number.isFinite(start) && Number.isFinite(end) && end - start >= MIN_BLOCK * 2 + BREAK_LENGTH) {
            const middle = Math.round((start + end) / 2 / 30) * 30;
            const breakStart = Math.min(
                Math.max(middle - BREAK_LENGTH / 2, start + MIN_BLOCK),
                end - MIN_BLOCK - BREAK_LENGTH
            );
            setDayRanges(weekday, [
                ...ranges.slice(0, -1),
                makeRange(last.start, minutesToTime(breakStart)),
                makeRange(minutesToTime(breakStart + BREAK_LENGTH), last.end),
            ]);
            return;
        }

        const newStart = end + BREAK_LENGTH;
        if (!Number.isFinite(newStart) || newStart + MIN_BLOCK >= DAY_MINUTES) {
            setDayErrors((prev) => ({ ...prev, [weekday]: "No queda lugar para otro bloque ese día" }));
            return;
        }
        setDayRanges(weekday, [
            ...ranges,
            makeRange(minutesToTime(newStart), minutesToTime(Math.min(newStart + 120, DAY_MINUTES - 1))),
        ]);
    };

    const saveDay = async (weekday, ranges) => {
        const validationError = validateDay(ranges);
        if (validationError) {
            setDayErrors((prev) => ({ ...prev, [weekday]: validationError }));
            return false;
        }

        setSavingDay(weekday);
        try {
            const data = await saveAvailabilityDay(token, {
                weekday,
                ranges: sortedMinutes(ranges).map(({ start, end }) => ({
                    start_minutes: start,
                    end_minutes: end,
                })),
            });
            const fresh = (data.availability ?? []).map((slot) =>
                makeRange(minutesToTime(slot.start_minutes), minutesToTime(slot.end_minutes))
            );
            setDays((prev) => ({ ...prev, [weekday]: fresh }));
            setSavedDays((prev) => ({ ...prev, [weekday]: fresh }));
            setDayErrors((prev) => ({ ...prev, [weekday]: null }));
            // Turnos ya reservados que quedaron fuera del horario nuevo (por
            // ejemplo, adentro de un corte recién agregado).
            setDayConflicts((prev) => ({ ...prev, [weekday]: data.conflicts ?? [] }));
            return true;
        } catch (err) {
            setDayErrors((prev) => ({ ...prev, [weekday]: err.message }));
            return false;
        } finally {
            setSavingDay(null);
        }
    };

    const copyToDays = async (weekday, targets) => {
        const source = days[weekday];
        const validationError = validateDay(source);
        if (validationError) {
            setDayErrors((prev) => ({ ...prev, [weekday]: validationError }));
            return;
        }

        setCopyOpenFor(null);
        if (serializeDay(source) !== serializeDay(savedDays[weekday])) {
            const ok = await saveDay(weekday, source);
            if (!ok) return;
        }

        for (const target of targets) {
            const cloned = source.map((range) => makeRange(range.start, range.end));
            setDays((prev) => ({ ...prev, [target]: cloned }));
            await saveDay(target, cloned);
        }
        setFlash(`Horario de ${WEEKDAYS[weekday]} copiado a ${targets.length} día${targets.length > 1 ? "s" : ""}`);
    };

    return (
        <section>
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Horarios de atención</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Marcá en qué franjas atendés cada día. Si cortás al mediodía o entre turnos, agregá
                    un corte y el día queda dividido en dos bloques.
                </p>
            </div>

            {loading && <p className="text-sm text-slate-400">Cargando horarios...</p>}
            {!loading && error && <p className="text-sm text-rose-600">{error}</p>}

            {!loading && !error && (
                <div className="space-y-3">
                    {WEEK_ORDER.map((weekday) => (
                        <DayCard
                            key={weekday}
                            weekday={weekday}
                            ranges={days[weekday]}
                            dirty={serializeDay(days[weekday]) !== serializeDay(savedDays[weekday])}
                            saving={savingDay === weekday}
                            error={dayErrors[weekday]}
                            conflicts={dayConflicts[weekday]}
                            timeline={timeline}
                            copyOpen={copyOpenFor === weekday}
                            onToggle={() => toggleDay(weekday)}
                            onChangeRange={(id, field, value) => updateRange(weekday, id, field, value)}
                            onRemoveRange={(id) => removeRange(weekday, id)}
                            onAddBreak={() => addBreak(weekday)}
                            onSave={() => saveDay(weekday, days[weekday])}
                            onToggleCopy={() => setCopyOpenFor(copyOpenFor === weekday ? null : weekday)}
                            onCopy={(targets) => copyToDays(weekday, targets)}
                        />
                    ))}
                </div>
            )}

            {flash && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{flash}</p>
            )}
        </section>
    );
}

function DayCard({
    weekday,
    ranges,
    dirty,
    saving,
    error,
    conflicts,
    timeline,
    copyOpen,
    onToggle,
    onChangeRange,
    onRemoveRange,
    onAddBreak,
    onSave,
    onToggleCopy,
    onCopy,
}) {
    const open = ranges.length > 0;
    const breaks = breaksOf(ranges);

    return (
        <div
            className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                open ? "border-slate-200" : "border-slate-200/70 bg-slate-50/50"
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={open}
                        aria-label={`${open ? "Cerrar" : "Abrir"} ${WEEKDAYS[weekday]}`}
                        onClick={onToggle}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                            open ? "bg-indigo-600" : "bg-slate-300"
                        }`}
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                                open ? "translate-x-4" : "translate-x-0"
                            }`}
                        />
                    </button>
                    <span className={`text-sm font-medium ${open ? "text-slate-900" : "text-slate-400"}`}>
                        {WEEKDAYS[weekday]}
                    </span>
                </div>

                {open ? (
                    <DayTimeline ranges={ranges} timeline={timeline} />
                ) : (
                    <span className="text-sm text-slate-400">Cerrado</span>
                )}
            </div>

            {open && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {ranges.map((range, index) => (
                        <div key={range.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="w-16 shrink-0 text-xs text-slate-400">
                                {index === 0 ? "Atiendo" : "y también"}
                            </span>
                            <input
                                type="time"
                                value={range.start}
                                aria-label={`Inicio del bloque ${index + 1} de ${WEEKDAYS[weekday]}`}
                                onChange={(e) => onChangeRange(range.id, "start", e.target.value)}
                                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-slate-400">a</span>
                            <input
                                type="time"
                                value={range.end}
                                aria-label={`Fin del bloque ${index + 1} de ${WEEKDAYS[weekday]}`}
                                onChange={(e) => onChangeRange(range.id, "end", e.target.value)}
                                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            {ranges.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => onRemoveRange(range.id)}
                                    aria-label={`Quitar el bloque ${index + 1} de ${WEEKDAYS[weekday]}`}
                                    className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}

                    {breaks.length > 0 && (
                        <p className="text-xs text-amber-700">
                            {breaks.length === 1 ? "Corte" : "Cortes"}:{" "}
                            {breaks
                                .map((gap) => `${minutesToTime(gap.start)} a ${minutesToTime(gap.end)}`)
                                .join(" · ")}
                        </p>
                    )}

                    <div className="relative flex flex-wrap items-center gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onAddBreak}
                            className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
                        >
                            + Agregar corte
                        </button>
                        <button
                            type="button"
                            onClick={onToggleCopy}
                            className="text-sm text-slate-500 transition hover:text-slate-700"
                        >
                            Copiar a...
                        </button>
                        {dirty && (
                            <button
                                type="button"
                                onClick={onSave}
                                disabled={saving}
                                className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? "Guardando..." : "Guardar"}
                            </button>
                        )}
                        {copyOpen && <CopyMenu weekday={weekday} onCopy={onCopy} onClose={onToggleCopy} />}
                    </div>
                </div>
            )}

            {!open && dirty && (
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? "Guardando..." : "Guardar"}
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            {conflicts?.length > 0 && <ConflictNotice conflicts={conflicts} />}
        </div>
    );
}

// El horario se guarda igual: los turnos que ya estaban reservados no se tocan,
// pero el profesional tiene que enterarse de que quedaron fuera de su horario.
function ConflictNotice({ conflicts }) {
    return (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">
                {conflicts.length === 1
                    ? "Hay 1 turno reservado que queda fuera de este horario"
                    : `Hay ${conflicts.length} turnos reservados que quedan fuera de este horario`}
            </p>
            <ul className="mt-1 space-y-0.5">
                {conflicts.map((appointment) => (
                    <li key={appointment.id} className="text-xs text-amber-800">
                        {new Date(appointment.start_time).toLocaleString("es-AR", {
                            weekday: "short",
                            day: "numeric",
                            month: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        })}{" "}
                        · {appointment.client_name}
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-amber-700">
                El horario se guardó igual y esos turnos siguen en pie. Si no los vas a atender,
                cancelalos o reprogramalos desde el calendario.
            </p>
        </div>
    );
}

// Barra con los bloques del día: el corte se ve como el hueco entre dos barras.
function DayTimeline({ ranges, timeline }) {
    const span = timeline.to - timeline.from;
    const blocks = sortedMinutes(ranges).filter(
        ({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start
    );

    return (
        <div className="hidden flex-1 items-center gap-2 sm:flex">
            <span className="text-[10px] text-slate-400">{minutesToTime(timeline.from)}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                {blocks.map((block) => {
                    const left = Math.max(0, ((block.start - timeline.from) / span) * 100);
                    const width = Math.min(100 - left, ((block.end - block.start) / span) * 100);
                    return (
                        <span
                            key={`${block.start}-${block.end}`}
                            className="absolute inset-y-0 rounded-full bg-indigo-500"
                            style={{ left: `${left}%`, width: `${width}%` }}
                        />
                    );
                })}
            </div>
            <span className="text-[10px] text-slate-400">{minutesToTime(timeline.to)}</span>
        </div>
    );
}

function CopyMenu({ weekday, onCopy, onClose }) {
    const others = WEEK_ORDER.filter((day) => day !== weekday);
    const [targets, setTargets] = useState([]);

    const toggleTarget = (day) => {
        setTargets((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    };

    return (
        <div className="absolute top-full left-0 z-10 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium text-slate-700">Aplicar este horario a:</p>
            <div className="space-y-1">
                {others.map((day) => (
                    <label key={day} className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={targets.includes(day)}
                            onChange={() => toggleTarget(day)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {WEEKDAYS[day]}
                    </label>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-slate-500 transition hover:text-slate-700"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    disabled={targets.length === 0}
                    onClick={() => onCopy(targets)}
                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Aplicar
                </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Reemplaza el horario de los días elegidos.</p>
        </div>
    );
}
