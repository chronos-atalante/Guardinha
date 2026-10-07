import { useEffect } from 'react';
import type { JSX } from 'react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

/** Aviso flutuante (copy, save…) que some sozinho após 2,5 s. */
export function Toast({ message, onClose }: ToastProps): JSX.Element | null {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (message === null) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-emerald-500/30 text-slate-100 text-sm px-4 py-2.5 rounded-lg shadow-lg">
      {message}
    </div>
  );
}
