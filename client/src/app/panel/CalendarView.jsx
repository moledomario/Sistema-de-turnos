"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
    getMyBookings,
    getMyServices,
    createBooking,
    cancelBooking,
    rescheduleBooking,
    setAttendance,
} from "../lib/api";

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABELS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_LABELS = {
    PENDING: "Pendiente",
    CONFIRMED: "Confirmado",
    CANCELLED: "Cancelado",
    COMPLETED: "Atendido",
    NO_SHOW: "No vino",
};

// Los turnos pasados se cierran solos en COMPLETED, así que el profesional solo
// tiene que tocar algo cuando el cliente NO vino. Estos dos estados son los
// únicos sobre los que se puede marcar asistencia.
const ATTENDANCE_STATUSES = ["COMPLETED", "NO_SHOW"];

const STATUS_BADGES = {
    CANCELLED: "bg-slate-100 text-slate-500",
    COMPLETED: "bg-emerald-50 text-emerald-700",
    NO_SHOW: "bg-amber-50 text-amber-700",
};

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(monthStart) {
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - monthStart.getDay());

    return Array.from({ length: 42 }, (_, i) => {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + i);
        return day;
    });
}

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

// `datetime-local` no entiende ISO con zona: quiere la hora local ya resuelta.
function toLocalInputValue(isoString) {
    const date = new Date(isoString);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
        date.getHours()
    )}:${pad(date.getMinutes())}`;
}

function defaultCancelMessage(appointment) {
    return `Hola ${appointment.client.firts_name}, tuve que cancelar el turno del ${new Date(
        appointment.start_time
    ).toLocaleString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    })}. Perdón por el cambio, podés reservar otro horario cuando quieras.`;
}

export default function CalendarView({ token }) {
    const [appointments, setAppointments] = useState([]);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();
    const [monthStart, setMonthStart] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const today = useMemo(() => new Date(), []);
    const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));

    // Panel abierto sobre un turno: { id, action: "cancel" | "reschedule" }.
    const [editing, setEditing] = useState(null);
    const [services, setServices] = useState([]);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [flash, setFlash] = useState(null);

    const loadBookings = () => {
        startTransition(async () => {
            try {
                const data = await getMyBookings(token);
                setAppointments(data.appointments ?? []);
                setError(null);
            } catch (err) {
                setError(err.message);
            }
        });
    };

    useEffect(loadBookings, [token]);

    // Para el selector de servicio del turno cargado a mano.
    useEffect(() => {
        let cancelled = false;
        getMyServices(token)
            .then((data) => {
                if (!cancelled) setServices(data.services ?? []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [token]);

    useEffect(() => {
        if (!flash) return;
        const timer = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(timer);
    }, [flash]);

    // Devuelve si salió bien, para que el formulario que la llamó sepa si puede
    // cerrarse o tiene que quedar abierto con lo que el profesional ya escribió.
    const runAction = async (action, successText) => {
        setBusy(true);
        setActionError(null);
        try {
            await action();
            setEditing(null);
            setFlash(successText);
            loadBookings();
            return true;
        } catch (err) {
            setActionError(err.message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const byDay = useMemo(() => {
        const map = {};
        for (const appointment of appointments) {
            const key = dateKey(new Date(appointment.start_time));
            (map[key] ??= []).push(appointment);
        }
        return map;
    }, [appointments]);

    const days = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
    const selectedAppointments = byDay[selectedDay] ?? [];

    const goToMonth = (delta) => {
        setMonthStart((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    };

    const goToToday = () => {
        const now = new Date();
        setMonthStart(new Date(now.getFullYear(), now.getMonth(), 1));
        setSelectedDay(dateKey(now));
    };

    return (
        <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Calendario de turnos</h2>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {loading && <p className="text-slate-400 text-sm">Cargando turnos...</p>}
                {!loading && error && <p className="text-rose-600 text-sm">{error}</p>}

                {!loading && !error && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <button
                                onClick={() => goToMonth(-1)}
                                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
                            >
                                ←
                            </button>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900 capitalize">
                                    {MONTH_LABELS[monthStart.getMonth()]} {monthStart.getFullYear()}
                                </span>
                                <button
                                    onClick={goToToday}
                                    className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                                >
                                    Hoy
                                </button>
                            </div>
                            <button
                                onClick={() => goToMonth(1)}
                                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
                            >
                                →
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 mb-1">
                            {WEEKDAY_LABELS.map((label) => (
                                <div key={label}>{label}</div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {days.map((day) => {
                                const key = dateKey(day);
                                const inMonth = day.getMonth() === monthStart.getMonth();
                                const isToday = key === dateKey(today);
                                const isSelected = key === selectedDay;
                                const count = byDay[key]?.length ?? 0;

                                return (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedDay(key)}
                                        className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-sm transition ${
                                            isSelected
                                                ? "bg-indigo-600 text-white"
                                                : inMonth
                                                ? "text-slate-700 hover:bg-slate-100"
                                                : "text-slate-300 hover:bg-slate-50"
                                        }`}
                                    >
                                        <span className={isToday && !isSelected ? "font-semibold text-indigo-600" : ""}>
                                            {day.getDate()}
                                        </span>
                                        {count > 0 && (
                                            <span
                                                className={`h-1.5 w-1.5 rounded-full ${
                                                    isSelected ? "bg-white" : "bg-indigo-500"
                                                }`}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 border-t border-slate-100 pt-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-medium text-slate-900">
                                    Turnos del {selectedDay.split("-").reverse().join("/")}
                                </h3>
                                {!creating && !editing && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActionError(null);
                                            setCreating(true);
                                        }}
                                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700"
                                    >
                                        + Cargar turno
                                    </button>
                                )}
                            </div>

                            {creating && (
                                <NewBookingForm
                                    day={selectedDay}
                                    services={services}
                                    busy={busy}
                                    error={actionError}
                                    onClose={() => {
                                        setCreating(false);
                                        setActionError(null);
                                    }}
                                    onSubmit={async (booking) => {
                                        const ok = await runAction(
                                            () => createBooking(token, booking),
                                            "Turno agendado"
                                        );
                                        if (ok) setCreating(false);
                                    }}
                                />
                            )}
                            {selectedAppointments.length === 0 ? (
                                <p className="text-sm text-slate-400">No tenés turnos ese día.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {selectedAppointments.map((appointment) => (
                                        <li
                                            key={appointment.id}
                                            className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <span className="font-medium text-slate-900">
                                                        {formatTime(appointment.start_time)}
                                                    </span>{" "}
                                                    <span className="text-slate-600">
                                                        {appointment.professional_service.service.name} ·{" "}
                                                        {appointment.client.firts_name} {appointment.client.last_name}
                                                    </span>
                                                </div>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        STATUS_BADGES[appointment.status] ??
                                                        "bg-indigo-50 text-indigo-700"
                                                    }`}
                                                >
                                                    {STATUS_LABELS[appointment.status]}
                                                </span>
                                            </div>

                                            {/* Un turno que ya pasó no se mueve ni se cancela: lo
                                                único que queda por resolver es si el cliente vino. */}
                                            {ATTENDANCE_STATUSES.includes(appointment.status) && (
                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                                                    {appointment.client.phone && (
                                                        <span className="text-slate-400">
                                                            {appointment.client.phone}
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-slate-400">¿Vino?</span>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            runAction(
                                                                () => setAttendance(token, appointment.id, true),
                                                                "Marcado como atendido"
                                                            )
                                                        }
                                                        disabled={busy || appointment.status === "COMPLETED"}
                                                        className="font-medium text-emerald-600 transition hover:text-emerald-700 disabled:cursor-default disabled:font-normal disabled:text-slate-300"
                                                    >
                                                        Sí
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            runAction(
                                                                () => setAttendance(token, appointment.id, false),
                                                                "Marcado como ausente"
                                                            )
                                                        }
                                                        disabled={busy || appointment.status === "NO_SHOW"}
                                                        className="font-medium text-amber-600 transition hover:text-amber-700 disabled:cursor-default disabled:font-normal disabled:text-slate-300"
                                                    >
                                                        No
                                                    </button>
                                                </div>
                                            )}

                                            {!ATTENDANCE_STATUSES.includes(appointment.status) &&
                                                appointment.status !== "CANCELLED" && (
                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                                                    {appointment.client.phone && (
                                                        <span className="text-slate-400">
                                                            {appointment.client.phone}
                                                        </span>
                                                    )}
                                                    {editing?.id !== appointment.id && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setEditing({
                                                                        id: appointment.id,
                                                                        action: "reschedule",
                                                                    })
                                                                }
                                                                disabled={busy}
                                                                className="ml-auto font-medium text-indigo-600 transition hover:text-indigo-700 disabled:opacity-60"
                                                            >
                                                                Mover
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setEditing({
                                                                        id: appointment.id,
                                                                        action: "cancel",
                                                                    })
                                                                }
                                                                disabled={busy}
                                                                className="text-slate-400 transition hover:text-rose-600 disabled:opacity-60"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {editing?.id === appointment.id && (
                                                <BookingActionPanel
                                                    appointment={appointment}
                                                    action={editing.action}
                                                    busy={busy}
                                                    error={actionError}
                                                    onClose={() => {
                                                        setEditing(null);
                                                        setActionError(null);
                                                    }}
                                                    onCancel={(message) =>
                                                        runAction(
                                                            () => cancelBooking(token, appointment.id, message),
                                                            "Turno cancelado, le avisamos al cliente"
                                                        )
                                                    }
                                                    onReschedule={(startTime, message) =>
                                                        runAction(
                                                            () =>
                                                                rescheduleBooking(
                                                                    token,
                                                                    appointment.id,
                                                                    startTime,
                                                                    message
                                                                ),
                                                            "Turno movido, le avisamos al cliente"
                                                        )
                                                    }
                                                />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {flash && (
                            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                {flash}
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

// Turno que carga el profesional: alguien que llamó por teléfono o que cayó al
// local. El email es opcional justamente porque en esos casos no siempre lo hay.
function NewBookingForm({ day, services, busy, error, onClose, onSubmit }) {
    const [form, setForm] = useState({
        service_id: services[0]?.service_id ?? "",
        time: "10:00",
        firts_name: "",
        last_name: "",
        phone: "",
        email: "",
        notes: "",
    });

    const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
    const selected = services.find((s) => s.service_id === form.service_id);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            service_id: form.service_id,
            // El día viene del calendario y la hora del formulario: se arma en
            // hora local y se manda en ISO.
            start_time: new Date(`${day}T${form.time}`).toISOString(),
            notes: form.notes.trim() || undefined,
            client: {
                firts_name: form.firts_name.trim(),
                last_name: form.last_name.trim(),
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
            },
        });
    };

    if (services.length === 0) {
        return (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Para cargar un turno primero necesitás tener al menos un servicio.
                <button
                    type="button"
                    onClick={onClose}
                    className="ml-2 font-medium hover:underline"
                >
                    Cerrar
                </button>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3"
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Servicio</label>
                    <select
                        value={form.service_id}
                        onChange={(e) => setField("service_id", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                        {services.map((service) => (
                            <option key={service.id} value={service.service_id}>
                                {service.service.name} ({service.duration} min)
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Hora</label>
                    <input
                        type="time"
                        required
                        value={form.time}
                        onChange={(e) => setField("time", e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {selected && (
                        <span className="ml-2 text-xs text-slate-500">
                            dura {selected.duration} min
                        </span>
                    )}
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Nombre</label>
                    <input
                        type="text"
                        required
                        autoFocus
                        value={form.firts_name}
                        onChange={(e) => setField("firts_name", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                        Apellido (opcional)
                    </label>
                    <input
                        type="text"
                        value={form.last_name}
                        onChange={(e) => setField("last_name", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                        Teléfono (opcional)
                    </label>
                    <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                        Email (opcional)
                    </label>
                    <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setField("email", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            </div>

            <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                    Notas (opcional)
                </label>
                <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
            </div>

            <p className="mt-2 text-xs text-slate-500">
                Queda confirmado directo. Si cargás el email, le llega la confirmación; si no, el
                turno se agenda igual.
            </p>

            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

            <div className="mt-3 flex items-center gap-3">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                    {busy ? "Agendando..." : "Agendar turno"}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="text-sm text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}

// Mover o cancelar un turno. En los dos casos el cliente recibe un mail, así que
// el mensaje se edita acá antes de mandarlo (igual que en Turnos solicitados).
function BookingActionPanel({
    appointment,
    action,
    busy,
    error,
    onClose,
    onCancel,
    onReschedule,
}) {
    const cancelling = action === "cancel";
    const [message, setMessage] = useState(() =>
        cancelling ? defaultCancelMessage(appointment) : ""
    );
    const [startTime, setStartTime] = useState(() => toLocalInputValue(appointment.start_time));

    return (
        <div
            className={`mt-3 rounded-lg border p-3 ${
                cancelling ? "border-rose-200 bg-rose-50/50" : "border-indigo-200 bg-indigo-50/50"
            }`}
        >
            {!cancelling && (
                <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                        Nuevo horario
                    </label>
                    <input
                        type="datetime-local"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                        Dura {appointment.professional_service.duration} min. Podés moverlo fuera de
                        tu horario de atención, pero no encima de otro turno.
                    </p>
                </div>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-700">
                Mensaje que le llega por email {cancelling ? "" : "(opcional)"}
            </label>
            <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                    cancelling
                        ? ""
                        : "Ej: te lo paso una hora más tarde, avisame si no te sirve."
                }
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
                El mail incluye igual el servicio y el horario. Si lo dejás vacío, sale el texto
                estándar.
            </p>

            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                        cancelling
                            ? onCancel(message.trim() || undefined)
                            : onReschedule(
                                  new Date(startTime).toISOString(),
                                  message.trim() || undefined
                              )
                    }
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-60 ${
                        cancelling
                            ? "bg-rose-600 hover:bg-rose-700"
                            : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                >
                    {busy
                        ? "Enviando..."
                        : cancelling
                        ? "Cancelar turno y avisar"
                        : "Mover turno y avisar"}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="text-sm text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
                >
                    Volver
                </button>
            </div>
        </div>
    );
}
