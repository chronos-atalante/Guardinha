// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { encryptRecord } from '@zero/main/crypto';
import { vaultStorage } from '@zero/main/facade';
import { currentMessages } from '@zero/main/i18n';
import { deleteEntry, updateManifest, writeEntryPayload } from '@zero/main/storage';
import { createVault, requireSessionKey } from '@zero/main/vault';
import type { Credential } from '@zero/types';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase alguma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const TAMPERED = currentMessages().errors.vaultTampered;

function record(id: string): Credential {
  return {
    id,
    title: 'Banco',
    username: 'chronos-atalante',
    password: 's3nh@-forte',
    domain: 'banco.com.br',
    notes: '',
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };
}

describe('VaultStorageFacade (fachada de persistência)', () => {
  // o Argon2id do PIN custa 256 MB e passa de 15 s sob carga (hookTimeout global)
  beforeAll(async () => {
    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(true);
  }, 120_000);

  it('escreve, lê e remove credencial mantendo o manifesto coerente', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    const stored = record(id);

    vaultStorage.writeRecord(stored, key);
    expect(vaultStorage.listIds()).toContain(id);
    expect(vaultStorage.readRecord(id, key)).toEqual(stored);
    vaultStorage.verifyManifest(key);

    vaultStorage.removeRecord(id, key);
    expect(vaultStorage.listIds()).not.toContain(id);
    vaultStorage.verifyManifest(key);
  });

  it('responde adulteração quando o registro não tem a forma esperada', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeEntryPayload(id, encryptRecord({ id, title: 42 }, key));

    try {
      expect(() => vaultStorage.readRecord(id, key)).toThrow(TAMPERED);
    } finally {
      deleteEntry(id);
      updateManifest(key);
    }
  });

  it('responde adulteração quando um arquivo entra fora do manifesto', () => {
    const key = requireSessionKey();
    const id = vaultStorage.newId();
    writeEntryPayload(id, encryptRecord(record(id), key));

    try {
      expect(() => vaultStorage.verifyManifest(key)).toThrow(TAMPERED);
    } finally {
      deleteEntry(id);
      updateManifest(key);
    }
  });

  it('expõe a estrutura e o caminho do cofre sem tocar fs direto', () => {
    expect(vaultStorage.exists()).toBe(true);
    vaultStorage.ensureStructure();
    expect(vaultStorage.listIds()).toEqual([]);
    expect(vaultStorage.path()).not.toBe('');
    expect(vaultStorage.createKey()).toHaveLength(32);
  });
});
