"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlots } from "../../../lib/api";
import { todayISODate } from "../../../lib/date";

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function HorarioPicker({ slug, professionalId, serviceId }) {
    const router = useRouter();
    const [date, setDate] = useState(todayISODate());
    const [slots, setSlots] = useState([]);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;

        startTransition(async () => {
            try {
                const data = await getAvailableSlots(professionalId, serviceId, date);
                if (cancelled) return;
                setSlots(data.slots ?? []);
                setError(null);
            } catch (err) {
                if (cancelled) return;
                setError(err.message);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [professionalId, serviceId, date]);

    const handleSelectSlot = (startTime) => {
        const params = new URLSearchParams({ start_time: startTime });
        router.push(`/turnos/${slug}/${serviceId}/confirmar?${params}`);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
                Fecha
            </label>
            <input
                type="date"
                value={date}
                min={todayISODate()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            <div className="mt-6">
                {loading && (
                    <p className="text-center text-slate-400">Buscando horarios...</p>
                )}

                {!loading && error && (
                    <p className="text-center text-rose-600">{error}</p>
                )}

                {!loading && !error && slots.length === 0 && (
                    <p className="text-center text-slate-400">
                        No hay horarios disponibles para ese día. Probá con otra fecha.
                    </p>
                )}

                {!loading && !error && slots.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {slots.map((slot) => (
                            <button
                                key={slot.start_time}
                                onClick={() => handleSelectSlot(slot.start_time)}
                                className="rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                                {formatTime(slot.start_time)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
