"use client";

import { useAuth } from "../../lib/AuthContext";
import ServicesManager from "../ServicesManager";

export default function ServiciosPage() {
    const { token } = useAuth();

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <ServicesManager token={token} />
        </main>
    );
}
