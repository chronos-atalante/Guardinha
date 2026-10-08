/** Textos utilitários das telas do renderer (fora do componente, para não inflá-lo). */

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '').length;
}

/** Mesma normalização do main: minúsculas e espaços simples. */
export function normalizePhrase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .join(' ');
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}
