import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import api from "../lib/api";
import { toast } from "sonner";

const BUSINESS_TYPES = [
  "Cafes", "Restaurants", "Hotels", "Salons & Spas", "Gyms & Fitness",
  "Real Estate", "Retail Stores", "Pharmacies", "Schools & Coaching",
  "Hospitals & Clinics", "Auto Repair", "Travel Agencies", "Event Planners",
  "Boutiques", "Bakeries", "Dental Clinics", "Lawyers", "Accountants", "Other",
];

export default function Onboarding() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [businessType, setBusinessType] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect logic in useEffect (avoid setState-in-render warning)
  useEffect(() => {
    if (!user) { nav("/login", { replace: true }); return; }
    if (user.is_master || user.business_type) { nav("/dashboard", { replace: true }); }
  }, [user, nav]);

  if (!user || user.is_master || user.business_type) {
    return <div className="h-screen flex items-center justify-center font-mono text-sm">Redirecting…</div>;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!businessType) { toast.error("Please select your business type"); return; }
    setLoading(true);
    try {
      await api.post("/auth/onboarding", { business_type: businessType });
      await refresh();
      toast.success("Welcome to LeadMap!");
      nav("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    } finally { setLoading(false); }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-white" data-testid="onboarding-page">
      <div className="max-w-md w-full px-8">
        <div className="flex items-center gap-3 mb-12" data-testid="onboarding-brand">
          <div className="w-9 h-9 bg-[#FF4F00] flex items-center justify-center">
            <span className="text-white font-display font-bold">L</span>
          </div>
          <span className="font-display font-bold text-xl tracking-tight">LeadMap<span className="text-[#FF4F00]">.</span></span>
        </div>

        <div className="label-eyebrow mb-3">One-time setup</div>
        <h1 className="text-4xl font-display font-bold tracking-tighter leading-[1.05] mb-3">
          What's your business?
        </h1>
        <p className="text-sm text-neutral-600 mb-8 leading-relaxed">
          Hi <span className="font-medium text-black">{user.name}</span> — pick the category that best describes your business. This helps us tailor your prospecting workflow.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <Label className="label-eyebrow">Your business type</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger data-testid="onboarding-business-type-select" className="mt-2 rounded-none h-11">
                <SelectValue placeholder="Select your business" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" data-testid="onboarding-submit-btn" disabled={loading || !businessType} className="w-full h-11 rounded-none bg-[#FF4F00] hover:bg-[#CC3F00] text-white">
            {loading ? "Saving…" : "Continue to dashboard →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
