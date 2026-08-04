"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient, createAppointment } from "../../../../lib/api";
import { fileToResizedDataUrl } from "../../../../lib/image";
import { useAuth } from "../../../../lib/AuthContext";

function formatDateTime(isoString) {
    return new Date(isoString).toLocaleString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function ConfirmarForm(props) {
    const { loading } = useAuth();

    // Se espera a que termine la verificación de sesión antes de montar el
    // formulario, así el estado inicial ya puede precargarse con los datos
    // del usuario logueado (si hay uno) sin necesitar un efecto.
    if (loading) {
        return <p className="text-center text-slate-400">Cargando...</p>;
    }

    return <ConfirmarFormFields {...props} />;
}

function ConfirmarFormFields({
    slug,
    professionalId,
    serviceId,
    startTime,
    professional,
    professionalService,
}) {
    const { user, token } = useAuth();
    const [form, setForm] = useState(() => ({
        firts_name: user?.firts_name ?? "",
        last_name: user?.last_name ?? "",
        email: user?.email ?? "",
        phone: user?.phone ?? "",
        notes: "",
    }));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [confirmedAppointment, setConfirmedAppointment] = useState(null);
    // Comprobante de la seña. Es opcional: si no lo sube, el profesional ve la
    // solicitud igual y decide.
    const [receipt, setReceipt] = useState(null);
    const [receiptError, setReceiptError] = useState(null);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleReceipt = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setReceiptError(null);
        try {
            setReceipt(await fileToResizedDataUrl(file));
        } catch (err) {
            setReceiptError(err.message);
        } finally {
            e.target.value = "";
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            // Con sesión iniciada el turno se asocia directamente a la cuenta
            // del usuario (vía el JWT); solo un invitado necesita crear/reusar
            // un cliente por email antes de reservar.
            let clientId;
            if (!token) {
                const { client } = await createClient({
                    firts_name: form.firts_name,
                    last_name: form.last_name,
                    email: form.email,
                    phone: form.phone || undefined,
                });
                clientId = client.id;
            }

            const { appointment } = await createAppointment(
                {
                    professional_id: professionalId,
                    service_id: serviceId,
                    ...(clientId ? { client_id: clientId } : {}),
                    start_time: startTime,
                    notes: form.notes || undefined,
                    deposit_receipt: receipt || undefined,
                },
                token
            );

            setConfirmedAppointment(appointment);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (confirmedAppointment) {
        // Salvo que el profesional acepte los turnos automáticamente, el turno
        // queda esperando su decisión: no hay que decirle al cliente que ya está
        // confirmado.
        const isPending = confirmedAppointment.status === "PENDING";

        return (
            <div
                className={`rounded-xl border p-6 text-center ${
                    isPending
                        ? "border-indigo-200 bg-indigo-50"
                        : "border-emerald-200 bg-emerald-50"
                }`}
            >
                <div
                    className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                        isPending
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-emerald-100 text-emerald-600"
                    }`}
                >
                    {isPending ? "⏳" : "✓"}
                </div>
                <h2
                    className={`text-lg font-semibold ${
                        isPending ? "text-indigo-900" : "text-emerald-900"
                    }`}
                >
                    {isPending ? "¡Turno solicitado!" : "¡Turno confirmado!"}
                </h2>
                <p
                    className={`mt-2 text-sm ${
                        isPending ? "text-indigo-800" : "text-emerald-800"
                    }`}
                >
                    {professionalService.service.name} con {professional.firts_name}{" "}
                    {professional.last_name}
                    <br />
                    {formatDateTime(startTime)}
                </p>
                {isPending && (
                    <p className="mt-2 text-sm text-indigo-700">
                        {professional.firts_name} tiene que confirmarlo. Te avisamos por email
                        apenas responda.
                    </p>
                )}
                <Link
                    href={`/turnos/${slug}`}
                    className={`mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white ${
                        isPending
                            ? "bg-indigo-600 hover:bg-indigo-700"
                            : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                >
                    Reservar otro turno
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                    {professionalService.service.name}
                </p>
                <p>
                    con {professional.firts_name} {professional.last_name} ·{" "}
                    {professionalService.duration} min
                    {professionalService.price != null && ` · $${professionalService.price}`}
                </p>
                <p className="mt-1 capitalize">{formatDateTime(startTime)}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {token ? (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        Reservando como{" "}
                        <span className="font-medium">
                            {user.firts_name} {user.last_name}
                        </span>{" "}
                        ({user.email})
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.firts_name}
                                    onChange={handleChange("firts_name")}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Apellido
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.last_name}
                                    onChange={handleChange("last_name")}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                required
                                value={form.email}
                                onChange={handleChange("email")}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Teléfono (opcional)
                            </label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={handleChange("phone")}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Notas (opcional)
                    </label>
                    <textarea
                        value={form.notes}
                        onChange={handleChange("notes")}
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                {professionalService.requires_deposit && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-medium text-amber-900">
                            {professionalService.deposit_amount == null
                                ? "Este turno necesita una seña"
                                : `Este turno necesita una seña de $${professionalService.deposit_amount}`}
                        </p>
                        <p className="mt-1 text-xs text-amber-800">
                            Transferí a esta cuenta y subí el comprobante:
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 font-sans text-sm text-amber-900">
                            {professionalService.bank_details}
                        </pre>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <label className="cursor-pointer rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100">
                                {receipt ? "Cambiar comprobante" : "Subir comprobante"}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleReceipt}
                                    className="hidden"
                                />
                            </label>
                            {receipt && (
                                <button
                                    type="button"
                                    onClick={() => setReceipt(null)}
                                    className="text-xs text-amber-700 hover:text-rose-600"
                                >
                                    Quitar
                                </button>
                            )}
                        </div>

                        {receipt && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={receipt}
                                alt="Comprobante de la transferencia"
                                className="mt-3 max-h-48 rounded-lg border border-amber-200 object-contain"
                            />
                        )}
                        {receiptError && (
                            <p className="mt-2 text-xs text-rose-600">{receiptError}</p>
                        )}
                        <p className="mt-2 text-xs text-amber-700">
                            Si preferís, podés reservar ahora y mandar el comprobante después.
                        </p>
                    </div>
                )}

                {error && <p className="text-sm text-rose-600">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {submitting ? "Confirmando..." : "Confirmar turno"}
                </button>
            </form>
        </div>
    );
}
