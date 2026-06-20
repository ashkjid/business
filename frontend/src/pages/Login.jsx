import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";

const BUSINESS_TYPES = [
  "Cafes", "Restaurants", "Hotels", "Salons & Spas", "Gyms & Fitness",
  "Real Estate", "Retail Stores", "Pharmacies", "Schools & Coaching",
  "Hospitals & Clinics", "Auto Repair", "Travel Agencies", "Event Planners",
  "Boutiques", "Bakeries", "Dental Clinics", "Lawyers", "Accountants", "Other",
];

export default function Login() {
  const { demoLogin, config } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: "", name: "", business_type: "" });
  const [code, setCode] = useState("");
  const [issuedCode, setIssuedCode] = useState("");

  const signInWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const requestCode = (e) => {
    e.preventDefault();
    if (!form.email || !form.name) { toast.error("Enter both name and email"); return; }
    const c = String(Math.floor(100000 + Math.random() * 900000));
    setIssuedCode(c);
    toast.message("Verification code (DEV MODE)", { description: `Your code: ${c}` });
    setStep(2);
  };

  const verifyAndLogin = async (e) => {
    e?.preventDefault?.();
    if (code !== issuedCode) { toast.error("Invalid verification code"); return; }
    const isMaster = form.email.toLowerCase() === (config.master_email || "ashkjid@gmail.com");
    if (!isMaster && !form.business_type) { setStep(3); return; }
    setLoading(true);
    try {
      const u = await demoLogin({ email: form.email.toLowerCase(), name: form.name, business_type: form.business_type || undefined });
      toast.success(`Welcome, ${u.name}`);
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="h-screen w-screen flex" data-testid="login-page">
      {/* Left panel */}
      <div className="flex-1 flex flex-col justify-between p-12 bg-white">
        <div>
          <div className="flex items-center gap-3" data-testid="brand-logo">
            <div className="w-9 h-9 bg-[#FF4F00] flex items-center justify-center">
              <span className="text-white font-display font-bold">L</span>
            </div>
            <span className="font-display font-bold text-xl tracking-tight">LeadMap<span className="text-[#FF4F00]">.</span></span>
          </div>
        </div>

        <div className="max-w-md w-full">
          <div className="label-eyebrow mb-3">Operator Access</div>
          <h1 className="text-5xl font-display font-bold tracking-tighter leading-[1.05] mb-4">
            Prospect.<br/>Enrich.<br/>Reach out.
          </h1>
          <p className="text-sm text-neutral-600 mb-10 leading-relaxed">
            Pinpoint any business on a map, extract verified contacts, and start outreach in minutes — purpose built for B2B operators.
          </p>

          {/* PRIMARY: Sign in with Google (Emergent) */}
          <Button
            onClick={signInWithGoogle}
            data-testid="google-signin-btn"
            className="w-full h-12 rounded-none bg-white hover:bg-neutral-50 text-black border border-neutral-300 font-medium tracking-wide flex items-center justify-center gap-3 shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </Button>
          <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
            Uses your active Google session in this browser. We only request your email, name, and profile picture.
          </p>

          {/* Divider */}
          <div className="my-8 flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-200" />
            <button
              type="button"
              onClick={() => setShowDemo(!showDemo)}
              data-testid="toggle-demo-login"
              className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-black flex items-center gap-1"
            >
              Or use demo login <ChevronDown size={12} className={`transition-transform ${showDemo ? "rotate-180" : ""}`} />
            </button>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          {/* SECONDARY: Demo login (collapsed by default) */}
          {showDemo && (
            <div className="border border-neutral-200 p-5 bg-neutral-50">
              {step === 1 && (
                <form onSubmit={requestCode} className="space-y-3" data-testid="login-form-step1">
                  <div className="text-xs text-neutral-600 mb-1">For testing without Google. A 6-digit code will be shown on screen.</div>
                  <div>
                    <Label className="label-eyebrow">Full name</Label>
                    <Input data-testid="login-name-input" className="mt-1.5 rounded-none h-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
                  </div>
                  <div>
                    <Label className="label-eyebrow">Email</Label>
                    <Input data-testid="login-email-input" className="mt-1.5 rounded-none h-10" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@gmail.com" />
                  </div>
                  <Button type="submit" data-testid="demo-continue-btn" className="w-full h-10 rounded-none bg-black hover:bg-neutral-800 text-white">
                    Continue with demo login →
                  </Button>
                </form>
              )}
              {step === 2 && (
                <form onSubmit={verifyAndLogin} className="space-y-3" data-testid="login-form-step2">
                  <Label className="label-eyebrow">Verification code</Label>
                  <Input data-testid="login-otp-input" className="mt-1.5 rounded-none h-10 font-mono tracking-[0.5em]" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="rounded-none h-10" onClick={() => setStep(1)}>Back</Button>
                    <Button type="submit" data-testid="login-verify-btn" disabled={loading} className="flex-1 h-10 rounded-none bg-[#FF4F00] hover:bg-[#CC3F00] text-white">
                      {loading ? "Signing in…" : "Verify →"}
                    </Button>
                  </div>
                </form>
              )}
              {step === 3 && (
                <form onSubmit={verifyAndLogin} className="space-y-3" data-testid="login-form-step3">
                  <Label className="label-eyebrow">Your business type</Label>
                  <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                    <SelectTrigger data-testid="login-business-type-select" className="mt-1.5 rounded-none h-10">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="submit" data-testid="login-finish-btn" disabled={loading || !form.business_type} className="w-full h-10 rounded-none bg-[#FF4F00] hover:bg-[#CC3F00] text-white">
                    Finish setup →
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="text-xs text-neutral-400 font-mono">
          v1.0 · Private operator tool · {config.master_email ? `Master: ${config.master_email}` : ""}
        </div>
      </div>

      {/* Right panel */}
      <div className="hidden lg:block flex-1 relative overflow-hidden bg-neutral-900">
        <img
          src="https://static.prod-images.emergentagent.com/jobs/fd6b1e56-0c46-4fea-ad2f-f0a391c92611/images/527ab87342cd5dec627545ffff1b7af25d152534c700f193f809424cdbcf69f8.png"
          alt="Topographic map"
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <div className="label-eyebrow text-white/70 mb-2">Field Notes</div>
          <p className="font-display text-3xl tracking-tight leading-tight">"The map is not the territory — but it's where every deal begins."</p>
        </div>
      </div>
    </div>
  );
}
