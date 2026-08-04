"use client";

import { useState } from "react";
import { fileToResizedDataUrl } from "../lib/image";

// Selector de imagen con preview. Entrega la foto ya redimensionada como data
// URL (o null si se quita), que es la forma en que se guardan en la base.
export default function ImageField({ label, value, onChange, aspect = "aspect-video" }) {
    const [error, setError] = useState(null);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        try {
            onChange(await fileToResizedDataUrl(file));
        } catch (err) {
            setError(err.message);
        } finally {
            // Permite volver a elegir el mismo archivo después de quitarlo.
            e.target.value = "";
        }
    };

    return (
        <div>
            <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
            <div
                className={`relative flex ${aspect} items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50`}
            >
                {value ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={value} alt="" className="h-full w-full object-cover" />
                ) : (
                    <span className="text-xs text-slate-400">Sin imagen</span>
                )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
                <label className="cursor-pointer font-medium text-indigo-600 hover:text-indigo-700">
                    {value ? "Cambiar" : "Subir"}
                    <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </label>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className="text-slate-400 hover:text-rose-600"
                    >
                        Quitar
                    </button>
                )}
            </div>
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
    );
}
