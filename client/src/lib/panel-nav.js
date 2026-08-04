import {
    Link2,
    CalendarDays,
    Clock,
    Briefcase,
    Tag,
    Inbox,
    UserCog,
    Settings,
} from "lucide-react";

export const PANEL_NAV_ITEMS = [
    { title: "Tu link de reserva", href: "/panel", icon: Link2 },
    // `badge: "pending"` hace que el sidebar le muestre al lado la cantidad de
    // solicitudes sin responder.
    { title: "Turnos solicitados", href: "/panel/solicitudes", icon: Inbox, badge: "pending" },
    { title: "Calendario", href: "/panel/calendario", icon: CalendarDays },
    { title: "Horarios de atención", href: "/panel/horarios", icon: Clock },
    // Ícono genérico a propósito: la app la usan profesionales de cualquier
    // rubro, no solo peluquerías.
    { title: "Servicios", href: "/panel/servicios", icon: Briefcase },
    { title: "Precios", href: "/panel/precios", icon: Tag },
];

// Van en su propio grupo del sidebar ("Cuenta"), separados de la operación diaria.
export const ACCOUNT_NAV_ITEMS = [
    { title: "Mi cuenta", href: "/panel/cuenta", icon: UserCog },
    { title: "Configuración", href: "/panel/configuracion", icon: Settings },
];
