"use client";

import { useAuth } from "../lib/AuthContext";
import BookingLink from "./BookingLink";
import QrCode from "./QrCode";

export default function PanelPage() {
    const { user } = useAuth();

    return (
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
            <BookingLink slug={user.slug} />
            <QrCode slug={user.slug} />
        </main>
    );
}
