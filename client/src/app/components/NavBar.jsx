"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

export default function NavBar() {
    const { user, loading, logout } = useAuth();
    const pathname = usePathname();

    // El panel del profesional tiene su propia navegación (sidebar), así que
    // no se apila el NavBar arriba de eso.
    if (pathname?.startsWith("/panel")) {
        return null;
    }

    return (
        <header className="border-b border-slate-200 bg-white">
            <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
                <Link href="/" className="font-semibold text-slate-900">
                    Turnos
                </Link>

                <div className="flex items-center gap-4 text-sm">
                    {loading ? null : user ? (
                        <>
                            {/* "Mis turnos" es la agenda de quien reserva. Un
                                profesional no saca turnos con otro, así que ve
                                directo su panel. */}
                            {user.role === "PROFESSIONAL" ? (
                                <Link
                                    href="/panel"
                                    className="font-medium text-slate-700 hover:text-indigo-600"
                                >
                                    Mi panel
                                </Link>
                            ) : (
                                <Link
                                    href="/mis-turnos"
                                    className="font-medium text-slate-700 hover:text-indigo-600"
                                >
                                    Mis turnos
                                </Link>
                            )}
                            <span className="text-slate-600">
                                Hola, {user.firts_name}
                            </span>
                            <button
                                onClick={logout}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cerrar sesión
                            </button>
                        </>
                    ) : (
                        <>
                            {/* El cliente no tiene contraseña, así que "Iniciar
                                sesión" no es su puerta: entra por acá y pide su
                                link por mail. */}
                            <Link
                                href="/mis-turnos"
                                className="font-medium text-slate-700 hover:text-indigo-600"
                            >
                                Mis turnos
                            </Link>
                            <Link
                                href="/login"
                                className="font-medium text-slate-700 hover:text-indigo-600"
                            >
                                Iniciar sesión
                            </Link>
                            {/* La cuenta es para profesionales; el cliente
                                reserva sin registrarse. */}
                            <Link
                                href="/register"
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-700"
                            >
                                Soy profesional
                            </Link>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
}
