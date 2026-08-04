import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <h1 className="text-2xl font-semibold text-slate-900 text-center">
                Creá tu cuenta profesional
            </h1>
            <p className="text-slate-500 text-center mt-1 mb-8">
                Para tener tu agenda y que tus clientes reserven con vos.
            </p>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <RegisterForm />
            </div>

            {/* La cuenta es para quien ofrece turnos: el que reserva no necesita
                registrarse, entra por el link del profesional. */}
            <p className="mt-6 text-center text-sm text-slate-500">
                ¿Venís a sacar un turno? No hace falta que te registres: pedile a tu profesional
                su link de reserva.
            </p>
        </main>
    );
}
