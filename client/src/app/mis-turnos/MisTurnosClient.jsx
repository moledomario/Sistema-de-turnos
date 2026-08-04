"use client";

import { useEffect, useState, useTransition } from "react";
import { useAuth } from "../lib/AuthContext";
import { todayISODate } from "../lib/date";
import PedirAccesoForm from "./PedirAccesoForm";
import {
    getMyAppointments,
    cancelAppointment,
    rescheduleAppointment,
    getAvailableSlots,
} from "../lib/api";

const STATUS_LABELS = {
    PENDING: "Pendiente",
    CONFIRMED: "Confirmado",
    CANCELLED: "Cancelado",
    COMPLETED: "Atendido",
    // Lo marca el profesional. Del lado del cliente se dice suave: el dato es
    // suyo y tiene derecho a verlo, pero no hace falta recriminárselo.
    NO_SHOW: "No asististe",
};

function formatDateTime(isoString) {
    return new Date(isoString).toLocaleString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function MisTurnosClient() {
    const { user, token, loading } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [listLoading, startListTransition] = useTransition();
    const [listError, setListError] = useState(null);

    const [reschedulingId, setReschedulingId] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState(todayISODate());
    const [slots, setSlots] = useState([]);
    const [slotsLoading, startSlotsTransition] = useTransition();
    const [slotsError, setSlotsError] = useState(null);

    const [actionError, setActionError] = useState(null);
    const [actionBusyId, setActionBusyId] = useState(null);

    const loadAppointments = () => {
        if (!token) return;
        startListTransition(async () => {
            try {
                const data = await getMyAppointments(token);
                setAppointments(data.appointments ?? []);
                setListError(null);
            } catch (err) {
                setListError(err.message);
            }
        });
    };

    useEffect(loadAppointments, [token]);

    const loadRescheduleSlots = () => {
        if (!reschedulingId) return;
        const appointment = appointments.find((a) => a.id === reschedulingId);
        if (!appointment) return;

        startSlotsTransition(async () => {
            try {
                const data = await getAvailableSlots(
                    appointment.professional_id,
                    appointment.professional_service.service_id,
                    rescheduleDate
                );
                setSlots(data.slots ?? []);
                setSlotsError(null);
            } catch (err) {
                setSlotsError(err.message);
            }
        });
    };

    // `appointments` está en las dependencias porque de ahí sale el profesional y
    // el servicio del turno que se está moviendo. Recargar la lista con el panel
    // abierto vuelve a pedir los horarios, que es lo correcto; y cuando se cierra
    // el panel (reschedulingId en null) el efecto no hace nada.
    useEffect(loadRescheduleSlots, [reschedulingId, rescheduleDate, appointments]);

    if (loading) {
        return <p className="text-center text-slate-400">Cargando...</p>;
    }

    // Sin sesión no se redirige a /login: el cliente no tiene contraseña, así que
    // acá mismo pide su link de acceso por mail.
    if (!user) {
        return <PedirAccesoForm />;
    }

    if (listLoading && appointments.length === 0) {
        return <p className="text-center text-slate-400">Cargando...</p>;
    }

    const handleCancel = async (id) => {
        if (!window.confirm("¿Cancelar este turno?")) return;
        setActionBusyId(id);
        setActionError(null);
        try {
            await cancelAppointment(token, id);
            loadAppointments();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setActionBusyId(null);
        }
    };

    const openReschedule = (id) => {
        setReschedulingId(id);
        setRescheduleDate(todayISODate());
        setSlots([]);
        setActionError(null);
    };

    const closeReschedule = () => {
        setReschedulingId(null);
        setSlots([]);
    };

    const handlePickSlot = async (startTime) => {
        setActionBusyId(reschedulingId);
        setActionError(null);
        try {
            await rescheduleAppointment(token, reschedulingId, startTime);
            closeReschedule();
            loadAppointments();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setActionBusyId(null);
        }
    };

    const now = new Date();
    const upcoming = appointments
        .filter((a) => a.status !== "CANCELLED" && new Date(a.start_time) > now)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const history = appointments.filter((a) => !upcoming.includes(a));

    return (
        <div className="space-y-10">
            {listError && <p className="text-center text-rose-600">{listError}</p>}
            {actionError && <p className="text-center text-rose-600">{actionError}</p>}

            <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Próximos turnos</h2>
                {upcoming.length === 0 ? (
                    <p className="text-slate-400 text-sm">No tenés turnos próximos.</p>
                ) : (
                    <ul className="space-y-3">
                        {upcoming.map((appointment) => (
                            <li
                                key={appointment.id}
                                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900">
                                            {appointment.professional_service.service.name}
                                        </p>
                                        <p className="text-sm text-slate-600">
                                            con {appointment.professional_service.user.firts_name}{" "}
                                            {appointment.professional_service.user.last_name}
                                        </p>
                                        <p className="mt-1 text-sm capitalize text-slate-700">
                                            {formatDateTime(appointment.start_time)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openReschedule(appointment.id)}
                                            disabled={actionBusyId === appointment.id}
                                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Reprogramar
                                        </button>
                                        <button
                                            onClick={() => handleCancel(appointment.id)}
                                            disabled={actionBusyId === appointment.id}
                                            className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>

                                {reschedulingId === appointment.id && (
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        <div className="flex items-center gap-3">
                                            <label className="text-xs font-medium text-slate-700">
                                                Nueva fecha
                                            </label>
                                            <input
                                                type="date"
                                                value={rescheduleDate}
                                                min={todayISODate()}
                                                onChange={(e) => setRescheduleDate(e.target.value)}
                                                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                            <button
                                                onClick={closeReschedule}
                                                className="text-sm text-slate-500 hover:underline"
                                            >
                                                Cancelar reprogramación
                                            </button>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {slotsLoading && (
                                                <p className="text-sm text-slate-400">Buscando horarios...</p>
                                            )}
                                            {!slotsLoading && slotsError && (
                                                <p className="text-sm text-rose-600">{slotsError}</p>
                                            )}
                                            {!slotsLoading && !slotsError && slots.length === 0 && (
                                                <p className="text-sm text-slate-400">
                                                    No hay horarios disponibles ese día.
                                                </p>
                                            )}
                                            {!slotsLoading &&
                                                !slotsError &&
                                                slots.map((slot) => (
                                                    <button
                                                        key={slot.start_time}
                                                        onClick={() => handlePickSlot(slot.start_time)}
                                                        disabled={actionBusyId === appointment.id}
                                                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:border-indigo-500 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {new Date(slot.start_time).toLocaleTimeString("es-AR", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Historial</h2>
                {history.length === 0 ? (
                    <p className="text-slate-400 text-sm">Todavía no tenés turnos pasados.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
                        {history.map((appointment) => (
                            <li key={appointment.id} className="flex items-center justify-between px-4 py-3 text-sm">
                                <div>
                                    <p className="font-medium text-slate-800">
                                        {appointment.professional_service.service.name}
                                    </p>
                                    <p className="capitalize text-slate-500">
                                        {formatDateTime(appointment.start_time)}
                                    </p>
                                </div>
                                <span className="text-slate-500">
                                    {STATUS_LABELS[appointment.status] ?? appointment.status}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
