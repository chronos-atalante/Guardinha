import { useEffect, useId, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LANGUAGE_LABELS, LANGUAGES } from '@zero/messages';
import { useMessages } from '@zero/renderer/i18n';
import type { Language } from '@zero/types';

interface LanguageSelectProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
}

/**
 * Seletor de idioma: campo retangular com o menu embutido. O menu abre abaixo
 * do campo (itens com check no ativo) e fecha no clique fora, no Escape ou
 * após escolher um idioma.
 */
export function LanguageSelect({ language, onLanguageChange }: LanguageSelectProps): JSX.Element {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  const activeIndex = Math.max(0, LANGUAGES.indexOf(language));

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent): void => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target) === true)
        return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFocusIndex(activeIndex);
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (code: Language): void => {
    setOpen(false);
    triggerRef.current?.focus();
    if (code !== language) onLanguageChange(code);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleItemKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const last = LANGUAGES.length - 1;
    let next: number | null = null;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown') next = focusIndex >= last ? 0 : focusIndex + 1;
    else if (event.key === 'ArrowUp') next = focusIndex <= 0 ? last : focusIndex - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Tab') setOpen(false);
    if (next !== null) {
      event.preventDefault();
      setFocusIndex(next);
      itemRefs.current[next]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <span className="text-xs text-slate-500" id={`${listId}-label`}>
        {m.app.languageLabel}
      </span>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
        className="w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer transition-colors hover:border-slate-700 focus:outline-none focus-visible:border-emerald-500"
      >
        <span className="truncate">{LANGUAGE_LABELS[language]}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={`${listId}-label`}
          className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-lg shadow-black/40"
        >
          {LANGUAGES.map((code, index) => {
            const selected = code === language;
            return (
              <li key={code} role="option" aria-selected={selected}>
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => choose(code)}
                  onKeyDown={handleItemKeyDown}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-left cursor-pointer transition-colors focus:outline-none ${
                    selected
                      ? 'bg-emerald-500/10 text-emerald-400 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800'
                  }`}
                >
                  <span>{LANGUAGE_LABELS[code]}</span>
                  {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
