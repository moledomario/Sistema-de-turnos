import MisTurnosClient from "./MisTurnosClient";

export default function MisTurnosPage() {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-2xl font-semibold text-slate-900 text-center">
                Mis turnos
            </h1>
            <p className="text-slate-500 text-center mt-1 mb-8">
                Consultá, cancelá o reprogramá tus turnos reservados.
            </p>

            <MisTurnosClient />
        </main>
    );
}
