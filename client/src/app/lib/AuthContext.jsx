"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { loginUser, registerUser, getMe, verifyMagicLink } from "./api";

const TOKEN_KEY = "turnos_token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    // Arranca en true (no en useTransition's isPending, que es false hasta que
    // el efecto empieza a correr): así páginas como /panel o /mis-turnos, que
    // redirigen a /login si "!loading && !user", nunca ven un falso "no hay
    // usuario" en el primer render mientras todavía se está leyendo el token
    // guardado. Los efectos de componentes hijos corren antes que los del
    // padre en el montaje inicial, así que ese estado inicial debe ser
    // correcto de entrada, no depender de que este efecto llegue a ejecutarse.
    const [loading, setLoading] = useState(true);

    // Todos los caminos (no hay token guardado / lo hay y sirve / lo hay y está
    // vencido) terminan en el mismo finally, así el estado de carga se apaga en
    // un solo lugar y no hay una rama que lo apague de forma síncrona apenas
    // monta, disparando un render en cascada.
    useEffect(() => {
        (async () => {
            try {
                const storedToken = localStorage.getItem(TOKEN_KEY);
                if (!storedToken) return;

                const { user } = await getMe(storedToken);
                setToken(storedToken);
                setUser(user);
            } catch {
                localStorage.removeItem(TOKEN_KEY);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = async (credentials) => {
        const { user, token } = await loginUser(credentials);
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        setUser(user);
        return user;
    };

    const register = async (userData) => {
        const { user, token } = await registerUser(userData);
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        setUser(user);
        return user;
    };

    // Canjea el token del mail por una sesión normal. Desde acá para adelante el
    // cliente queda logueado igual que cualquier otro: el link mágico es solo la
    // puerta de entrada, no un modo aparte.
    const loginWithMagicLink = async (magicToken) => {
        const { user, token } = await verifyMagicLink(magicToken);
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        setUser(user);
        return user;
    };

    // Para cuando algo del panel cambia datos del propio usuario (el link de
    // reserva, el fin del onboarding) y el contexto quedaría viejo.
    const refreshUser = async () => {
        if (!token) return null;
        const { user } = await getMe(token);
        setUser(user);
        return user;
    };

    const logout = () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{ user, token, loading, login, register, logout, refreshUser, loginWithMagicLink }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth debe usarse dentro de un AuthProvider");
    }
    return context;
}
