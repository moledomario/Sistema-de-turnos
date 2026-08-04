import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({ params }) {
    const { token } = await params;

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <h1 className="text-center text-2xl font-semibold text-slate-900">
                Elegí tu contraseña nueva
            </h1>
            <p className="mt-1 mb-8 text-center text-slate-500">
                Con esta contraseña vas a entrar a tu panel.
            </p>

            <ResetPasswordForm token={token} />
        </main>
    );
}
