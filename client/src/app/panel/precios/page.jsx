"use client";

import { useAuth } from "../../lib/AuthContext";
import PricingPlans from "../PricingPlans";

export default function PreciosPage() {
    const { token } = useAuth();

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <PricingPlans token={token} />
        </main>
    );
}
