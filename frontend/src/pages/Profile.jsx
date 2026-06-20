import React, { useState } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Mail, Check, Lock, AlertTriangle, Save } from "lucide-react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [appPassword, setAppPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!appPassword || appPassword.replace(/\s/g, "").length < 16) {
      toast.error("Gmail app password must be 16 characters (with or without spaces)");
      return;
    }
    setLoading(true);
    try {
      await api.post("/email/configure", { gmail_address: user.email, app_password: appPassword.replace(/\s/g, "") });
      toast.success("Gmail App Password saved securely");
      setAppPassword("");
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally { setLoading(false); }
  };

  return (
    <Layout>
      <div className="px-8 py-8 max-w-4xl">
        <div className="label-eyebrow mb-2">Account</div>
        <h1 className="text-4xl font-display font-bold tracking-tighter mb-8">Profile</h1>

        {/* User card */}
        <div className="border border-neutral-200 p-6 mb-6 flex items-center gap-5">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-16 h-16 object-cover" />
          ) : (
            <div className="w-16 h-16 bg-black text-white flex items-center justify-center font-display font-bold text-2xl">
              {user.name?.slice(0, 1)?.toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="font-display text-xl font-semibold tracking-tight" data-testid="profile-name">{user.name}</div>
            <div className="font-mono text-xs text-neutral-500" data-testid="profile-email">{user.email}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {user.is_master && <Badge className="rounded-none bg-[#FF4F00]">MASTER</Badge>}
              {user.business_type && <Badge variant="outline" className="rounded-none">{user.business_type}</Badge>}
              <Badge variant="outline" className={`rounded-none ${user.can_export ? "text-emerald-700 border-emerald-300" : "text-neutral-500"}`}>
                {user.can_export ? "Export enabled" : "Export disabled"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Gmail config */}
        <div className="border border-neutral-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={18} />
            <h2 className="font-display text-2xl font-semibold tracking-tight">Email Configuration</h2>
          </div>

          {user.has_gmail_config ? (
            <div className="bg-emerald-50 border border-emerald-200 p-4 mb-4 flex items-start gap-2" data-testid="gmail-configured">
              <Check size={18} className="text-emerald-700 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-emerald-900">Gmail configured</div>
                <div className="text-emerald-700 text-xs mt-1">Outreach emails will be sent from <span className="font-mono">{user.email}</span></div>
              </div>
            </div>
          ) : (
            <div className="bg-orange-50 border border-orange-200 p-4 mb-4 flex items-start gap-2" data-testid="gmail-not-configured">
              <AlertTriangle size={18} className="text-orange-700 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-orange-900">Gmail not configured</div>
                <div className="text-orange-700 text-xs mt-1">Add your 16-character Gmail App Password to start sending outreach emails.</div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label className="label-eyebrow">From email (locked to login email)</Label>
              <div className="mt-2 flex items-center gap-2 px-3 h-11 bg-neutral-50 border border-neutral-200 font-mono text-sm">
                <Lock size={13} className="text-neutral-400" />
                {user.email}
              </div>
            </div>
            <div>
              <Label className="label-eyebrow">Gmail app password</Label>
              <div className="relative mt-2">
                <Input
                  type={show ? "text" : "password"}
                  data-testid="gmail-app-password-input"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="rounded-none h-11 pr-20 font-mono"
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              <ol className="text-xs text-neutral-600 mt-2 space-y-0.5 pl-4 list-decimal">
                <li>Enable 2-Step Verification in your Google Account</li>
                <li>Visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-[#FF4F00] hover:underline">Google Account → App passwords</a></li>
                <li>Generate a password for "Mail" — paste the 16-char code above</li>
              </ol>
            </div>
            <Button onClick={save} disabled={loading} data-testid="gmail-save-btn" className="rounded-none h-11 bg-[#FF4F00] hover:bg-[#CC3F00] text-white">
              <Save size={14} className="mr-2" /> {loading ? "Saving…" : "Save Gmail credentials"}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
