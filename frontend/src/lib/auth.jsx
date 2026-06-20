import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("leadmap_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [config, setConfig] = useState({ google_oauth_enabled: false, emergent_auth_enabled: true, master_email: "", max_results: 500 });
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const me = await api.get("/auth/me");
      setUser(me.data);
      localStorage.setItem("leadmap_user", JSON.stringify(me.data));
    } catch {
      setUser(null);
      localStorage.removeItem("leadmap_user");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get("/admin/public-config");
        setConfig(cfg.data);
      } catch {}
      // CRITICAL: skip /auth/me if returning from Emergent OAuth callback
      // AuthCallback will exchange the session_id and set the cookie first.
      if (window.location.hash?.includes("session_id=")) {
        setLoading(false);
        return;
      }
      await checkAuth();
    })();
  }, [checkAuth]);

  const demoLogin = async ({ email, name, picture, business_type }) => {
    const r = await api.post("/auth/login", { email, name, picture, business_type });
    localStorage.setItem("leadmap_token", r.data.access_token);
    localStorage.setItem("leadmap_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };

  const refresh = async () => {
    const me = await api.get("/auth/me");
    setUser(me.data);
    localStorage.setItem("leadmap_user", JSON.stringify(me.data));
    return me.data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("leadmap_token");
    localStorage.removeItem("leadmap_user");
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthCtx.Provider value={{ user, setUser, config, loading, demoLogin, logout, refresh, checkAuth }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
