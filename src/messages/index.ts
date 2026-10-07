import type { Language } from '@zero/types';
import { en } from '@zero/messages/en';
import { ptBR } from '@zero/messages/pt-BR';
import type { Messages } from '@zero/messages/pt-BR';

export type { Messages };

/** Idiomas suportados, na ordem de exibição. */
export const LANGUAGES: readonly Language[] = ['pt-BR', 'en'];

/** Nome nativo de cada idioma (não se traduz: aparece assim em qualquer idioma). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
};

const BUNDLES: Record<Language, Messages> = { 'pt-BR': ptBR, en };

/** Mensagens do idioma pedido. */
export function messages(language: Language): Messages {
  return BUNDLES[language];
}

export { en, ptBR };
