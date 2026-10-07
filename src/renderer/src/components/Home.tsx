import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Copy, Globe, KeyRound, Pencil, Plus, Search, User } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';
import { EntryModal } from '@zero/renderer/components/EntryModal';
import type { Credential } from '@zero/types';

interface HomeProps {
  onToast: (message: string) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

export function Home({ onToast }: HomeProps): JSX.Element {
  const m = useMessages();
  const [entries, setEntries] = useState<Credential[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Credential | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setEntries(await window.api.entries.list());
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught, m.errors.internal));
    }
  }, [m.errors.internal]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCopy = async (value: string): Promise<void> => {
    await navigator.clipboard.writeText(value);
    onToast(m.app.toastCopied);
  };

  const handleOpenSite = async (domain: string): Promise<void> => {
    try {
      await window.api.openDomain(domain);
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.invalidDomain));
    }
  };

  const openNew = (): void => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (credential: Credential): void => {
    setEditing(credential);
    setModalOpen(true);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = (entries ?? []).filter(
    (entry) =>
      normalizedQuery === '' ||
      entry.title.toLowerCase().includes(normalizedQuery) ||
      entry.username.toLowerCase().includes(normalizedQuery) ||
      entry.domain.toLowerCase().includes(normalizedQuery),
  );

  if (entries === null) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-400">
        {loadError ?? m.home.loading}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">{m.home.title}</h2>
          <p className="text-xs text-slate-500">{m.home.entryCount(entries.length)}</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          {m.home.newEntry}
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.home.searchPlaceholder}
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none"
        />
      </div>

      {loadError !== null && entries.length === 0 && (
        <p className="text-xs text-rose-400">{loadError}</p>
      )}

      {entries.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
          <KeyRound className="w-8 h-8 text-emerald-400 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-200">{m.home.emptyTitle}</h3>
          <p className="text-sm text-slate-400">{m.home.emptyText}</p>
          <button
            type="button"
            onClick={openNew}
            className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
          >
            {m.home.addFirst}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-2">
          <h3 className="text-base font-semibold text-slate-200">{m.home.emptyFoundTitle}</h3>
          <p className="text-sm text-slate-400">{m.home.emptyFoundText}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{entry.title}</p>
                  <p className="text-xs text-slate-400 truncate">{entry.username}</p>
                  {entry.domain !== '' && (
                    <p className="text-xs text-slate-500 truncate">{entry.domain}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(entry)}
                  title={m.home.modalEdit}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy(entry.username);
                  }}
                  title={m.home.copyUser}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                >
                  <User className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy(entry.password);
                  }}
                  title={m.home.copyPass}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenSite(entry.domain);
                  }}
                  title={m.home.openSite}
                  disabled={entry.domain === ''}
                  className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 disabled:opacity-40"
                >
                  <Globe className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <EntryModal
          entry={editing}
          onClose={() => setModalOpen(false)}
          onChanged={reload}
          onToast={onToast}
        />
      )}
    </div>
  );
}
