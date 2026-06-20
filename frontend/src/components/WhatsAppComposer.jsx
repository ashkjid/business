import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { MessageCircle, ExternalLink } from "lucide-react";

const DEFAULT_MSG = `Hi {name}, I came across your business on Google Maps and wanted to reach out. Would love to connect briefly.`;

export default function WhatsAppComposer({ open, onClose, recipients }) {
  const [message, setMessage] = useState(DEFAULT_MSG);

  const valid = recipients.filter((r) => r.phone);

  const openAll = () => {
    valid.forEach((r, idx) => {
      const phone = (r.phone || "").replace(/[^0-9+]/g, "");
      const text = encodeURIComponent(message.replace("{name}", r.name));
      const url = `https://wa.me/${phone.replace(/^\+/, "")}?text=${text}`;
      // stagger to avoid popup blocker on some browsers
      setTimeout(() => window.open(url, "_blank"), idx * 250);
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-none" data-testid="whatsapp-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight flex items-center gap-2">
            <MessageCircle size={20} className="text-[#25D366]" /> WhatsApp Click-to-Chat
          </DialogTitle>
          <div className="label-eyebrow mt-1">{valid.length} recipient{valid.length !== 1 ? "s" : ""} with phone numbers</div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="label-eyebrow">Message — supports {"{name}"}</Label>
            <Textarea data-testid="wa-message-input" className="mt-2 rounded-none min-h-[120px] font-mono text-xs" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="bg-neutral-50 border border-neutral-200 p-3 max-h-40 overflow-y-auto scrollbar-thin">
            <div className="label-eyebrow mb-2">Will open chats for:</div>
            <div className="space-y-1">
              {valid.map((r) => (
                <div key={r.phone} className="text-xs font-mono flex justify-between">
                  <span>{r.name}</span><span className="text-neutral-500">{r.phone}</span>
                </div>
              ))}
              {!valid.length && <span className="text-xs text-neutral-500">No selected leads have phone numbers</span>}
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Each chat opens in a new tab with the message pre-filled. You'll click "Send" manually in WhatsApp Web/app.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose} data-testid="wa-cancel-btn">Cancel</Button>
          <Button onClick={openAll} disabled={!valid.length} data-testid="wa-open-btn" className="rounded-none bg-[#25D366] hover:bg-[#1FAE54] text-white">
            <ExternalLink size={14} className="mr-2" /> Open {valid.length} chat{valid.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
