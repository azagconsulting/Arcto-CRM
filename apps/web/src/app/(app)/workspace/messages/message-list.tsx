"use client";

import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { CustomerMessage } from "@/lib/types";
import { formatTimestamp, detectUrgency } from "./page"; // Assuming these are exported from page.tsx for now

interface MessageListProps<T> {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  listTitle: string;
  listDescription: string;
}

export function MessageList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  loading,
  error,
  searchQuery,
  onSearchChange,
  renderItem,
  listTitle,
  listDescription,
}: MessageListProps<T>) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{listTitle}</h2>
        <p className="text-sm text-slate-400">{listDescription}</p>
      </div>
      <Input
        placeholder="Suchen..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade...
        </p>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-400">Keine Einträge gefunden.</p>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} onClick={() => onSelect(item.id)}>
            {renderItem(item, item.id === selectedId)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Specific render functions will be defined in the main page
// and passed to MessageList's renderItem prop.
// This makes MessageList a reusable "list pane" component.
