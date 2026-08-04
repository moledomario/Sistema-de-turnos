"use client";

import { useAuth } from "../../lib/AuthContext";
import AccountManager from "../AccountManager";
import TeamManager from "../TeamManager";

export default function CuentaPage() {
    const { token } = useAuth();

    return (
        <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
            <AccountManager token={token} />
            <TeamManager token={token} />
        </main>
    );
}
