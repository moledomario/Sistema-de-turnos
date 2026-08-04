"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/AuthContext";

export default function LoginForm() {
    const router = useRouter();
    const { login } = useAuth();
    const [form, setForm] = useState({ email: "", password: "" });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const user = await login(form);
            router.push(user.role === "PROFESSIONAL" ? "/panel" : "/mis-turnos");
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
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
                    value={form.password}
                    onChange={handleChange("password")}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {submitting ? "Ingresando..." : "Iniciar sesión"}
            </button>

            <p className="text-center text-sm">
                <Link href="/recuperar" className="text-slate-500 hover:text-indigo-600">
                    ¿Olvidaste tu contraseña?
                </Link>
            </p>

            <p className="text-center text-sm text-slate-500">
                ¿Sos profesional y no tenés cuenta?{" "}
                <Link href="/register" className="font-medium text-indigo-600 hover:underline">
                    Creá la tuya
                </Link>
            </p>
        </form>
    );
}
