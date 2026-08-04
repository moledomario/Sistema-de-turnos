"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

export default function PanelGuard({ children }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Un profesional recién registrado no tiene link, servicios ni horarios: el
    // panel no le dice nada hasta que pase por el onboarding.
    const needsOnboarding = user?.role === "PROFESSIONAL" && !user.onboarding_completed;

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace("/login");
        } else if (needsOnboarding) {
            router.replace("/onboarding");
        }
    }, [loading, user, needsOnboarding, router]);

    if (loading || !user || needsOnboarding) {
        return <p className="text-center text-slate-400 py-10">Cargando...</p>;
    }

    if (user.role !== "PROFESSIONAL") {
        return (
            <p className="text-center text-rose-600 py-10">
                Esta sección es solo para profesionales.
            </p>
        );
    }

    return children;
}
