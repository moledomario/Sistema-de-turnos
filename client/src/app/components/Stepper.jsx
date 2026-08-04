const STEPS = ["Servicio", "Horario", "Confirmar"];

export default function Stepper({ current }) {
    return (
        <ol className="flex items-center w-full max-w-2xl mx-auto mb-10">
            {STEPS.map((label, index) => {
                const step = index + 1;
                const isDone = step < current;
                const isCurrent = step === current;

                return (
                    <li key={label} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                            <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                                    isDone
                                        ? "bg-indigo-600 text-white"
                                        : isCurrent
                                        ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                                        : "bg-slate-100 text-slate-400"
                                }`}
                            >
                                {isDone ? "✓" : step}
                            </div>
                            <span
                                className={`text-xs whitespace-nowrap ${
                                    isCurrent ? "text-indigo-700 font-medium" : "text-slate-400"
                                }`}
                            >
                                {label}
                            </span>
                        </div>
                        {step !== STEPS.length && (
                            <div
                                className={`h-0.5 flex-1 mx-2 rounded ${
                                    isDone ? "bg-indigo-600" : "bg-slate-200"
                                }`}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
