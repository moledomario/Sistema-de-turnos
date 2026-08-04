import { getProfessionalBySlug } from "../../../lib/api.js";
import Stepper from "../../../components/Stepper";
import HorarioPicker from "./HorarioPicker";
import Link from "next/link";

export default async function HorarioPage({ params }) {
    const { slug, serviceId } = await params;

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
            <Stepper current={2} />

            <h1 className="text-2xl font-semibold text-slate-900 text-center">
                Elegí día y horario
            </h1>
            <p className="text-slate-500 text-center mt-1 mb-8">
                {professionalService.service.name} con {professional.firts_name}{" "}
                {professional.last_name} · {professionalService.duration} min
            </p>

            <HorarioPicker
                slug={slug}
                professionalId={professional.id}
                serviceId={serviceId}
            />
        </main>
    );
}
