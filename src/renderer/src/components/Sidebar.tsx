import type { JSX } from 'react';
import { Dices, Film, Key, Lock, Settings, Shield } from 'lucide-react';
import { LanguageSelect } from '@zero/renderer/components/LanguageSelect';
import { useMessages } from '@zero/renderer/i18n';
import type { Language } from '@zero/types';

export type TabType = 'home' | 'generator' | 'credits' | 'settings';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLock: () => void;
}

type NavLabelKey = 'home' | 'generator' | 'credits' | 'settings';

const NAV_ITEMS: { tab: TabType; labelKey: NavLabelKey; icon: typeof Key }[] = [
  { tab: 'home', labelKey: 'home', icon: Key },
  { tab: 'generator', labelKey: 'generator', icon: Dices },
  { tab: 'credits', labelKey: 'credits', icon: Film },
  { tab: 'settings', labelKey: 'settings', icon: Settings },
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

        <div className="px-2">
          <LanguageSelect language={language} onLanguageChange={onLanguageChange} />
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
