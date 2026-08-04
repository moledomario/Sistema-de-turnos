import Link from "next/link";

// Landing provisoria: los clientes reservan por el link único de su
// profesional (/turnos/[slug]), no por acá. Esta página es solo el punto de
// entrada para profesionales hasta que exista la landing real de suscripción.
export default function Home() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">Turnos</h1>
            <p className="text-slate-500 mt-2">
                Gestioná tu agenda y compartí tu link de reserva con tus clientes.
            </p>
            <div className="mt-8 flex justify-center gap-3">
                <Link
                    href="/login"
                    className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                    Iniciar sesión
                </Link>
                <Link
                    href="/register"
                    className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700"
                >
                    Crear mi cuenta
                </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
                ¿Venís a sacar un turno? Entrá por el link que te pasó tu profesional, no
                necesitás cuenta.
            </p>
        </main>
    );
}
