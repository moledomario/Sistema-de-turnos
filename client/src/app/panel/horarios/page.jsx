"use client";

import { useAuth } from "../../lib/AuthContext";
import AvailabilityManager from "../AvailabilityManager";

export default function HorariosPage() {
    const { token } = useAuth();

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <AvailabilityManager token={token} />
        </main>
    );
}
