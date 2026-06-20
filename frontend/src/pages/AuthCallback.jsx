import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const { setUser, checkAuth } = useAuth();
  const hasProcessed = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sessionId = m?.[1];

    if (!sessionId) {
      nav("/login", { replace: true });
      return;
    }

    (async () => {
      try {
        const r = await api.post("/auth/session", null, { headers: { "X-Session-ID": sessionId } });
        const user = r.data.user;
        const needsOnboarding = r.data.needs_onboarding;
        setUser(user);
        localStorage.setItem("leadmap_user", JSON.stringify(user));
        // Clear the hash before navigating
        window.history.replaceState({}, document.title, window.location.pathname);
        if (needsOnboarding) {
          nav("/onboarding", { replace: true });
        } else {
          toast.success(`Welcome, ${user.name}`);
          nav("/dashboard", { replace: true });
        }
      } catch (err) {
        const msg = err?.response?.data?.detail || "Sign-in failed";
        setError(msg);
        toast.error(msg);
        setTimeout(() => nav("/login", { replace: true }), 1500);
      }
    })();
  }, [nav, setUser, checkAuth]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-white" data-testid="auth-callback-page">
      <div className="text-center">
        {!error ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#FF4F00]" />
            <div className="mt-4 label-eyebrow">Completing sign-in…</div>
          </>
        ) : (
          <>
            <div className="text-red-600 text-sm font-medium">{error}</div>
            <div className="text-xs text-neutral-500 mt-2">Returning to login…</div>
          </>
        )}
      </div>
    </div>
  );
}
