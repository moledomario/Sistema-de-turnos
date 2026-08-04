"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/AuthContext";
import { getMySubscription } from "../../lib/api";
import { findPlan, findSubscriptionLabel } from "@/lib/plans";

// Cuántas veces preguntar por el estado antes de rendirse. El webhook de Mercado
// Pago suele llegar en segundos, pero no es instantáneo: si mostráramos el
// estado una sola vez, el profesional volvería del checkout y vería "esperando
// el pago" aunque ya haya pagado.
const INTENTOS = 6;
const ESPERA_MS = 2000;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function SuscripcionPage() {
    const { token, loading: authLoading } = useAuth();
    const [subscription, setSubscription] = useState(null);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (authLoading || !token) return;

        let cancelled = false;
        (async () => {
            for (let intento = 0; intento < INTENTOS; intento++) {
                try {
                    const data = await getMySubscription(token);
                    if (cancelled) return;

                    setSubscription(data.subscription);

                    // AUTHORIZED es el estado final feliz; con CANCELLED tampoco
                    // tiene sentido seguir esperando.
                    if (["AUTHORIZED", "CANCELLED"].includes(data.subscription?.subscription_status)) {
                        break;
                    }
                } catch (err) {
                    if (cancelled) return;
                    setError(err.message);
                    break;
                }

                if (intento < INTENTOS - 1) await esperar(ESPERA_MS);
            }

            if (!cancelled) setDone(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [token, authLoading]);

    const status = subscription?.subscription_status ?? "NONE";
    const label = findSubscriptionLabel(status);
    const plan = findPlan(subscription?.plan);
    const confirmada = status === "AUTHORIZED";

    return (
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
            {!done && !subscription && (
                <>
                    <h1 className="text-xl font-semibold text-slate-900">
                        Confirmando tu suscripción...
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        Estamos esperando que Mercado Pago nos confirme el pago.
                    </p>
                </>
            )}

            {subscription && (
                <>
                    <h1 className="text-xl font-semibold text-slate-900">
                        {confirmada ? `¡Listo! Ya tenés el plan ${plan.name}` : "Suscripción registrada"}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        Estado: <span className="font-medium text-slate-700">{label.text}</span>
                    </p>

                    {!confirmada && done && (
                        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Todavía no nos llegó la confirmación de Mercado Pago. Si ya cargaste la
                            tarjeta, puede tardar unos minutos: revisá de nuevo en Cuenta más tarde.
                        </p>
                    )}
                </>
            )}

            {error && (
                <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </p>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                    href="/panel/cuenta"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                    Ir a mi cuenta
                </Link>
                <Link
                    href="/panel"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                    Volver al panel
                </Link>
            </div>
        </main>
    );
}
