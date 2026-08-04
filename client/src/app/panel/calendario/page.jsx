"use client";

import { useAuth } from "../../lib/AuthContext";
import CalendarView from "../CalendarView";

export default function CalendarioPage() {
    const { token } = useAuth();

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <CalendarView token={token} />
        </main>
    );
}
