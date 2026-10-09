import { describe, expect, it, vi } from 'vitest';
import { copyAndAutoClear } from '@zero/renderer/clipboard';
import type { ElectronApi } from '@zero/types';

/** Contrato completo de `window.api`; só o clipboard é exercitado aqui. */
function installApi(clipboardCopy: (value: string) => Promise<void>): ElectronApi {
  const unused = (): Promise<never> => Promise.reject(new Error('não usado neste teste'));
  const api: ElectronApi = {
    vault: {
      status: unused,
      create: unused,
      unlock: unused,
      resetPin: unused,
      lock: unused,
    },
    openDomain: unused,
    clipboard: { copy: clipboardCopy },
    entries: { list: unused, save: unused, remove: unused },
    generator: { generate: unused },
    settings: { get: unused, set: unused },
  };
  window.api = api;
  return api;
}

describe('copyAndAutoClear', () => {
  it('delega a cópia para o proxy do processo main', async () => {
    const copy = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
    installApi(copy);

    await copyAndAutoClear('senha-copiada');

    expect(copy).toHaveBeenCalledWith('senha-copiada');
  });

  it('propaga o erro do main sem copiar nada pela tela', async () => {
    const copy = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValue(new Error('bloqueado'));
    installApi(copy);

    await expect(copyAndAutoClear('senha')).rejects.toThrow('bloqueado');
  });
});
