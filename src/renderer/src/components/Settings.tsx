import type { JSX } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';

/** Tela de configurações: por ora apenas o aviso de que a seção chega futuramente. */
export function Settings(): JSX.Element {
  const m = useMessages();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">{m.settings.title}</h2>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <SlidersHorizontal className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-200">{m.settings.emptyTitle}</h3>
        <p className="text-sm text-slate-400 max-w-md">{m.settings.emptyText}</p>
      </div>
    </div>
  );
}
