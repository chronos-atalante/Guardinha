import type { JSX } from 'react';
import { Film, Key, Lock, Settings, Shield } from 'lucide-react';
import { LANGUAGE_LABELS, LANGUAGES } from '@zero/messages';
import { useMessages } from '@zero/renderer/i18n';
import type { Language } from '@zero/types';

export type TabType = 'home' | 'config' | 'credits';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLock: () => void;
}

const NAV_ITEMS: { tab: TabType; labelKey: 'home' | 'config' | 'credits'; icon: typeof Key }[] = [
  { tab: 'home', labelKey: 'home', icon: Key },
  { tab: 'config', labelKey: 'config', icon: Settings },
  { tab: 'credits', labelKey: 'credits', icon: Film },
];

export function Sidebar({
  activeTab,
  onTabChange,
  language,
  onLanguageChange,
  onLock,
}: SidebarProps): JSX.Element {
  const m = useMessages();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col p-4 justify-between">
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <Shield className="w-7 h-7 text-emerald-400" />
          <div>
            <h1 className="font-bold text-lg leading-none text-slate-100">{m.app.name}</h1>
            <span className="text-xs text-slate-400">{m.app.subtitle}</span>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onTabChange(item.tab)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.tab
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {m.app.nav[item.labelKey]}
              </button>
            );
          })}
        </nav>

        <div className="px-2 space-y-1.5">
          <label className="text-xs text-slate-500" htmlFor="zena-language">
            {m.app.languageLabel}
          </label>
          <select
            id="zena-language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none cursor-pointer"
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onLock}
          title={m.app.lockTitle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 bg-slate-800/60 hover:bg-slate-800 hover:text-slate-200 border border-slate-800 transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
          {m.app.lock}
        </button>
      </div>

      <div className="text-xs text-slate-500 px-2 text-center border-t border-slate-800 pt-3">
        Status: <span className="text-emerald-400 font-semibold">{m.app.statusLocal}</span>
      </div>
    </aside>
  );
}
