import { describe, expect, it } from 'vitest';
import { LANGUAGES, LANGUAGE_LABELS, messages } from '@zero/messages';
import { en } from '@zero/messages/en';
import { ptBR } from '@zero/messages/pt-BR';

function collectLeaves(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      collectLeaves(child, prefix === '' ? key : `${prefix}.${key}`, out);
    }
    return;
  }
  out.set(prefix, value);
}

function leavesOf(bundle: object): Map<string, unknown> {
  const out = new Map<string, unknown>();
  collectLeaves(bundle, '', out);
  return out;
}

describe('bundles de mensagens', () => {
  it('en cobre exatamente as chaves do pt-BR (canônico)', () => {
    const canonical = [...leavesOf(ptBR).keys()].sort();
    const translated = [...leavesOf(en).keys()].sort();
    expect(translated).toEqual(canonical);
  });

  it('strings são strings e funções continuam funções com a mesma aridade', () => {
    const canonical = leavesOf(ptBR);
    const translated = leavesOf(en);
    for (const [key, value] of canonical) {
      const other = translated.get(key);
      expect(typeof other).toBe(typeof value);
      if (typeof value === 'function') {
        const a = value as (...args: unknown[]) => unknown;
        const b = other as (...args: unknown[]) => unknown;
        expect(b.length).toBe(a.length);
      }
    }
  });

  it('idiomas e rótulos nativos estão registrados', () => {
    expect(LANGUAGES).toEqual(['pt-BR', 'en']);
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual([...LANGUAGES].sort());
    expect(LANGUAGE_LABELS['pt-BR']).toBe('Português (Brasil)');
    expect(LANGUAGE_LABELS.en).toBe('English');
  });

  it('messages() devolve o bundle correspondente', () => {
    expect(messages('pt-BR')).toBe(ptBR);
    expect(messages('en')).toBe(en);
  });
});
