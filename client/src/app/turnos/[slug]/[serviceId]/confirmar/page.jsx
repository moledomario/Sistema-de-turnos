import { getProfessionalBySlug } from "../../../../lib/api.js";
import Stepper from "../../../../components/Stepper";
import ConfirmarForm from "./ConfirmarForm";
import Link from "next/link";

export default async function ConfirmarPage({ params, searchParams }) {
    const { slug, serviceId } = await params;
    const { start_time: startTime } = await searchParams;

    if (!startTime) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-10 text-center">
                <p className="text-slate-500">Falta elegir un horario.</p>
                <Link
                    href={`/turnos/${slug}/${serviceId}`}
                    className="text-indigo-600 hover:underline"
                >
                    Volver a elegir horario
                </Link>
            </main>
        );
    }

    let data = null;
    try {
        data = await getProfessionalBySlug(slug);
    } catch {
        data = null;
    }

    const professional = data?.professional;
    const professionalService = (data?.services ?? []).find(
        (ps) => ps.service_id === serviceId
    );

    if (!professional || !professionalService) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-10 text-center">
                <p className="text-slate-500">
                    No pudimos encontrar ese servicio para este profesional.
                </p>
                <Link href={`/turnos/${slug}`} className="text-indigo-600 hover:underline">
                    Volver a empezar
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-10">
            <Stepper current={3} />

            <h1 className="text-2xl font-semibold text-slate-900 text-center mb-8">
                Completá tus datos
            </h1>

            <ConfirmarForm
                slug={slug}
                professionalId={professional.id}
                serviceId={serviceId}
                startTime={startTime}
                professional={professional}
                professionalService={professionalService}
            />
        </main>
    );
}
