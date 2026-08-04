"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { PLANS, formatPrice, findSubscriptionLabel } from "@/lib/plans";
import { getMySubscription, subscribeToPlan } from "../lib/api";

const TONE_CLASSES = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
};

export default function PricingPlans({ token }) {
    const [subscription, setSubscription] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);
    // Qué plan está esperando respuesta de Mercado Pago. Se guarda el id y no un
    // booleano para poder deshabilitar solo el botón que se apretó.
    const [pendingPlan, setPendingPlan] = useState(null);

    useEffect(() => {
        if (!token) return;

        let cancelled = false;
        (async () => {
            try {
                const data = await getMySubscription(token);
                if (!cancelled) setSubscription(data.subscription);
            } catch {
                // No poder leer el estado no tiene que romper la vidriera: los
                // precios se ven igual, solo que sin el cartel de "tu suscripción".
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleSubscribe = async (planId) => {
        setError(null);
        setPendingPlan(planId);
        try {
            const { init_point } = await subscribeToPlan(token, planId);
            // Se va del sitio a propósito: la tarjeta se carga en el checkout de
            // Mercado Pago, así nosotros nunca vemos esos datos. Va `assign` y no
            // `location.href = ...` porque el compilador de React no permite
            // asignarle a un objeto de afuera del componente; hacen lo mismo.
            window.location.assign(init_point);
        } catch (err) {
            setError(err.message);
            setPendingPlan(null);
        }
    };

    const status = subscription?.subscription_status ?? "NONE";
    const label = findSubscriptionLabel(status);
    const activePlan = status === "AUTHORIZED" ? subscription?.plan : null;
    // Con una suscripción viva el server rechaza crear otra (quedarían dos
    // débitos mensuales). Mejor deshabilitar el botón que dejar que lo aprete y
    // se coma un 409.
    const hasLiveSubscription = ["AUTHORIZED", "PAUSED"].includes(status);

    return (
        <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Planes de Turnos</h2>
            <p className="text-sm text-slate-500 mb-6">
                Cuánto cuesta usar el sistema, según cuántos profesionales lo usan.
            </p>

            {token && loaded && status !== "NONE" && (
                <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-600">Tu suscripción:</span>
                    <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[label.tone]}`}
                    >
                        {label.text}
                    </span>
                    {hasLiveSubscription && (
                        <span className="text-slate-500">
                            Para cambiar de plan, cancelá la actual desde Cuenta.
                        </span>
                    )}
                </div>
            )}

            {error && (
                <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {PLANS.map((plan) => {
                    const isCurrent = plan.id === activePlan;
                    const isPending = pendingPlan === plan.id;
                    const disabled =
                        !token || isCurrent || hasLiveSubscription || Boolean(pendingPlan);

                    return (
                        <div
                            key={plan.id}
                            className={`relative flex flex-col rounded-xl border bg-white p-5 shadow-sm ${
                                plan.recommended
                                    ? "border-indigo-500 ring-1 ring-indigo-500"
                                    : "border-slate-200"
                            }`}
                        >
                            {plan.recommended && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-medium text-white">
                                    Recomendado
                                </span>
                            )}

                            <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                            <p className="mt-1 text-sm text-slate-500">{plan.description}</p>

                            <p className="mt-4">
                                <span className="text-2xl font-semibold text-slate-900">
                                    ${formatPrice(plan.price)}
                                </span>
                                <span className="text-sm text-slate-500"> /mes</span>
                            </p>

                            <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <button
                                type="button"
                                onClick={() => handleSubscribe(plan.id)}
                                disabled={disabled}
                                className={`mt-5 w-full rounded-lg py-2 text-sm font-medium transition ${
                                    plan.recommended
                                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                                {isCurrent
                                    ? "Tu plan actual"
                                    : isPending
                                      ? "Abriendo Mercado Pago..."
                                      : "Suscribirme"}
                            </button>
                        </div>
                    );
                })}
            </div>

            <p className="mt-4 text-xs text-slate-400">
                El pago lo procesa Mercado Pago. Se debita una vez por mes y podés cancelarlo cuando
                quieras desde Cuenta.
            </p>
        </section>
    );
}
