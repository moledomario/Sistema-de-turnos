"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../lib/AuthContext";
import {
    updateMyAccount,
    createMyService,
    saveAvailabilityDay,
    updatePanelSettings,
    completeOnboarding,
} from "../lib/api";
import ImageField from "../components/ImageField";

const STEPS = [
    { title: "Tu link", hint: "Dónde te reservan" },
    { title: "Tu primer servicio", hint: "Qué ofrecés" },
    { title: "Tus horarios", hint: "Cuándo atendés" },
    { title: "Los turnos", hint: "Cómo los confirmás" },
];

const WEEKDAYS = [
    { value: 1, label: "Lun" },
    { value: 2, label: "Mar" },
    { value: 3, label: "Mié" },
    { value: 4, label: "Jue" },
    { value: 5, label: "Vie" },
    { value: 6, label: "Sáb" },
    { value: 0, label: "Dom" },
];

function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

export default function OnboardingWizard() {
    const router = useRouter();
    const { user, token, loading, refreshUser } = useAuth();

    const [step, setStep] = useState(0);
    const [done, setDone] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Lo que se fue guardando, para el resumen final.
    const [created, setCreated] = useState({ service: false, schedule: false });

    // `slug: null` significa "todavía no lo tocó": se muestra el que generó el
    // registro a partir del nombre, sin pisarlo mientras escribe.
    const [account, setAccount] = useState({ slug: null, phone: "" });
    const [service, setService] = useState({
        name: "",
        duration: "30",
        price: "",
        image: null,
        requires_deposit: false,
        deposit_amount: "",
        bank_details: "",
    });
    const [schedule, setSchedule] = useState({
        weekdays: [1, 2, 3, 4, 5],
        start: "09:00",
        end: "18:00",
    });
    const [autoAccept, setAutoAccept] = useState(false);

    if (loading) {
        return <p className="py-10 text-center text-slate-400">Cargando...</p>;
    }

    if (!user) {
        router.replace("/login");
        return null;
    }

    if (user.role !== "PROFESSIONAL") {
        return (
            <p className="py-10 text-center text-slate-500">
                Esta configuración es solo para cuentas profesionales.
            </p>
        );
    }

    const runStep = async (action) => {
        setSaving(true);
        setError(null);
        try {
            await action();
            setStep((prev) => prev + 1);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const slug = account.slug ?? user.slug ?? "";

    const saveAccount = () =>
        runStep(async () => {
            const { account: updated } = await updateMyAccount(token, {
                firts_name: user.firts_name,
                last_name: user.last_name,
                phone: account.phone.trim() || null,
                slug,
            });
            setAccount((prev) => ({ ...prev, slug: updated.slug }));
            await refreshUser();
        });

    const saveService = () =>
        runStep(async () => {
            await createMyService(token, {
                name: service.name,
                duration: Number(service.duration),
                ...(service.price === "" ? {} : { price: Number(service.price) }),
                ...(service.image ? { image: service.image } : {}),
                requires_deposit: service.requires_deposit,
                ...(service.requires_deposit
                    ? {
                          deposit_amount: Number(service.deposit_amount),
                          bank_details: service.bank_details.trim(),
                      }
                    : {}),
            });
            setCreated((prev) => ({ ...prev, service: true }));
        });

    const saveSchedule = () =>
        runStep(async () => {
            const ranges = [
                {
                    start_minutes: timeToMinutes(schedule.start),
                    end_minutes: timeToMinutes(schedule.end),
                },
            ];
            if (ranges[0].end_minutes <= ranges[0].start_minutes) {
                throw new Error("El horario de fin tiene que ser posterior al de inicio");
            }
            for (const weekday of schedule.weekdays) {
                await saveAvailabilityDay(token, { weekday, ranges });
            }
            setCreated((prev) => ({ ...prev, schedule: schedule.weekdays.length > 0 }));
        });

    const finish = async () => {
        setSaving(true);
        setError(null);
        try {
            await updatePanelSettings(token, { auto_accept: autoAccept });
            await completeOnboarding(token);
            await refreshUser();
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const skip = () => {
        setError(null);
        setStep((prev) => prev + 1);
    };

    if (done) {
        return <OnboardingDone slug={slug} created={created} />;
    }

    return (
        <div>
            <Steps current={step} />

            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                {step === 0 && (
                    <StepLink
                        slug={slug}
                        phone={account.phone}
                        setAccount={setAccount}
                        name={user.firts_name}
                    />
                )}
                {step === 1 && <StepService service={service} setService={setService} />}
                {step === 2 && <StepSchedule schedule={schedule} setSchedule={setSchedule} />}
                {step === 3 && <StepRequests value={autoAccept} onChange={setAutoAccept} />}

                {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={
                            step === 0
                                ? saveAccount
                                : step === 1
                                ? saveService
                                : step === 2
                                ? saveSchedule
                                : finish
                        }
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? "Guardando..." : step === 3 ? "Terminar" : "Continuar"}
                    </button>

                    {/* Los pasos 1 y 2 se pueden dejar para después: sin ellos el
                        link no sirve todavía, y eso se avisa al final. */}
                    {(step === 1 || step === 2) && (
                        <button
                            type="button"
                            onClick={skip}
                            disabled={saving}
                            className="text-sm text-slate-500 transition hover:text-slate-700"
                        >
                            Lo hago después
                        </button>
                    )}

                    {step > 0 && (
                        <button
                            type="button"
                            onClick={() => setStep((prev) => prev - 1)}
                            disabled={saving}
                            className="ml-auto text-sm text-slate-400 transition hover:text-slate-600"
                        >
                            Volver
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function Steps({ current }) {
    return (
        <ol className="flex flex-wrap gap-2">
            {STEPS.map((item, index) => {
                const state =
                    index < current ? "done" : index === current ? "current" : "pending";
                return (
                    <li
                        key={item.title}
                        className={`flex-1 rounded-lg border px-3 py-2 ${
                            state === "current"
                                ? "border-indigo-500 bg-indigo-50/50"
                                : state === "done"
                                ? "border-emerald-200 bg-emerald-50/50"
                                : "border-slate-200"
                        }`}
                    >
                        <p
                            className={`text-xs font-medium ${
                                state === "pending" ? "text-slate-400" : "text-slate-900"
                            }`}
                        >
                            {state === "done" ? "✓ " : `${index + 1}. `}
                            {item.title}
                        </p>
                        <p className="text-[11px] text-slate-400">{item.hint}</p>
                    </li>
                );
            })}
        </ol>
    );
}

function StepHeader({ title, description }) {
    return (
        <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
    );
}

const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function StepLink({ slug, phone, setAccount, name }) {
    return (
        <div>
            <StepHeader
                title={`Bienvenido, ${name}`}
                description="Este es el link que vas a compartir con tus clientes para que reserven."
            />

            <label className="mb-1 block text-xs font-medium text-slate-700">
                Tu link de reserva
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
                <span className="pl-3 text-sm text-slate-400">/turnos/</span>
                <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) =>
                        setAccount((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))
                    }
                    className="flex-1 rounded-r-lg px-1 py-2 text-sm focus:outline-none"
                />
            </div>
            <p className="mt-1 text-xs text-slate-400">
                Solo letras, números y guiones. Lo armamos con tu nombre, pero podés cambiarlo.
            </p>

            <div className="mt-4 sm:w-1/2">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                    Teléfono (opcional)
                </label>
                <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setAccount((prev) => ({ ...prev, phone: e.target.value }))}
                    className={inputClass}
                />
            </div>
        </div>
    );
}

function StepService({ service, setService }) {
    const setField = (field, value) => setService((prev) => ({ ...prev, [field]: value }));

    return (
        <div>
            <StepHeader
                title="Tu primer servicio"
                description="Lo que el cliente elige antes de ver los horarios. Después podés agregar más."
            />

            <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
                <ImageField
                    label="Imagen (opcional)"
                    value={service.image}
                    onChange={(image) => setField("image", image)}
                />

                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                            Nombre del servicio
                        </label>
                        <input
                            type="text"
                            required
                            autoFocus
                            placeholder="Ej: Consulta, Corte, Sesión de kinesiología"
                            value={service.name}
                            onChange={(e) => setField("name", e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                                Duración (min)
                            </label>
                            <input
                                type="number"
                                min="5"
                                required
                                value={service.duration}
                                onChange={(e) => setField("duration", e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                                Valor (opcional)
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={service.price}
                                onChange={(e) => setField("price", e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                                type="checkbox"
                                checked={service.requires_deposit}
                                onChange={(e) => setField("requires_deposit", e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            ¿Necesita seña?
                        </label>
                        {service.requires_deposit && (
                            <div className="mt-3 space-y-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">
                                        Monto de la seña
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={service.deposit_amount}
                                        onChange={(e) => setField("deposit_amount", e.target.value)}
                                        className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">
                                        Datos de la cuenta para transferir
                                    </label>
                                    <textarea
                                        required
                                        rows={3}
                                        value={service.bank_details}
                                        onChange={(e) => setField("bank_details", e.target.value)}
                                        placeholder={"Alias: mi.alias.mp\nCBU: 0000003100010000000001\nTitular: Nombre Apellido"}
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StepSchedule({ schedule, setSchedule }) {
    const toggleDay = (weekday) => {
        setSchedule((prev) => ({
            ...prev,
            weekdays: prev.weekdays.includes(weekday)
                ? prev.weekdays.filter((day) => day !== weekday)
                : [...prev.weekdays, weekday],
        }));
    };

    return (
        <div>
            <StepHeader
                title="Tus horarios de atención"
                description="Los días y el horario en que atendés. Si cortás al mediodía, el corte lo agregás después desde el panel."
            />

            <span className="mb-2 block text-xs font-medium text-slate-700">Días</span>
            <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                    const active = schedule.weekdays.includes(day.value);
                    return (
                        <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value)}
                            aria-pressed={active}
                            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                                active
                                    ? "border-indigo-500 bg-indigo-600 text-white"
                                    : "border-slate-300 text-slate-600 hover:border-slate-400"
                            }`}
                        >
                            {day.label}
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Desde</label>
                    <input
                        type="time"
                        value={schedule.start}
                        onChange={(e) =>
                            setSchedule((prev) => ({ ...prev, start: e.target.value }))
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Hasta</label>
                    <input
                        type="time"
                        value={schedule.end}
                        onChange={(e) => setSchedule((prev) => ({ ...prev, end: e.target.value }))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            </div>
        </div>
    );
}

function StepRequests({ value, onChange }) {
    return (
        <div>
            <StepHeader
                title="¿Cómo querés confirmar los turnos?"
                description="Lo podés cambiar cuando quieras desde Turnos solicitados."
            />

            <div className="space-y-3">
                <ChoiceCard
                    checked={!value}
                    onChange={() => onChange(false)}
                    title="Los reviso yo"
                    description="Cada reserva entra como solicitud y vos la aceptás o la rechazás. El cliente recibe un mail con tu respuesta."
                />
                <ChoiceCard
                    checked={value}
                    onChange={() => onChange(true)}
                    title="Se confirman solos"
                    description="El turno queda confirmado al instante y el cliente recibe el mail enseguida."
                />
            </div>
        </div>
    );
}

function ChoiceCard({ checked, onChange, title, description }) {
    return (
        <label
            className={`block cursor-pointer rounded-xl border p-4 transition ${
                checked
                    ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500"
                    : "border-slate-300 hover:border-slate-400"
            }`}
        >
            <span className="flex items-center gap-2">
                <input
                    type="radio"
                    name="auto-accept"
                    checked={checked}
                    onChange={onChange}
                    className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-900">{title}</span>
            </span>
            <span className="mt-1 block pl-6 text-xs text-slate-500">{description}</span>
        </label>
    );
}

function OnboardingDone({ slug, created }) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/turnos/${slug}` : "";
    const pending = [
        !created.service && {
            text: "Cargá tu primer servicio",
            href: "/panel/servicios",
        },
        !created.schedule && {
            text: "Cargá tus horarios de atención",
            href: "/panel/horarios",
        },
    ].filter(Boolean);

    return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
            </div>
            <h2 className="text-lg font-semibold text-emerald-900">¡Tu cuenta está lista!</h2>
            <p className="mt-2 text-sm text-emerald-800">
                Compartí este link con tus clientes para que reserven:
            </p>
            <p className="mt-2 break-all rounded-lg bg-white/70 px-3 py-2 font-medium text-emerald-900">
                {url}
            </p>

            {pending.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
                    <p className="text-sm font-medium text-amber-900">
                        Antes de compartirlo te falta:
                    </p>
                    <ul className="mt-1 space-y-1">
                        {pending.map((item) => (
                            <li key={item.href} className="text-sm">
                                <Link href={item.href} className="text-amber-800 hover:underline">
                                    {item.text} →
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-4 text-left text-sm text-emerald-800">
                <p className="font-medium">Después, cuando quieras:</p>
                <ul className="mt-1 space-y-1">
                    <li>
                        <Link href="/panel/cuenta" className="hover:underline">
                            Sumar a tu equipo de profesionales →
                        </Link>
                    </li>
                    <li>
                        <Link href="/panel/horarios" className="hover:underline">
                            Agregar cortes a tus horarios →
                        </Link>
                    </li>
                    <li>
                        <Link href="/panel/precios" className="hover:underline">
                            Ver los planes →
                        </Link>
                    </li>
                </ul>
            </div>

            <Link
                href="/panel"
                className="mt-6 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
                Ir a mi panel
            </Link>
        </div>
    );
}
