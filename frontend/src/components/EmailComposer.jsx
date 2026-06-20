import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Send, Loader2, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

const DEFAULT_SUBJECT = "Quick intro — would love to connect, {name}";
const DEFAULT_BODY = `Hi {name},

I came across {name} and wanted to reach out personally. We help businesses like yours grow through targeted outreach and lead enrichment.

Would you be open to a 10-minute conversation this week?

Best regards,`;

export default function EmailComposer({ open, onClose, recipients, fromEmail, hasGmailConfig, isMaster }) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [loading, setLoading] = useState(false);

  const valid = recipients.filter((r) => r.email);
  const tooMany = !isMaster && valid.length > 2;

  const send = async () => {
    if (!valid.length) { toast.error("No recipients with email addresses"); return; }
    if (tooMany) { toast.error("Non-master users can only send to up to 2 recipients."); return; }
    setLoading(true);
    try {
      const r = await api.post("/email/send-bulk", { recipients: valid, subject, body });
      toast.success(`Sent ${r.data.sent} emails from ${r.data.from}`);
      if (r.data.failed?.length) toast.warning(`Failed: ${r.data.failed.join(", ")}`);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Send failed");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-none" data-testid="email-composer-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">Email Outreach</DialogTitle>
          <div className="label-eyebrow mt-1">{valid.length} recipient{valid.length !== 1 ? "s" : ""} · From {fromEmail}</div>
        </DialogHeader>

        {!hasGmailConfig && (
          <div className="bg-orange-50 border border-orange-200 p-3 text-xs flex items-start gap-2" data-testid="email-no-config">
            <AlertTriangle size={14} className="text-orange-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-orange-900">Gmail App Password not configured</div>
              <div className="text-orange-700 mt-1">Go to Profile → Email Configuration to set up your 16-character Gmail App Password.</div>
            </div>
          </div>
        )}

        {tooMany && (
          <div className="bg-red-50 border border-red-200 p-3 text-xs text-red-800" data-testid="email-too-many">
            You're a non-master user. You can only send to a maximum of 2 recipients per outreach. Please reduce your selection.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label className="label-eyebrow">From (non-editable)</Label>
            <Input value={fromEmail || ""} disabled className="mt-2 rounded-none font-mono text-xs" />
          </div>
          <div>
            <Label className="label-eyebrow">Subject</Label>
            <Input data-testid="email-subject-input" className="mt-2 rounded-none" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="label-eyebrow">Body — supports {"{name}"} placeholder</Label>
            <Textarea data-testid="email-body-input" className="mt-2 rounded-none min-h-[200px] font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="bg-neutral-50 border border-neutral-200 p-3 max-h-32 overflow-y-auto scrollbar-thin">
            <div className="label-eyebrow mb-2">Recipients</div>
            <div className="flex flex-wrap gap-1">
              {valid.map((r) => (
                <span key={r.email} className="text-[10px] font-mono bg-white border border-neutral-200 px-2 py-1">
                  {r.name} · {r.email}
                </span>
              ))}
              {!valid.length && <span className="text-xs text-neutral-500">No selected leads have email addresses</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose} data-testid="email-cancel-btn">Cancel</Button>
          <Button onClick={send} disabled={loading || !valid.length || tooMany || !hasGmailConfig} data-testid="email-send-btn" className="rounded-none bg-[#FF4F00] hover:bg-[#CC3F00] text-white">
            {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}
            Send {valid.length} email{valid.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
