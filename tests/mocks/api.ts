import type { ElectronApi, PanicStatus, VaultStatus } from '@zero/types';

export const UNLOCKED: VaultStatus = {
  exists: true,
  locked: false,
  attempts: 0,
  lockUntil: null,
  lockRemainingMs: 0,
};

export const LOCKED: VaultStatus = { ...UNLOCKED, locked: true };

export const NO_PANIC: PanicStatus = { hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 };

/**
 * Contrato completo de `window.api` para os testes de renderer. Tudo que o
 * arquivo não exercita vira `unused` (rejeita), então chamar um canal por
 * engano aparece como falha em vez de passar em silêncio.
 *
 * Os testes que precisam observar um canal sobrescrevem o campo depois de
 * chamar este helper.
 */
export function installApi(
  overrides: {
    status?: VaultStatus;
    entries?: ElectronApi['entries']['list'] extends () => Promise<infer T> ? T : never;
    language?: 'pt-BR' | 'en';
    panic?: PanicStatus;
  } = {},
): ElectronApi {
  const unused = (): Promise<never> => Promise.reject(new Error('não usado neste teste'));
  const status = overrides.status ?? UNLOCKED;
  const entries = overrides.entries ?? [];
  const api: ElectronApi = {
    vault: {
      status: () => Promise.resolve(status),
      create: unused,
      unlock: unused,
      resetPin: unused,
      lock: () => Promise.resolve(status),
      destroy: () => Promise.resolve({ ...status, exists: false }),
      setPanicPin: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      clearPanicPin: () => Promise.resolve(status),
      setNukeLimit: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      panicStatus: () => Promise.resolve(overrides.panic ?? NO_PANIC),
      onAutoLocked: () => () => {
        // auto-lock não é exercitado no renderer
      },
    },
    openDomain: unused,
    clipboard: { copy: () => Promise.resolve() },
    entries: {
      list: () => Promise.resolve(entries),
      save: () => Promise.resolve(entries),
      remove: () => Promise.resolve([]),
    },
    generator: { generate: () => Promise.resolve('senha-gerada-123') },
    settings: {
      get: () => Promise.resolve({ language: overrides.language ?? 'pt-BR' }),
      set: (next) => Promise.resolve(next),
    },
  };
  window.api = api;
  return api;
}
