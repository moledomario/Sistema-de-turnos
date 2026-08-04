"use client";

import { useState } from "react";
import Link from "next/link";
import { requestMagicLink } from "../lib/api";

// Lo que ve alguien que entra a "mis turnos" sin sesión. No lo mandamos a
// /login porque el cliente nunca eligió una contraseña: reservó como invitado y
// su cuenta se creó sola. El link por mail es su forma de entrar.
export default function PedirAccesoForm() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await requestMagicLink(email);
            setSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (sent) {
        // El mensaje no confirma ni desmiente que ese email tenga turnos.
        return (
            <div className="mx-auto max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <p className="text-sm font-medium text-emerald-900">Revisá tu correo</p>
                <p className="mt-1 text-sm text-emerald-800">
                    Si ese email tiene turnos, te mandamos un link para verlos.
                </p>
                <p className="mt-2 text-xs text-emerald-800">
                    Mirá también el correo no deseado. El link vence en 30 minutos y sirve una
                    sola vez.
                </p>
                <button
                    onClick={() => setSent(false)}
                    className="mt-4 text-sm font-medium text-emerald-800 hover:underline"
                >
                    Usar otro email
                </button>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tu email
                </label>
                <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                    El mismo que usaste para reservar. No hace falta contraseña.
                </p>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {submitting ? "Enviando..." : "Enviarme el link"}
            </button>

            <p className="text-center text-sm text-slate-500">
                ¿Sos profesional?{" "}
                <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                    Iniciá sesión
                </Link>
            </p>
        </form>
    );
}
