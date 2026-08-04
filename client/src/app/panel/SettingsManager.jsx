"use client";

import { useEffect, useState, useTransition } from "react";
import { getPanelSettings, updatePanelSettings, changeMyPassword } from "../lib/api";

// Las opciones que se guardan solas al tocarlas (los switches) y las que van con
// un botón Guardar (los números) están separadas a propósito: un switch con
// botón se siente roto, y un número que se guarda mientras lo escribís, también.
export default function SettingsManager({ token }) {
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState(null);
    const [loading, startTransition] = useTransition();
    const [flash, setFlash] = useState(null);

    useEffect(() => {
        startTransition(async () => {
            try {
                const data = await getPanelSettings(token);
                setSettings(data.settings);
                setError(null);
            } catch (err) {
                setError(err.message);
            }
        });
    }, [token]);

    useEffect(() => {
        if (!flash) return;
        const timer = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(timer);
    }, [flash]);

    const save = async (changes, previous) => {
        setSettings((prev) => ({ ...prev, ...changes }));
        setError(null);
        try {
            const data = await updatePanelSettings(token, changes);
            setSettings(data.settings);
            setFlash("Configuración guardada");
        } catch (err) {
            // Vuelve atrás el cambio optimista para no mostrar algo que no se guardó.
            setSettings((prev) => ({ ...prev, ...previous }));
            setError(err.message);
        }
    };

    if (loading) return <p className="text-sm text-slate-400">Cargando configuración...</p>;
    if (error && !settings) return <p className="text-sm text-rose-600">{error}</p>;
    if (!settings) return null;

    return (
        <div className="space-y-6">
            <Card
                title="Turnos"
                description="Qué pasa cuando un cliente reserva con vos."
            >
                <SwitchRow
                    label="Aceptar turnos automáticamente"
                    hint="Se confirman solos y el cliente recibe el mail al instante, sin pasar por Turnos solicitados."
                    checked={settings.auto_accept}
                    onChange={(value) =>
                        save({ auto_accept: value }, { auto_accept: settings.auto_accept })
                    }
                />
                <SwitchRow
                    label="Avisarme por email de cada turno nuevo"
                    hint="Si lo apagás, los turnos te siguen apareciendo en el panel igual."
                    checked={settings.notify_on_booking}
                    onChange={(value) =>
                        save(
                            { notify_on_booking: value },
                            { notify_on_booking: settings.notify_on_booking }
                        )
                    }
                />
            </Card>

            <Card
                title="Reglas de reserva"
                description="Con cuánta anticipación te pueden reservar y hasta cuándo pueden cancelar."
            >
                <NumberRow
                    label="Antelación mínima"
                    unit="horas"
                    hint="No se pueden reservar turnos que empiecen antes de ese plazo. En 0, se puede reservar hasta último momento."
                    value={settings.min_notice_hours}
                    min={0}
                    max={720}
                    onSave={(value) =>
                        save(
                            { min_notice_hours: value },
                            { min_notice_hours: settings.min_notice_hours }
                        )
                    }
                />
                <NumberRow
                    label="Se puede reservar hasta"
                    unit="días adelante"
                    hint="Más allá de esa fecha no se muestran horarios libres."
                    value={settings.max_days_ahead}
                    min={1}
                    max={365}
                    onSave={(value) =>
                        save({ max_days_ahead: value }, { max_days_ahead: settings.max_days_ahead })
                    }
                />
                <NumberRow
                    label="El cliente puede cancelar hasta"
                    unit="horas antes"
                    hint="Pasado ese límite tiene que escribirte a vos. En 0, puede cancelar hasta que empiece el turno."
                    value={settings.cancel_notice_hours}
                    min={0}
                    max={720}
                    onSave={(value) =>
                        save(
                            { cancel_notice_hours: value },
                            { cancel_notice_hours: settings.cancel_notice_hours }
                        )
                    }
                />
            </Card>

            <PasswordCard token={token} onDone={() => setFlash("Contraseña actualizada")} />

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {flash && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {flash}
                </p>
            )}
        </div>
    );
}

function Card({ title, description, children }) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-medium text-slate-900">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            <div className="mt-4 divide-y divide-slate-100">{children}</div>
        </section>
    );
}

function SwitchRow({ label, hint, checked, onChange }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <div>
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={() => onChange(!checked)}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                    checked ? "bg-indigo-600" : "bg-slate-300"
                }`}
            >
                <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        checked ? "translate-x-5" : "translate-x-0"
                    }`}
                />
            </button>
        </div>
    );
}

function NumberRow({ label, unit, hint, value, min, max, onSave }) {
    const [draft, setDraft] = useState(String(value));
    const dirty = draft !== String(value);

    return (
        <div className="flex flex-wrap items-start justify-between gap-4 py-3">
            <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={label}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-500">{unit}</span>
                {dirty && (
                    <button
                        type="button"
                        onClick={() => onSave(Number(draft))}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700"
                    >
                        Guardar
                    </button>
                )}
            </div>
        </div>
    );
}

function PasswordCard({ token, onDone }) {
    const [form, setForm] = useState({ current_password: "", new_password: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await changeMyPassword(token, form);
            setForm({ current_password: "", new_password: "" });
            onDone();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-medium text-slate-900">Contraseña</h3>
            <p className="mt-0.5 text-sm text-slate-500">
                Para cambiarla necesitás la actual.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                            Contraseña actual
                        </label>
                        <input
                            type="password"
                            required
                            autoComplete="current-password"
                            value={form.current_password}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, current_password: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                            Contraseña nueva
                        </label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={form.new_password}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, new_password: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres.</p>
                    </div>
                </div>

                {error && <p className="text-sm text-rose-600">{error}</p>}

                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? "Guardando..." : "Cambiar contraseña"}
                </button>
            </form>
        </section>
    );
}
