"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/AuthContext";

export default function RegisterForm() {
    const router = useRouter();
    const { register } = useAuth();
    const [form, setForm] = useState({
        firts_name: "",
        last_name: "",
        email: "",
        password: "",
        phone: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await register({
                firts_name: form.firts_name,
                last_name: form.last_name,
                email: form.email,
                password: form.password,
                phone: form.phone || undefined,
            });
            // Toda cuenta nueva es de un profesional, y arranca por el
            // onboarding: sin link, servicios ni horarios el panel no le sirve
            // de nada.
            router.push("/onboarding");
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
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
                    Contraseña
                </label>
                <input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={handleChange("password")}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres.</p>
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

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {submitting ? "Creando cuenta..." : "Crear cuenta y configurar"}
            </button>

            <p className="text-center text-sm text-slate-500">
                ¿Ya tenés cuenta?{" "}
                <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                    Iniciá sesión
                </Link>
            </p>
        </form>
    );
}
