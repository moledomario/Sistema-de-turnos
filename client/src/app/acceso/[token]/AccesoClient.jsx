"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";

export default function AccesoClient({ token }) {
    const router = useRouter();
    const { loginWithMagicLink } = useAuth();
    const [error, setError] = useState(null);
    // El token se quema al usarlo, así que el canje tiene que salir una sola vez.
    // En desarrollo, StrictMode monta el componente dos veces: sin este candado
    // el segundo intento canjearía un token ya gastado y mostraría un error
    // aunque la sesión hubiera abierto bien.
    const canjeado = useRef(false);

    useEffect(() => {
        if (canjeado.current) return;
        canjeado.current = true;

        (async () => {
            try {
                await loginWithMagicLink(token);
                router.replace("/mis-turnos");
            } catch (err) {
                setError(err.message);
            }
        })();
    }, [token, loginWithMagicLink, router]);

    if (error) {
        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
                <p className="text-sm font-medium text-rose-900">No pudimos abrir tus turnos</p>
                <p className="mt-1 text-sm text-rose-800">{error}</p>
                <Link
                    href="/mis-turnos"
                    className="mt-4 inline-block rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                    Pedir un link nuevo
                </Link>
            </div>
        );
    }

    return (
        <p className="text-center text-slate-400">Entrando...</p>
    );
}
