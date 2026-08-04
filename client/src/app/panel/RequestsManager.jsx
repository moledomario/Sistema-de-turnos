"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/AuthContext";
import { usePendingRequests } from "./PendingRequestsContext";
import { acceptRequest, rejectRequest, acceptAllRequests, getPanelSettings } from "../lib/api";

function formatDateTime(isoString) {
    return new Date(isoString).toLocaleString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Borrador con el que arranca el composer: el profesional lo edita, lo deja
// como está, o lo borra (y entonces sale el texto estándar del mail).
function defaultMessage(request, accept) {
    const cuando = formatDateTime(request.start_time);
    const nombre = request.client.firts_name;

    return accept
        ? `Hola ${nombre}, te confirmo el turno del ${cuando}. ¡Nos vemos!`
        : `Hola ${nombre}, perdón pero no voy a poder atenderte el ${cuando}. Podés elegir otro horario cuando quieras.`;
}

const ACCEPT_ALL_DEFAULT = "¡Hola! Te confirmo el turno. Nos vemos.";

// El comprobante de la seña es opcional para el cliente, así que acá importa
// tanto mostrarlo como avisar cuando no lo mandó.
function DepositReceipt({ receipt, amount }) {
    const [open, setOpen] = useState(false);
    const label = amount == null ? "Pidió seña" : `Seña de $${amount}`;

    if (!receipt) {
        return (
            <p className="mt-1 text-xs font-medium text-amber-700">{label} · sin comprobante</p>
        );
    }

    return (
        <div className="mt-1">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="text-xs font-medium text-emerald-700 hover:underline"
            >
                {label} · {open ? "ocultar comprobante" : "ver comprobante"}
            </button>
            {open && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={receipt}
                    alt="Comprobante de la transferencia"
                    className="mt-2 max-h-64 rounded-lg border border-slate-200 object-contain"
                />
            )}
        </div>
    );
}

export default function RequestsManager() {
    const { token } = useAuth();
    const { requests, loading, error, refresh } = usePendingRequests();

    // Qué turno tiene una acción en curso, para deshabilitar sus botones sin
    // congelar toda la lista.
    const [busyId, setBusyId] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [autoAccept, setAutoAccept] = useState(null);

    // Composer abierto: { id, accept }. `id` es "all" para la acción masiva.
    const [composer, setComposer] = useState(null);
    const [messageText, setMessageText] = useState("");

    useEffect(() => {
        if (!token) return;
        let cancelled = false;

        getPanelSettings(token)
            .then((data) => {
                if (!cancelled) setAutoAccept(data.settings?.auto_accept ?? false);
            })
            .catch(() => {
                if (!cancelled) setAutoAccept(false);
            });

        return () => {
            cancelled = true;
        };
    }, [token]);

    const openComposer = (id, accept, draft) => {
        setComposer({ id, accept });
        setMessageText(draft);
        setActionError(null);
    };

    const closeComposer = () => {
        setComposer(null);
        setMessageText("");
    };

    const send = async () => {
        const { id, accept } = composer;
        const message = messageText.trim();

        setBusyId(id);
        setActionError(null);
        try {
            if (id === "all") {
                await acceptAllRequests(token, message || undefined);
            } else if (accept) {
                await acceptRequest(token, id, message || undefined);
            } else {
                await rejectRequest(token, id, message || undefined);
            }
            closeComposer();
            await refresh();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const composerBox = (accept) => (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="mb-1 block text-xs font-medium text-slate-700">
                Mensaje que le llega por email
            </label>
            <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
                El mail incluye igual el servicio, la fecha y la hora. Si lo dejás vacío, se
                manda el texto estándar.
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm">
                <button
                    onClick={send}
                    disabled={busyId !== null}
                    className={`rounded-lg px-3 py-1.5 font-medium text-white transition disabled:opacity-60 ${
                        accept
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : "bg-rose-600 hover:bg-rose-700"
                    }`}
                >
                    {busyId !== null
                        ? "Enviando..."
                        : accept
                        ? "Aceptar y enviar"
                        : "Rechazar y enviar"}
                </button>
                <button
                    onClick={closeComposer}
                    disabled={busyId !== null}
                    className="text-slate-500 hover:underline disabled:opacity-60"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );

    return (
        <section className="space-y-4">
            {/* Con el modo automático prendido esta lista queda siempre vacía:
                sin este aviso parece que las reservas no llegan. El interruptor
                vive en Configuración, con el resto de las opciones. */}
            {autoAccept && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm text-amber-900">
                        Tenés activado <strong>aceptar turnos automáticamente</strong>: los turnos
                        nuevos se confirman solos y no van a aparecer en esta lista.
                    </p>
                    <Link
                        href="/panel/configuracion"
                        className="mt-1 inline-block text-sm font-medium text-amber-800 hover:underline"
                    >
                        Cambiarlo en Configuración →
                    </Link>
                </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">
                        Turnos solicitados
                        {requests.length > 0 && (
                            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                {requests.length}
                            </span>
                        )}
                    </h2>

                    {requests.length > 0 && composer?.id !== "all" && (
                        <button
                            onClick={() => openComposer("all", true, ACCEPT_ALL_DEFAULT)}
                            className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                        >
                            Aceptar todos
                        </button>
                    )}
                </div>

                {composer?.id === "all" && (
                    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                        <p className="text-sm text-slate-700">
                            Vas a aceptar los <strong>{requests.length}</strong> turnos sin
                            revisarlos. Este mensaje les llega a todos los clientes.
                        </p>
                        {composerBox(true)}
                    </div>
                )}

                {loading && <p className="text-sm text-slate-400">Cargando solicitudes...</p>}
                {!loading && error && <p className="text-sm text-rose-600">{error}</p>}
                {actionError && <p className="mb-2 text-sm text-rose-600">{actionError}</p>}

                {!loading && !error && requests.length === 0 && (
                    <p className="text-sm text-slate-400">
                        No tenés turnos esperando respuesta.
                    </p>
                )}

                {requests.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {requests.map((request) => {
                            const isPast = new Date(request.start_time) < new Date();
                            const isComposing = composer?.id === request.id;
                            const disabled = busyId !== null || composer !== null;

                            return (
                                <li key={request.id} className="py-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0 text-sm">
                                            <p className="font-medium text-slate-900">
                                                {request.client.firts_name}{" "}
                                                {request.client.last_name}
                                                {isPast && (
                                                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                        ya pasó
                                                    </span>
                                                )}
                                            </p>
                                            <p className="capitalize text-slate-700">
                                                {request.professional_service.service.name} ·{" "}
                                                {formatDateTime(request.start_time)}
                                            </p>
                                            <p className="text-slate-500">
                                                {request.professional_service.duration} min
                                                {request.professional_service.price != null &&
                                                    ` · $${request.professional_service.price}`}{" "}
                                                · {request.client.email}
                                                {request.client.phone &&
                                                    ` · ${request.client.phone}`}
                                            </p>
                                            {request.notes && (
                                                <p className="mt-1 italic text-slate-600">
                                                    “{request.notes}”
                                                </p>
                                            )}
                                            {request.professional_service.requires_deposit && (
                                                <DepositReceipt
                                                    receipt={request.deposit_receipt}
                                                    amount={
                                                        request.professional_service.deposit_amount
                                                    }
                                                />
                                            )}
                                        </div>

                                        {!isComposing && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <button
                                                    onClick={() =>
                                                        openComposer(
                                                            request.id,
                                                            true,
                                                            defaultMessage(request, true)
                                                        )
                                                    }
                                                    disabled={disabled}
                                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                                >
                                                    Aceptar
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        openComposer(
                                                            request.id,
                                                            false,
                                                            defaultMessage(request, false)
                                                        )
                                                    }
                                                    disabled={disabled}
                                                    className="rounded-lg border border-rose-300 px-3 py-1.5 font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                                                >
                                                    Rechazar
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {isComposing && composerBox(composer.accept)}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
