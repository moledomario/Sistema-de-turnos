"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { findPlan, formatPrice, findSubscriptionLabel, isSubscriptionCancellable } from "@/lib/plans";
import { getMySubscription, cancelSubscription } from "../lib/api";

const TONE_CLASSES = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
};

function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

export default function SubscriptionCard({ token }) {
    const [subscription, setSubscription] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        if (!token) return;

        let cancelled = false;
        (async () => {
            try {
                const data = await getMySubscription(token);
                if (!cancelled) setSubscription(data.subscription);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const handleCancel = async () => {
        if (
            !window.confirm(
                "¿Cancelar la suscripción? Se deja de debitar, y para volver a tenerla hay que contratarla de nuevo."
            )
        ) {
            return;
        }

        setCancelling(true);
        setError(null);
        try {
            const data = await cancelSubscription(token);
            setSubscription(data.subscription);
        } catch (err) {
            setError(err.message);
        } finally {
            setCancelling(false);
        }
    };

    if (!loaded) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-400">Cargando tu plan...</p>
            </div>
        );
    }

    const status = subscription?.subscription_status ?? "NONE";
    const label = findSubscriptionLabel(status);
    const plan = findPlan(subscription?.plan);

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-medium text-slate-900">Tu plan</h3>
                    <p className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-xl font-semibold text-indigo-700">{plan.name}</span>
                        <span className="text-sm text-slate-500">
                            ${formatPrice(plan.price)} /mes
                        </span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[label.tone]}`}
                        >
                            {label.text}
                        </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{plan.description}</p>

                    {status === "AUTHORIZED" && subscription?.subscription_next_payment && (
                        <p className="mt-2 text-sm text-slate-500">
                            Próximo débito: {formatDate(subscription.subscription_next_payment)}
                        </p>
                    )}

                    {status === "PENDING" && (
                        <p className="mt-2 text-sm text-amber-700">
                            Falta cargar la tarjeta en Mercado Pago para que quede activa.
                        </p>
                    )}
                </div>

                <Link
                    href="/panel/precios"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                    Ver planes
                </Link>
            </div>

            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

            {isSubscriptionCancellable(status) ? (
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="mt-4 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {cancelling ? "Cancelando..." : "Cancelar suscripción"}
                </button>
            ) : (
                <p className="mt-3 text-xs text-slate-400">
                    {status === "NONE"
                        ? "Todavía no contrataste ningún plan."
                        : "La suscripción está cancelada. Podés contratar un plan nuevo cuando quieras."}
                </p>
            )}
        </div>
    );
}
