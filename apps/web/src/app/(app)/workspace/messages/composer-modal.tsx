"use client";

import {
  AlertTriangle,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerMessage, Lead, SmtpSettings, Customer, CustomerContact } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { OPENAI_KEY_STORAGE } from "@/lib/constants";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface AttachmentItem {
  id: string;
  file: File;
  url: string;
}

interface ComposerState {
  contactId: string;
  toEmail: string;
  subject: string;
  body: string;
}

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMessageSent: (message: CustomerMessage) => void;
  customer?: Customer | null;
  lead?: Lead | null;
  thread?: CustomerMessage[];
  messageToReplyTo?: CustomerMessage | null;
  smtpReady: boolean;
  smtpStatus: string | null;
}

export function ComposerModal({
  isOpen,
  onClose,
  onMessageSent,
  customer,
  lead,
  thread = [],
  messageToReplyTo,
  smtpReady,
  smtpStatus,
}: ComposerModalProps) {
  const { authorizedRequest } = useAuth();
  const [composer, setComposer] = useState<ComposerState>({
    contactId: "",
    toEmail: "",
    subject: "",
    body: "",
  });
  const [composerNotice, setComposerNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiChatMode, setAiChatMode] = useState<null | "edit" | "create">(null);
  const [aiChatInput, setAiChatInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOpenAiKey(window.localStorage.getItem(OPENAI_KEY_STORAGE));
    }
  }, []);

  const attachmentsRef = useRef<AttachmentItem[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setComposerNotice(null);
      setAiError(null);
      return;
    }

    const recipient = messageToReplyTo?.fromEmail ?? lead?.email ?? customer?.contacts?.[0]?.email ?? "";
    const subject = messageToReplyTo?.subject
      ? messageToReplyTo.subject.startsWith("Re: ")
        ? messageToReplyTo.subject
        : `Re: ${messageToReplyTo.subject}`
      : "";
    const quotedBody = messageToReplyTo?.body ? `\n\n---\nOriginal:\n${messageToReplyTo.body}` : "";

    setComposer({
      contactId: customer?.contacts?.[0]?.id ?? "",
      toEmail: recipient,
      subject,
      body: quotedBody,
    });
    setAttachments([]);
  }, [isOpen, customer, lead, messageToReplyTo]);

  const handleAttachmentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${file.name}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = "";
  };

  const handleAttachmentRemove = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const readFileAsBase64 = useCallback((file: File) =>
    new Promise<{ name: string; type: string; size: number; data: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, data: base64 });
      };
      reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    }), []);

  const handleSend = useCallback(async () => {
    if (!smtpReady) {
      setComposerNotice({ type: "error", text: "SMTP-Zugang fehlt. Bitte aktualisiere deine Einstellungen." });
      return;
    }

    const hasAttachments = attachments.length > 0;
    const trimmedBody = composer.body.trim();
    if (!trimmedBody && !hasAttachments) {
      setComposerNotice({ type: "error", text: "Bitte Nachricht eingeben oder eine Datei anhängen." });
      return;
    }

    setSending(true);
    setComposerNotice(null);

    let encodedAttachments: Awaited<ReturnType<typeof readFileAsBase64>>[] = [];
    try {
      if (hasAttachments) {
        encodedAttachments = await Promise.all(attachments.map((item) => readFileAsBase64(item.file)));
      }
    } catch (err) {
      setSending(false);
      setComposerNotice({ type: "error", text: err instanceof Error ? err.message : "Anhänge konnten nicht gelesen werden." });
      return;
    }

    const basePayload = {
      contactId: composer.contactId || undefined,
      toEmail: composer.toEmail.trim() || undefined,
      subject: composer.subject.trim() || undefined,
      body: trimmedBody || "Siehe angehängte Dateien.",
      ...(encodedAttachments.length ? { attachments: encodedAttachments } : {}),
    };

    try {
      const buildRequestInit = (payload: Record<string, unknown>) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let response: CustomerMessage;
      if (lead) {
        const leadPayload = { ...basePayload, toEmail: basePayload.toEmail || lead.email || undefined };
        response = await authorizedRequest<CustomerMessage>(`/leads/${lead.id}/messages`, buildRequestInit(leadPayload));
      } else if (customer) {
        response = await authorizedRequest<CustomerMessage>(`/customers/${customer.id}/messages`, buildRequestInit(basePayload));
      } else if (basePayload.toEmail) { // Unassigned message
        response = await authorizedRequest<CustomerMessage>(`/messages/unassigned`, buildRequestInit(basePayload));
      } else {
        throw new Error("Kein Empfänger für die Nachricht gefunden.");
      }

      onMessageSent(response);
      setComposerNotice({ type: "success", text: "Nachricht gesendet!" });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setComposerNotice({ type: "error", text: err instanceof Error ? err.message : "Senden fehlgeschlagen." });
    } finally {
      setSending(false);
    }
  }, [smtpReady, attachments, composer, lead, customer, authorizedRequest, readFileAsBase64, onMessageSent, onClose]);

  // ... AI handlers here
  const selectedContact = useMemo(() => {
    if (!customer) return null;
    return customer.contacts.find((contact) => contact.id === composer.contactId) ?? null;
  }, [customer, composer.contactId]);

  const handleContactChange = (contactId: string) => {
    if (!customer) return;
    const contact = customer.contacts.find((item) => item.id === contactId);
    setComposer((current) => ({
      ...current,
      contactId,
      toEmail: contact?.email ?? "",
    }));
  };

  const isUnassignedView = !customer && !lead;

  const orderedThread = useMemo(() => {
    return [...(thread ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [thread]);

  const handleGenerateAi = useCallback(async () => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (isUnassignedView) {
      setAiError("Bitte wähle einen Kunden oder eine Anfrage, um den KI-Assistenten zu nutzen.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const history = orderedThread
        .slice(-6)
        .map((message) => `${message.direction === "INBOUND" ? "Kunde" : "CSM"}: ${message.body}`)
        .join("\n---\n");
      const contactName = lead?.fullName ?? selectedContact?.name ?? customer?.name ?? "Kontakt";
      const prompt = `Du bist Customer Success Manager:in bei Arcto. Verfasse eine prägnante, empathische Antwort per E-Mail an ${contactName}. Betreff: ${composer.subject}\nKontext:\n${history || "Der Kontakt wartet auf ein Update."}\nDie Antwort darf maximal 220 Wörter haben und sollte mit einer freundlichen Grußformel enden.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.5, messages: [{ role: "system", content: "Du hilfst Customer Success Teams beim Schreiben von professionellen Antworten." }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI-Fehler: ${response.status}`);
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Keine Antwort von OpenAI erhalten.");
      setComposer((current) => ({ ...current, body: content }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [openAiKey, isUnassignedView, orderedThread, lead, selectedContact, customer, composer.subject]);

  const handleAiCreateWithPrompt = useCallback(async (promptInput: string) => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (!promptInput) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const contactName = lead?.fullName ?? selectedContact?.name ?? customer?.name ?? composer.toEmail;
      const prompt = `Du bist ein hilfreicher Assistent. Schreibe eine professionelle E-Mail an ${contactName} zum Thema "${composer.subject}". Die E-Mail soll folgendes beinhalten: "${promptInput}".`;
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, messages: [{ role: "system", content: "Du bist ein Assistent, der beim Verfassen von professionellen E-Mails in deutscher Sprache hilft." }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI-Fehler: ${response.status}`);
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Keine Antwort von OpenAI erhalten.");
      setComposer((current) => ({ ...current, body: content }));
      setAiChatMode(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [openAiKey, lead, selectedContact, customer, composer.toEmail, composer.subject]);

  const handleAiEditWithPrompt = useCallback(async (promptInput: string) => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (!promptInput || !composer.body) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const prompt = `Bitte überarbeite den folgenden E-Mail-Entwurf. Gib nur die neue Version der E-Mail aus, ohne zusätzliche Kommentare.\n\nAnweisung: "${promptInput}"\n\nEntwurf:\n---\n${composer.body}`;
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.5, messages: [{ role: "system", content: "Du bist ein Assistent, der dabei hilft, E-Mails zu überarbeiten und zu verbessern." }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`OpenAI-Fehler: ${response.status}`);
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Keine Antwort von OpenAI erhalten.");
      setComposer((current) => ({ ...current, body: content }));
      setAiChatMode(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [openAiKey, composer.body]);


  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nachricht verfassen" className="max-w-3xl">
      <div className="space-y-4">
        {!smtpReady && smtpStatus && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <p>{smtpStatus}</p>
          </div>
        )}

        <div className="grid grid-cols-6 gap-4">
          <label className="col-span-1 my-auto text-sm text-slate-400">An:</label>
          <div className="col-span-5">
            {customer && customer.contacts.length > 1 ? (
              <select 
                value={composer.contactId}
                onChange={(e) => handleContactChange(e.target.value)}
                className="w-full rounded-md border-slate-700 bg-slate-800 p-2 text-sm text-white"
              >
                {customer.contacts.map((contact: CustomerContact) => (
                  <option key={contact.id} value={contact.id}>{contact.name} ({contact.email})</option>
                ))}
              </select>
            ) : (
              <Input
                type="email"
                placeholder="Empfänger-E-Mail"
                value={composer.toEmail}
                onChange={(e) => setComposer({ ...composer, toEmail: e.target.value })}
                className="text-sm"
              />
            )}
          </div>
        </div>
        <div className="grid grid-cols-6 items-center gap-4">
          <label className="col-span-1 text-sm text-slate-400">Betreff:</label>
          <div className="col-span-5">
            <Input
              type="text"
              placeholder="Betreff"
              value={composer.subject}
              onChange={(e) => setComposer({ ...composer, subject: e.target.value })}
              className="text-sm"
            />
          </div>
        </div>
        
        <Textarea
          placeholder="Schreibe deine Nachricht..."
          value={composer.body}
          onChange={(e) => setComposer({ ...composer, body: e.target.value })}
          rows={10}
          className="resize-y text-sm"
        />

        {attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-slate-400">Anhänge</p>
            {attachments.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-800 p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  <span className="text-white">{item.file.name}</span>
                  <span className="text-slate-500 text-xs">({Math.round(item.file.size / 1024)} KB)</span>
                </div>
                <button onClick={() => handleAttachmentRemove(item.id)}>
                  <X className="h-4 w-4 text-slate-400 hover:text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="relative flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4 mr-2" /> Anhang
            </Button>
            <input type="file" ref={fileInputRef} onChange={handleAttachmentSelect} multiple className="hidden" />
          </div>
          <Button onClick={handleSend} disabled={sending || !composer.toEmail.trim() || (!composer.body.trim() && attachments.length === 0)}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Senden
          </Button>
        </div>

        {composerNotice && (
          <p className={clsx("text-sm", composerNotice.type === "success" ? "text-emerald-400" : "text-rose-400")}>
            {composerNotice.text}
          </p>
        )}

        <div className="space-y-4 border-t border-white/10 pt-4 mt-4" style={{marginBottom: '5px'}}>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-slate-400 ml-2" />
                    <span className="text-sm font-medium text-slate-300">AI Assistent:</span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => { handleGenerateAi(); setAiChatMode(null); }} disabled={!messageToReplyTo || aiLoading}>
                    {aiLoading && !aiChatMode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Auto-Antwort"}
                </Button>
                <Button variant={aiChatMode === 'create' ? 'default' : 'secondary'} size="sm" onClick={() => setAiChatMode(aiChatMode === 'create' ? null : 'create')}>
                    Entwurf erstellen
                </Button>
                <Button variant={aiChatMode === 'edit' ? 'default' : 'secondary'} size="sm" onClick={() => setAiChatMode(aiChatMode === 'edit' ? null : 'edit')} disabled={!composer.body}>
                    Text überarbeiten
                </Button>
            </div>

            {!openAiKey && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>Für die KI-Antwort benötigst du einen OpenAI-Key unter Einstellungen.</p>
              </div>
            )}
            {aiError && (
              <p className="mb-4 flex items-center gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {aiError}
              </p>
            )}
            
            {aiChatMode && (
              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {aiChatMode === "create" ? "Neue E-Mail erstellen" : "Entwurf überarbeiten"}
                </label>
                <div className="flex gap-2">
                  <Textarea
                    value={aiChatInput}
                    onChange={(e) => setAiChatInput(e.target.value)}
                    placeholder={aiChatMode === 'create' ? "Beschreibe, worum es in der E-Mail gehen soll..." : "Deine Anweisungen zur Überarbeitung..."}
                    rows={2}
                    className="flex-1"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => {
                        if (aiChatMode === 'create') handleAiCreateWithPrompt(aiChatInput);
                        if (aiChatMode === 'edit') handleAiEditWithPrompt(aiChatInput);
                        setAiChatInput("");
                    }}
                    disabled={aiLoading}
                  >
                    {aiLoading && aiChatMode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
                  </Button>
                </div>
              </div>
            )}
        </div>
      </div>
    </Modal>
  );
}
