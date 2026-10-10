import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { MessagesProvider, useMessages } from '@zero/renderer/i18n';
import { Sidebar } from '@zero/renderer/components/Sidebar';
import type { TabType } from '@zero/renderer/components/Sidebar';
import { Home } from '@zero/renderer/components/Home';
import { Generator } from '@zero/renderer/components/Generator';
import { Credits } from '@zero/renderer/components/Credits';
import { Settings } from '@zero/renderer/components/Settings';
import { AuthModal } from '@zero/renderer/components/AuthModal';
import { DestroyModal } from '@zero/renderer/components/DestroyModal';
import { Toast } from '@zero/renderer/components/Toast';
import type { Language, VaultStatus } from '@zero/types';

interface ShellProps {
  status: VaultStatus | null;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onRefresh: () => Promise<void>;
}

function Shell({ status, language, onLanguageChange, onRefresh }: ShellProps): JSX.Element {
  const m = useMessages();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const handleLock = async (): Promise<void> => {
    await window.api.vault.lock();
    setActiveTab('home');
    await onRefresh();
  };

  const handleDestroyed = async (): Promise<void> => {
    setActiveTab('home');
    setToast(m.panic.destroyed);
    await onRefresh();
  };

  if (status === null) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center text-sm">
        {m.app.checkingVault}
      </div>
    );
  }

  if (!status.exists || status.locked) {
    return <AuthModal status={status} onRefresh={onRefresh} />;
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        language={language}
        onLanguageChange={onLanguageChange}
        onLock={() => {
          void handleLock();
        }}
        onDestroy={() => setConfirmDestroy(true)}
      />
      <main className="flex-1 bg-slate-950 overflow-y-auto p-8">
        {activeTab === 'home' && <Home onToast={setToast} />}
        {activeTab === 'generator' && <Generator onToast={setToast} />}
        {activeTab === 'credits' && <Credits />}
        {activeTab === 'settings' && <Settings />}
      </main>
      {confirmDestroy && (
        <DestroyModal
          onClose={() => setConfirmDestroy(false)}
          onDestroyed={() => handleDestroyed()}
        />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

export default function App(): JSX.Element {
  const [language, setLanguage] = useState<Language>('pt-BR');
  const [status, setStatus] = useState<VaultStatus | null>(null);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setStatus(await window.api.vault.status());
  }, []);

  useEffect(() => {
    void (async () => {
      const [settings, vaultStatus] = await Promise.all([
        window.api.settings.get(),
        window.api.vault.status(),
      ]);
      setLanguage(settings.language);
      setStatus(vaultStatus);
    })().catch((error: unknown) => {
      console.error('Falha ao consultar o cofre:', error);
    });
  }, []);

  const unlocked = status !== null && status.exists && !status.locked;

  // Observer: o main avisa no auto-lock. O polling de 15 s fica como rede de
  // segurança (rede, IPC e renderer podem falhar por conta própria).
  useEffect(() => {
    if (!unlocked) return;
    const unsubscribe = window.api.vault.onAutoLocked(() => {
      void refreshStatus();
    });
    const timer = setInterval(() => {
      void refreshStatus();
    }, 15000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [unlocked, refreshStatus]);

  const handleLanguageChange = useCallback((next: Language): void => {
    void window.api.settings.set({ language: next }).then((saved) => setLanguage(saved.language));
  }, []);

  return (
    <MessagesProvider language={language}>
      <Shell
        status={status}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRefresh={refreshStatus}
      />
    </MessagesProvider>
  );
}
