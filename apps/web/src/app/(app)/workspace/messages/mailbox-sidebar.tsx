"use client";

import { clsx } from "clsx";
import { Inbox, Send, User, Trash2, ShieldAlert } from "lucide-react";

export type Mailbox = "inbox" | "sent" | "spam" | "customers";

interface MailboxSidebarProps {
  activeMailbox: Mailbox;
  onMailboxChange: (mailbox: Mailbox) => void;
  unreadCounts: {
    leads: number;
    unassigned: number;
  };
  onOpenSettings?: () => void;
}

export function MailboxSidebar({
  activeMailbox,
  onMailboxChange,
  unreadCounts,
  onOpenSettings,
}: MailboxSidebarProps) {
  const mailboxes: { id: Mailbox; label: string; unread: number, icon: React.ElementType }[] = [
    { id: "inbox", label: "Posteingang", unread: unreadCounts.leads + unreadCounts.unassigned, icon: Inbox },
    { id: "sent", label: "Gesendet", unread: 0, icon: Send },
    { id: "spam", label: "Spam", unread: 0, icon: ShieldAlert },
    { id: "customers", label: "Kunden", unread: 0, icon: User },
  ];

  return (
    <div className="flex h-full flex-col gap-2 rounded-3xl border border-white/5 bg-white/5 p-2">
      {mailboxes.map(({ id, label, unread, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onMailboxChange(id)}
          className={clsx(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium",
            activeMailbox === id
              ? "bg-white/10 text-white"
              : "text-slate-300 hover:bg-white/5"
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="flex-1">{label}</span>
          {unread > 0 && (
            <span className="rounded-full bg-sky-500/70 px-2 py-0.5 text-[11px] font-semibold text-white">
              {unread}
            </span>
          )}
        </button>
      ))}
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-300 hover:bg-white/5"
        >
          <Inbox className="h-5 w-5" />
          <span className="flex-1">Einstellungen</span>
        </button>
      )}
    </div>
  );
}
