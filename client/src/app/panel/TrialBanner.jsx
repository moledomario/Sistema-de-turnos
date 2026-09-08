"use client";

import Link from "next/link";
import { useAuth } from "../lib/AuthContext";

// El estado de acceso lo calcula el server (server/src/lib/access.js) y viaja
// en `user.access`. Acá no se vuelve a decidir quién entra: solo se elige cómo
// contarlo. Si esto lo recalculara por su cuenta, tarde o temprano diría algo
// distinto de lo que el server efectivamente permite.
export default function TrialBanner() {
    const { user, loading } = useAuth();

    if (loading) return null;

    const access = user?.access;
    // `access` viene en null para los clientes: no tienen prueba ni suscripción.
    if (!access) return null;

    // Pagando al día no hay nada que avisar. Un banner permanente en el panel
    // de alguien que ya es cliente es puro ruido.
    if (access.reason === "subscription") return null;

    if (!access.active) {
        return (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
                <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-rose-800">
                        <span className="font-medium">
                            {access.reason === "trial_expired"
                                ? "Se terminó tu prueba gratis."
                                : "Tu suscripción no está activa."}
                        </span>{" "}
                        Tu link dejó de recibir turnos nuevos. Los que ya tenías siguen
                        en tu agenda y podés gestionarlos.
                    </p>
                    <Link
                        href="/panel/suscripcion"
                        className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700"
                    >
                        Suscribirme
                    </Link>
                </div>
            </div>
        );
    }

    // Prueba corriendo. Los últimos días se muestran en ámbar porque ahí el
    // aviso pasa de ser un dato a ser algo que conviene resolver.
    const quedanPocos = access.trial_days_left <= 3;
    const dias = access.trial_days_left;

    return (
        <div
            className={`border-b px-4 py-2.5 ${
                quedanPocos ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
            }`}
        >
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
                <p className={`text-sm ${quedanPocos ? "text-amber-800" : "text-slate-600"}`}>
                    {dias === 1
                        ? "Te queda 1 día de prueba gratis."
                        : `Te quedan ${dias} días de prueba gratis.`}
                </p>
                <Link
                    href="/panel/suscripcion"
                    className={`shrink-0 text-sm font-medium underline-offset-2 hover:underline ${
                        quedanPocos ? "text-amber-900" : "text-indigo-600"
                    }`}
                >
                    Ver planes
                </Link>
            </div>
        </div>
    );
}
