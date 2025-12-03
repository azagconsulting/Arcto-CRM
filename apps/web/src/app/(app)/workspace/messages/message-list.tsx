"use client";

import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SelectionConfig<T> {
  enabled: boolean;
  active: boolean;
  selected: Set<string>;
  canSelect: (item: T) => boolean;
  getId?: (item: T) => string;
  toggle: (item: T) => void;
}

interface MessageListProps<T> {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  actions?: React.ReactNode;
  selection?: SelectionConfig<T>;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  renderItem: (
    item: T,
    isActive: boolean,
    selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => React.ReactNode;
  listTitle: string;
  listDescription: string;
}

export function MessageList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  actions,
  selection,
  loading,
  error,
  searchQuery,
  onSearchChange,
  renderItem,
  listTitle,
  listDescription,
}: MessageListProps<T>) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-3xl border bg-[var(--panel-bg)] p-4 border-[color:var(--panel-border)] shadow-[var(--panel-shadow)]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{listTitle}</h2>
        <p className="text-sm text-[var(--text-secondary)]">{listDescription}</p>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Input
          placeholder="Suchen..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-[color:var(--panel-border)] text-[var(--text-primary)] placeholder:text-[color:var(--text-secondary)]"
        />
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {loading && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade...
        </p>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Keine Einträge gefunden.</p>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              const selectable = selection?.enabled && selection.canSelect(item);
              if (selectable && selection?.active) {
                selection.toggle(item);
                return;
              }
              onSelect(item.id);
            }}
          >
            {renderItem(item, item.id === selectedId, (() => {
              const selectionId = selection?.getId ? selection.getId(item) : (item as { id: string }).id;
              return {
                selectable: Boolean(selection?.enabled && selection.canSelect(item)),
                selected: Boolean(selection?.selected?.has(selectionId)),
                selectionActive: Boolean(selection?.active),
              };
            })())}
          </div>
        ))}
      </div>
    </div>
  );
}

// Specific render functions will be defined in the main page
// and passed to MessageList's renderItem prop.
// This makes MessageList a reusable "list pane" component.
