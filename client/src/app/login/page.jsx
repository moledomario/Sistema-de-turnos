import LoginForm from "./LoginForm";

export default function LoginPage() {
    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <h1 className="text-2xl font-semibold text-slate-900 text-center">
                Iniciar sesión
            </h1>
            <p className="text-slate-500 text-center mt-1 mb-8">
                Ingresá con tu email y contraseña.
            </p>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <LoginForm />
            </div>
        </main>
    );
}
