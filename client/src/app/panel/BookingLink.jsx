"use client";

import { useState } from "react";

export default function BookingLink({ slug }) {
    const [copied, setCopied] = useState(false);
    const url = typeof window !== "undefined" ? `${window.location.origin}/turnos/${slug}` : "";

    const handleCopy = async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900 mb-1">Tu link de reserva</h2>
            <p className="text-sm text-slate-500 mb-3">
                Compartilo con tus clientes para que reserven turnos con vos.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
                <button
                    onClick={handleCopy}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                    {copied ? "¡Copiado!" : "Copiar"}
                </button>
            </div>
        </div>
    );
}
