import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  Paperclip,
  ArrowLeft,
  Reply,
} from "lucide-react";
import { clsx } from "clsx";
import type { CustomerMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatTimestamp, detectUrgency, formatAttachmentSize } from "./page"; // Assuming export from page.tsx

interface MessageViewProps {
  messages: CustomerMessage[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onReply: (message?: CustomerMessage) => void;
  title: string;
  description: string;
}

export function MessageView({
  messages,
  loading,
  error,
  onBack,
  onReply,
  title,
  description,
}: MessageViewProps) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
        </div>
        <Button onClick={() => onReply(messages[0])} disabled={!messages.length}>
          <Reply className="mr-2 h-4 w-4" />
          Antworten
        </Button>
      </div>

      {loading && (
        <div className="flex h-full items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen...
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="flex h-full items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-slate-400">Keine Nachrichten in diesem Verlauf.</p>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.map((message) => {
          const isOutbound = message.direction === "OUTBOUND";
          const metaLine = isOutbound
            ? `Gesendet an ${message.toEmail ?? message.contact?.name ?? "Kontakt"}`
            : `Empfangen von ${message.fromEmail ?? message.contact?.name ?? "Kontakt"}`;
          
          const urgency = detectUrgency(message);
          const date = formatTimestamp(message.sentAt ?? message.receivedAt ?? message.createdAt);

          return (
            <div key={message.id} className={clsx("flex", isOutbound ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-2xl rounded-3xl border px-5 py-4 text-sm shadow-lg",
                  isOutbound
                    ? "border-sky-400/40 bg-sky-500/15 text-white"
                    : "border-white/10 bg-white/5 text-slate-100"
                )}
              >
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-300">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {isOutbound ? "Outbound" : "Inbound"}
                  </span>
                  <span className="flex items-center gap-2">
                    {urgency && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        {urgency}
                      </span>
                    )}
                    {date}
                  </span>
                </div>
                {message.subject && <p className="mt-2 text-sm font-semibold text-white">{message.subject}</p>}
                <p className="mt-2 whitespace-pre-line text-sm text-slate-100">{message.body}</p>
                {message.attachments?.length ? (
                  <div className="mt-3 space-y-2">
                    {message.attachments.map((attachment, index) => {
                       const href = attachment.data ? `data:${attachment.type ?? "application/octet-stream"};base64,${attachment.data}` : undefined;
                       const sizeLabel = formatAttachmentSize(attachment.size);
                       return (
                         <a
                           key={`${message.id}-att-${index}`}
                           href={href}
                           download={attachment.name || undefined}
                           target="_blank"
                           rel="noreferrer"
                           className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white transition hover:border-sky-400/60 hover:text-white"
                         >
                           <Paperclip className="h-4 w-4" />
                           <span className="truncate">{attachment.name || "Anhang"}</span>
                           {sizeLabel && <span className="text-[11px] text-slate-300">{sizeLabel}</span>}
                           {!href && <span className="text-[11px] text-amber-200">Keine Datei verfügbar</span>}
                         </a>
                       );
                    })}
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-slate-400">{metaLine}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
