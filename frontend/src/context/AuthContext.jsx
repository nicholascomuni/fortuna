import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true); // validating stored token on mount

  // On mount, if there's a stored token, validate it and load the user
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then((u) => setUser(u))
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem("token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    if (data.requires_2fa) {
      return { requires2fa: true, preToken: data.pre_token };
    }
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    return { requires2fa: false };
  }, []);

  const loginWith2fa = useCallback(async (preToken, code) => {
    const data = await api.login2fa(preToken, code);
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await api.register({ name, email, password });
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, token, loading, login, loginWith2fa, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
