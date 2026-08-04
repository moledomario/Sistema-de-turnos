"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../lib/api";

export default function RecuperarPage() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await requestPasswordReset(email);
            setSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <h1 className="text-center text-2xl font-semibold text-slate-900">
                Recuperar contraseña
            </h1>

            {sent ? (
                // El mensaje no confirma ni desmiente que el email tenga cuenta.
                <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                    <p className="text-sm text-emerald-900">
                        Si ese email tiene una cuenta, te mandamos un link para elegir una
                        contraseña nueva.
                    </p>
                    <p className="mt-2 text-xs text-emerald-800">
                        Revisá el correo no deseado. El link vence en 1 hora.
                    </p>
                    <Link
                        href="/login"
                        className="mt-4 inline-block text-sm font-medium text-emerald-800 hover:underline"
                    >
                        Volver a iniciar sesión
                    </Link>
                </div>
            ) : (
                <>
                    <p className="mt-1 mb-8 text-center text-slate-500">
                        Te mandamos un link a tu email para elegir una nueva.
                    </p>

                    <form
                        onSubmit={handleSubmit}
                        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                    >
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                                Email
                            </label>
                            <input
                                type="email"
                                required
                                autoFocus
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
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
                            <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                                Volver a iniciar sesión
                            </Link>
                        </p>
                    </form>
                </>
            )}
        </main>
    );
}
