import { getProfessionalBySlug } from "../../lib/api";
import Link from "next/link";
import Avatar from "../../components/Avatar";
import Stepper from "../../components/Stepper";

export default async function ProfessionalServicePage({ params }) {
    const { slug } = await params;

    let data = null;
    try {
        data = await getProfessionalBySlug(slug);
    } catch {
        data = null;
    }

    if (!data) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-10 text-center">
                <p className="text-slate-500">No encontramos a ese profesional.</p>
            </main>
        );
    }

    const { professional, services } = data;

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <Stepper current={1} />

            <div className="flex flex-col items-center mb-8">
                <Avatar
                    firstName={professional.firts_name}
                    lastName={professional.last_name}
                    image={professional.image}
                    size={88}
                />
                <h1 className="text-2xl font-semibold text-slate-900 text-center mt-3">
                    {professional.firts_name} {professional.last_name}
                </h1>
                {professional.description && (
                    <p className="mt-2 max-w-md text-center text-sm text-slate-600">
                        {professional.description}
                    </p>
                )}
                <p className="text-slate-500 text-center mt-1">
                    Elegí el servicio que querés reservar.
                </p>
            </div>

            {services.length === 0 ? (
                <p className="text-center text-slate-400">
                    Este profesional todavía no tiene servicios cargados.
                </p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {services.map((professionalService) => (
                        <Link
                            key={professionalService.id}
                            href={`/turnos/${slug}/${professionalService.service_id}`}
                            className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                        >
                            {professionalService.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={professionalService.image}
                                    alt={professionalService.service.name}
                                    className="aspect-video w-full object-cover"
                                />
                            )}
                            <div className="flex flex-1 flex-col gap-1 p-4">
                                <h2 className="font-medium text-slate-900">
                                    {professionalService.service.name}
                                </h2>
                                {professionalService.service.description && (
                                    <p className="text-sm text-slate-500">
                                        {professionalService.service.description}
                                    </p>
                                )}
                                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                                    <span className="text-slate-500">
                                        {professionalService.duration} min
                                    </span>
                                    {professionalService.price != null && (
                                        <span className="font-medium text-indigo-600">
                                            ${professionalService.price}
                                        </span>
                                    )}
                                    {professionalService.requires_deposit && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                            {professionalService.deposit_amount == null
                                                ? "Requiere seña"
                                                : `Seña $${professionalService.deposit_amount}`}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
