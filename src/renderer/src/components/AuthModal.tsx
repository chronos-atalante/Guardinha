import { useEffect, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { ArrowLeft, Hash, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { richText, useMessages } from '@zero/renderer/i18n';
import {
  countWords,
  errorMessage,
  formatCountdown,
  normalizePhrase,
} from '@zero/renderer/formatters';
import { StrengthMeter } from '@zero/renderer/components/StrengthMeter';
import { strengthFor } from '@zero/shared';
import type { VaultStatus } from '@zero/types';

interface AuthModalProps {
  status: VaultStatus;
  /** Recarrega o status no App após qualquer operação de cofre. */
  onRefresh: () => Promise<void>;
}

/**
 * Mínimo de palavras da frase de recuperação (espelha `RECOVERY_MIN_WORDS`
 * de `@zero/main/crypto`; o renderer não importa módulos do main).
 */
const RECOVERY_MIN_WORDS = 12;

export function AuthModal({ status, onRefresh }: AuthModalProps): JSX.Element {
  const m = useMessages();
  const isCreate = !status.exists;

  // ----- criação -----
  const [step, setStep] = useState<'credentials' | 'recovery'>('credentials');
  const [master, setMaster] = useState('');
  const [masterConfirm, setMasterConfirm] = useState('');
  const [pin, setPin] = useState('');
  const [phrase, setPhrase] = useState('');
  const [phraseConfirm, setPhraseConfirm] = useState('');

  // ----- desbloqueio -----
  const [mode, setMode] = useState<'pin' | 'master' | 'reset'>('pin');
  const [credential, setCredential] = useState('');
  const [resetPhrase, setResetPhrase] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(status.lockRemainingMs);

  const locked = remaining > 0;
  /** Só depois de 3 falhas o app oferece a senha mestra como login. */
  const showMaster = status.attempts >= 3;

  useEffect(() => {
    setRemaining(status.lockRemainingMs);
  }, [status.lockRemainingMs]);

  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [locked]);

  useEffect(() => {
    if (mode === 'master' && !showMaster) {
      setMode('pin');
      setCredential('');
    }
  }, [mode, showMaster]);

  const handleCreateCredentials = (): void => {
    setError(null);
    if (master.length !== 24) {
      setError(m.auth.masterLength(24, master.length));
      return;
    }
    if (strengthFor('master').evaluate(master).blocked) {
      setError(m.errors.trivialMaster);
      return;
    }
    if (master !== masterConfirm) {
      setError(m.auth.masterMismatch);
      return;
    }
    if (!/^\d{8}$/.test(pin)) {
      setError(m.auth.pinInvalid);
      return;
    }
    if (strengthFor('pin').evaluate(pin).blocked) {
      setError(m.errors.trivialPin);
      return;
    }
    setStep('recovery');
  };

  const handleCreate = async (): Promise<void> => {
    setError(null);
    const words = countWords(phrase);
    if (words < RECOVERY_MIN_WORDS) {
      setError(m.auth.recoveryTooShort(RECOVERY_MIN_WORDS, words));
      return;
    }
    if (strengthFor('phrase').evaluate(phrase).blocked) {
      setError(m.errors.trivialPhrase);
      return;
    }
    if (normalizePhrase(phrase) !== normalizePhrase(phraseConfirm)) {
      setError(m.auth.recoveryMismatch);
      return;
    }
    setBusy(true);
    try {
      const result = await window.api.vault.create({
        masterPassword: master,
        pin,
        recoveryPhrase: phrase,
      });
      if (!result.ok) {
        setError(result.error ?? m.errors.internal);
        return;
      }
      setMaster('');
      setMasterConfirm('');
      setPin('');
      setPhrase('');
      setPhraseConfirm('');
      await onRefresh();
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (): Promise<void> => {
    setError(null);
    if (credential.trim() === '') return;
    const kind = mode === 'master' ? 'master' : 'pin';
    setBusy(true);
    try {
      const result = await window.api.vault.unlock({ credential, kind });
      if (result.ok) {
        setCredential('');
        await onRefresh();
      } else {
        setError(result.error ?? m.errors.internal);
        await onRefresh();
      }
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    setError(null);
    const words = countWords(resetPhrase);
    if (words < RECOVERY_MIN_WORDS) {
      setError(m.auth.recoveryTooShort(RECOVERY_MIN_WORDS, words));
      return;
    }
    if (!/^\d{8}$/.test(newPin)) {
      setError(m.auth.pinInvalid);
      return;
    }
    if (strengthFor('pin').evaluate(newPin).blocked) {
      setError(m.errors.trivialPin);
      return;
    }
    if (newPin !== newPinConfirm) {
      setError(m.auth.pinMismatch);
      return;
    }
    setBusy(true);
    try {
      const result = await window.api.vault.resetPin({ phrase: resetPhrase, newPin });
      if (!result.ok) {
        setError(result.error ?? m.errors.internal);
        await onRefresh();
        return;
      }
      setResetPhrase('');
      setNewPin('');
      setNewPinConfirm('');
      setCredential('');
      setMode('pin');
      await onRefresh();
    } catch (caught) {
      setError(errorMessage(caught, m.errors.internal));
    } finally {
      setBusy(false);
    }
  };

  const submitOnEnter =
    (handler: () => void | Promise<void>) =>
    (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void handler();
      }
    };

  const shell = (title: string, subtitle: ReactNode, body: ReactNode): JSX.Element => (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">{title}</h1>
            <p className="text-xs text-slate-400 leading-relaxed">{subtitle}</p>
          </div>
        </div>
        {body}
      </div>
    </div>
  );

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none';
  const primaryButton =
    'py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 font-semibold text-slate-950 rounded-lg text-sm transition-colors flex items-center justify-center gap-2';

  if (isCreate) {
    if (step === 'credentials') {
      return shell(
        m.auth.createTitle,
        richText(m.auth.createSubtitle),
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">{m.auth.masterLabel}</span>
            <input
              type="password"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              placeholder={m.auth.masterPlaceholder}
              autoFocus
              className={inputClass}
            />
          </label>
          {master !== '' && (
            <StrengthMeter
              result={strengthFor('master').evaluate(master)}
              hint={m.strength.hintMaster}
            />
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">{m.auth.masterConfirmLabel}</span>
            <input
              type="password"
              value={masterConfirm}
              onChange={(e) => setMasterConfirm(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-300">{m.auth.pinLabel}</span>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={m.auth.pinPlaceholder}
              onKeyDown={submitOnEnter(handleCreateCredentials)}
              className={inputClass}
            />
          </label>
          {pin !== '' && (
            <StrengthMeter result={strengthFor('pin').evaluate(pin)} hint={m.strength.hintPin} />
          )}
          <p className="text-xs text-slate-500">{m.auth.pinSubtitle}</p>
          {error !== null && <p className="text-xs text-rose-400">{error}</p>}
          <button
            type="button"
            onClick={handleCreateCredentials}
            className={`${primaryButton} w-full`}
          >
            {m.common.next}
          </button>
        </div>,
      );
    }

    return shell(
      m.auth.recoveryTitle,
      richText(m.auth.recoverySubtitle),
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.auth.recoveryLabel}</span>
          <textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={m.auth.recoveryPlaceholder}
            rows={3}
            onKeyDown={submitOnEnter(handleCreate)}
            className={`${inputClass} resize-none`}
          />
        </label>
        {phrase !== '' && (
          <StrengthMeter
            result={strengthFor('phrase').evaluate(phrase)}
            hint={m.strength.hintPhrase}
          />
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.auth.recoveryConfirmLabel}</span>
          <textarea
            value={phraseConfirm}
            onChange={(e) => setPhraseConfirm(e.target.value)}
            placeholder={m.auth.recoveryPlaceholder}
            rows={3}
            onKeyDown={submitOnEnter(handleCreate)}
            className={`${inputClass} resize-none`}
          />
        </label>
        <p className="text-xs text-slate-500">{m.auth.recoveryHint}</p>
        {error !== null && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setStep('credentials');
              setError(null);
            }}
            className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            {m.common.back}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCreate();
            }}
            disabled={busy}
            className={`${primaryButton} flex-1`}
          >
            {busy ? m.auth.creating : m.auth.createAction}
          </button>
        </div>
      </div>,
    );
  }

  if (mode === 'reset') {
    return shell(
      m.auth.resetTitle,
      richText(m.auth.resetSubtitle),
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.auth.recoveryLabel}</span>
          <textarea
            value={resetPhrase}
            onChange={(e) => setResetPhrase(e.target.value)}
            placeholder={m.auth.recoveryPlaceholder}
            rows={3}
            onKeyDown={submitOnEnter(handleReset)}
            className={`${inputClass} resize-none`}
          />
        </label>
        <p className="text-xs text-slate-500">{m.auth.recoveryHint}</p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.auth.newPinLabel}</span>
          <input
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder={m.auth.pinPlaceholder}
            onKeyDown={submitOnEnter(handleReset)}
            className={inputClass}
          />
        </label>
        {newPin !== '' && (
          <StrengthMeter result={strengthFor('pin').evaluate(newPin)} hint={m.strength.hintPin} />
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-300">{m.auth.newPinConfirmLabel}</span>
          <input
            type="password"
            inputMode="numeric"
            value={newPinConfirm}
            onChange={(e) => setNewPinConfirm(e.target.value)}
            onKeyDown={submitOnEnter(handleReset)}
            className={inputClass}
          />
        </label>
        {error !== null && <p className="text-xs text-rose-400">{error}</p>}
        {locked && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            {m.auth.lockout(formatCountdown(remaining))}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('pin');
              setError(null);
            }}
            className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            {m.auth.backToPin}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleReset();
            }}
            disabled={busy || locked}
            className={`${primaryButton} flex-1`}
          >
            <Sparkles className="w-4 h-4" />
            {busy ? m.auth.resetting : m.auth.resetAction}
          </button>
        </div>
      </div>,
    );
  }

  const tabs: { key: 'pin' | 'master'; label: string }[] = [{ key: 'pin', label: m.auth.tabPin }];
  if (showMaster) tabs.push({ key: 'master', label: m.auth.tabMaster });

  return shell(
    m.auth.unlockTitle,
    m.auth.unlockSubtitle,
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setMode(tab.key);
              setCredential('');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
              mode === tab.key
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800/50 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showMaster && <p className="text-xs text-amber-400">{m.auth.masterAvailable}</p>}

      <input
        type="password"
        inputMode={mode === 'pin' ? 'numeric' : undefined}
        value={credential}
        onChange={(e) => setCredential(e.target.value)}
        placeholder={mode === 'pin' ? m.auth.pinPlaceholder : m.auth.masterPlaceholder}
        autoFocus
        onKeyDown={submitOnEnter(handleUnlock)}
        className={inputClass}
      />

      {error !== null && <p className="text-xs text-rose-400">{error}</p>}

      {locked && (
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          {m.auth.lockout(formatCountdown(remaining))}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          void handleUnlock();
        }}
        disabled={busy || locked}
        className={`${primaryButton} w-full`}
      >
        {mode === 'master' ? <KeyRound className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
        {busy ? m.auth.unlocking : m.auth.unlockAction}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode('reset');
          setError(null);
        }}
        className="text-xs text-slate-400 hover:text-emerald-400 underline underline-offset-2 self-start"
      >
        {m.auth.forgotPin}
      </button>
    </div>,
  );
}
