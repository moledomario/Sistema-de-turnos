"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getPendingRequests } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// Las solicitudes las comparten el sidebar (que muestra el contador) y la
// página de solicitudes (que las lista y responde), así que viven acá arriba:
// cuando el profesional acepta o rechaza uno, el contador se actualiza solo.
const PendingRequestsContext = createContext({
    requests: [],
    loading: false,
    error: null,
    refresh: () => {},
});

// Sin websockets, un turno nuevo aparece en el próximo chequeo.
const POLL_INTERVAL_MS = 60_000;

export function PendingRequestsProvider({ children }) {
    const { token, user, loading: authLoading } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    const isProfessional = Boolean(token) && user?.role === "PROFESSIONAL";

    // Se deriva en vez de guardarse: mientras se verifica la sesión todavía no se
    // sabe si hay algo que pedir, así que se sigue mostrando la carga; a quien no
    // es profesional no hay nada que pedirle, y ahí ya está listo sin necesidad de
    // apagar una bandera a mano desde el efecto.
    const loading = authLoading || (isProfessional && !loaded);

    const refresh = useCallback(async () => {
        if (!isProfessional) return;
        try {
            const data = await getPendingRequests(token);
            setRequests(data.requests ?? []);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoaded(true);
        }
    }, [token, isProfessional]);

    useEffect(() => {
        if (authLoading || !isProfessional) return;

        // La regla marca esto como un setState síncrono dentro del efecto, pero no
        // lo es: todo lo que refresh() actualiza pasa después del await del pedido
        // al servidor. Es la carga inicial del poll, no hay render en cascada.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refresh();
        const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [authLoading, isProfessional, refresh]);

    return (
        <PendingRequestsContext.Provider value={{ requests, loading, error, refresh }}>
            {children}
        </PendingRequestsContext.Provider>
    );
}

export function usePendingRequests() {
    return useContext(PendingRequestsContext);
}
