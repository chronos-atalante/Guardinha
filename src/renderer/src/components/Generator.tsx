import { useState } from 'react';
import type { JSX } from 'react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useMessages } from '@zero/renderer/i18n';
import { SensitivitySlider } from '@zero/renderer/components/SensitivitySlider';

interface GeneratorProps {
  onToast: (message: string) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

export function Generator({ onToast }: GeneratorProps): JSX.Element {
  const m = useMessages();
  const [length, setLength] = useState<number>(24);
  const [useUpper, setUseUpper] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);

  // 5 gostos/palavras pessoais para aumentar a entropia
  const [customWords, setCustomWords] = useState<string[]>(['', '', '', '', '']);
  const [generatedPassword, setGeneratedPassword] = useState('');

  const handleWordChange = (index: number, value: string): void => {
    setCustomWords((words) => words.map((word, i) => (i === index ? value : word)));
  };

  const handleGenerate = async (): Promise<void> => {
    if (length <= 0) {
      onToast(m.generator.emptyLength);
      return;
    }
    try {
      const password = await window.api.generator.generate({
        length,
        useUpper,
        useNumbers,
        useSymbols,
        customEntropyWords: customWords,
      });
      setGeneratedPassword(password);
    } catch (caught) {
      onToast(errorMessage(caught, m.errors.invalidGenerator));
    }
  };

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(generatedPassword);
    onToast(m.generator.toastCopied);
  };

  const toggles: { checked: boolean; set: (value: boolean) => void; label: string }[] = [
    { checked: useUpper, set: setUseUpper, label: m.generator.upper },
    { checked: useNumbers, set: setUseNumbers, label: m.generator.numbers },
    { checked: useSymbols, set: setUseSymbols, label: m.generator.symbols },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">{m.generator.title}</h2>
        <p className="text-sm text-slate-400">{m.generator.subtitle}</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300 font-medium">{m.generator.lengthLabel}</span>
            <span className="text-emerald-400 font-bold">{m.generator.lengthValue(length)}</span>
          </div>
          <SensitivitySlider
            value={length}
            min={0}
            max={72}
            label={m.generator.lengthLabel}
            onChange={setLength}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {toggles.map((toggle) => (
            <label
              key={toggle.label}
              className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 p-2.5 rounded-lg border border-slate-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={toggle.checked}
                onChange={(e) => toggle.set(e.target.checked)}
                className="accent-emerald-500"
              />
              {toggle.label}
            </label>
          ))}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-emerald-400 mb-2">
            <Sparkles className="w-4 h-4" />
            {m.generator.entropyTitle}
          </label>
          <div className="grid grid-cols-5 gap-2">
            {customWords.map((word, index) => (
              <input
                key={String(index)}
                type="text"
                placeholder={m.generator.entropyPlaceholders[index] ?? ''}
                value={word}
                onChange={(e) => handleWordChange(index, e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none"
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-semibold text-slate-950 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {m.generator.generate}
        </button>

        {generatedPassword !== '' && (
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-3 font-mono text-emerald-400 break-all text-sm">
            <span>{generatedPassword}</span>
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              title={m.generator.copyTitle}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 shrink-0"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
