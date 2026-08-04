"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrCode({ slug }) {
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const url = typeof window !== "undefined" ? `${window.location.origin}/turnos/${slug}` : "";

    useEffect(() => {
        if (!url) return;
        let cancelled = false;

        QRCode.toDataURL(url, { width: 200, margin: 1 }).then((dataUrl) => {
            if (!cancelled) setQrDataUrl(dataUrl);
        });

        return () => {
            cancelled = true;
        };
    }, [url]);

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900 mb-1">Código QR</h2>
            <p className="text-sm text-slate-500 mb-3">
                Al escanearlo, tus clientes entran directo a sacar un turno con vos.
            </p>

            {qrDataUrl ? (
                <div className="flex flex-col items-center gap-3">
                    {/* next/image no aplica: el QR es una data URL que se genera en
                        el navegador, no hay nada que el optimizador pueda hacer con
                        ella (y el <a download> de abajo necesita esa misma URL). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={qrDataUrl}
                        alt="Código QR para reservar turnos"
                        width={200}
                        height={200}
                        className="rounded-lg border border-slate-200"
                    />
                    <a
                        href={qrDataUrl}
                        download={`turnos-qr-${slug}.png`}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                    >
                        Descargar
                    </a>
                </div>
            ) : (
                <p className="text-sm text-slate-400">Generando código QR...</p>
            )}
        </div>
    );
}
