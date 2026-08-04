"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPassword } from "../../lib/api";

export default function ResetPasswordForm({ token }) {
    const router = useRouter();
    const [form, setForm] = useState({ password: "", repeat: "" });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (form.password !== form.repeat) {
            setError("Las dos contraseñas no coinciden");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await resetPassword(token, form.password);
            setDone(true);
            // La sesión no se abre sola: la contraseña nueva se estrena en el
            // login, que es donde el navegador la ofrece para guardar.
            setTimeout(() => router.push("/login"), 2500);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <p className="text-sm font-medium text-emerald-900">¡Listo!</p>
                <p className="mt-1 text-sm text-emerald-800">
                    Ya podés iniciar sesión con tu contraseña nueva.
                </p>
                <Link
                    href="/login"
                    className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                    Iniciar sesión
                </Link>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                    Contraseña nueva
                </label>
                <input
                    type="password"
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres.</p>
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                    Repetila
                </label>
                <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={form.repeat}
                    onChange={(e) => setForm((prev) => ({ ...prev, repeat: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
            </div>

            {error && (
                <div className="text-sm text-rose-600">
                    <p>{error}</p>
                    <Link href="/recuperar" className="font-medium hover:underline">
                        Pedir un link nuevo
                    </Link>
                </div>
            )}

            <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {submitting ? "Guardando..." : "Guardar contraseña"}
            </button>
        </form>
    );
}
