"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { getMyAccount, updateMyAccount } from "../lib/api";
import Avatar from "../components/Avatar";
import ImageField from "../components/ImageField";
const ROLE_LABELS = {
    PROFESSIONAL: "Profesional",
    ADMIN: "Administrador",
    USER: "Cliente",
};

function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

export default function AccountManager({ token }) {
    const [account, setAccount] = useState(null);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        firts_name: "",
        last_name: "",
        phone: "",
        image: null,
        description: "",
    });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState(null);

    useEffect(() => {
        startTransition(async () => {
            try {
                const data = await getMyAccount(token);
                setAccount(data.account);
                setError(null);
            } catch (err) {
                setError(err.message);
            }
        });
    }, [token]);

    const openEdit = () => {
        setForm({
            firts_name: account.firts_name,
            last_name: account.last_name,
            phone: account.phone ?? "",
            image: account.image ?? null,
            description: account.description ?? "",
        });
        setFormError(null);
        setEditing(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            const data = await updateMyAccount(token, {
                firts_name: form.firts_name,
                last_name: form.last_name,
                phone: form.phone.trim() || null,
                image: form.image,
                description: form.description.trim() || null,
            });
            setAccount(data.account);
            setEditing(false);
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p className="text-sm text-slate-400">Cargando tu cuenta...</p>;
    if (error) return <p className="text-sm text-rose-600">{error}</p>;
    if (!account) return null;

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">Mi cuenta</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Tus datos, tu plan y el equipo que mostrás como tuyo.
                </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="font-medium text-slate-900">Datos de la cuenta</h3>
                    {!editing && (
                        <button
                            type="button"
                            onClick={openEdit}
                            className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
                        >
                            Editar
                        </button>
                    )}
                </div>

                {editing ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex flex-wrap items-start gap-5">
                            <div className="w-32">
                                <ImageField
                                    label="Foto"
                                    value={form.image}
                                    onChange={(image) => setForm((prev) => ({ ...prev, image }))}
                                    aspect="aspect-square"
                                />
                                <p className="mt-1 text-xs text-slate-400">
                                    De tu local o tuya. Se muestra redonda.
                                </p>
                            </div>
                            <div className="min-w-56 flex-1">
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    Descripción
                                </label>
                                <textarea
                                    rows={5}
                                    maxLength={500}
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, description: e.target.value }))
                                    }
                                    placeholder="Contá a qué te dedicás. Lo ve el cliente al entrar a tu link de reserva."
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.firts_name}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, firts_name: e.target.value }))
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                    Apellido
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.last_name}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, last_name: e.target.value }))
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="sm:w-1/2 sm:pr-2">
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                                Teléfono
                            </label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                                }
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        {formError && <p className="text-sm text-rose-600">{formError}</p>}

                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? "Guardando..." : "Guardar cambios"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="text-sm text-slate-500 transition hover:text-slate-700"
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                ) : (
                    <>
                        <div className="mb-5 flex items-center gap-4">
                            <Avatar
                                firstName={account.firts_name}
                                lastName={account.last_name}
                                image={account.image}
                                size={72}
                            />
                            <p className="text-sm text-slate-600">
                                {account.description || (
                                    <span className="text-slate-400">
                                        Sumá una foto y contá a qué te dedicás: es lo primero que ve
                                        el cliente en tu link de reserva.
                                    </span>
                                )}
                            </p>
                        </div>

                        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        <Field label="Nombre">
                            {account.firts_name} {account.last_name}
                        </Field>
                        <Field label="Email">{account.email}</Field>
                        <Field label="Teléfono">
                            {account.phone || <span className="text-slate-400">Sin cargar</span>}
                        </Field>
                        <Field label="Tipo de cuenta">
                            {ROLE_LABELS[account.role] ?? account.role}
                        </Field>
                        <Field label="Tu link de reserva">
                            {account.slug ? (
                                <Link
                                    href={`/turnos/${account.slug}`}
                                    className="text-indigo-600 hover:underline"
                                >
                                    /turnos/{account.slug}
                                </Link>
                            ) : (
                                <span className="text-slate-400">Sin link</span>
                            )}
                        </Field>
                        <Field label="Cliente desde">{formatDate(account.created_at)}</Field>
                        </dl>
                    </>
                )}
            </div>

         
        </section>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-slate-900">{children}</dd>
        </div>
    );
}
