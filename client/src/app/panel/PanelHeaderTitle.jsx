"use client";

import { usePathname } from "next/navigation";
import { PANEL_NAV_ITEMS, ACCOUNT_NAV_ITEMS } from "@/lib/panel-nav";

export default function PanelHeaderTitle() {
    const pathname = usePathname();
    const current = [...PANEL_NAV_ITEMS, ...ACCOUNT_NAV_ITEMS].find(
        (item) => item.href === pathname
    );

    return (
        <span className="text-sm font-medium text-slate-500">
            {current?.title ?? "Panel del profesional"}
        </span>
    );
}
