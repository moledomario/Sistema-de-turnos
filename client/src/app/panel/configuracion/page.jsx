"use client";

import { useAuth } from "../../lib/AuthContext";
import SettingsManager from "../SettingsManager";

export default function ConfiguracionPage() {
    const { token } = useAuth();

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Configuración</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Cómo funciona tu agenda para vos y para tus clientes.
                </p>
            </div>
            <SettingsManager token={token} />
        </main>
    );
}
