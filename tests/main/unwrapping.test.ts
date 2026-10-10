// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KDF_CREDENTIAL, KDF_PIN, decryptRecord } from '@zero/main/crypto';
import { isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import type { CredentialKind } from '@zero/main/unwrapping';
import type { WrappedMethod } from '@zero/main/container';

const VAULT_KEY = Buffer.alloc(32, 9);
const PIN = '49201733';
const MASTER = 'senha-mestra-guardinha24';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const CREDENTIALS: Record<CredentialKind, string> = {
  master: MASTER,
  pin: PIN,
  recovery: PHRASE,
  panic: '78304412',
};

/** Embrulha com a outra credencial e verifica que o GCM recusa o payload. */
async function wrapWithOther(kind: CredentialKind, credential: string): Promise<WrappedMethod> {
  const other = kind === 'pin' ? MASTER : PIN;
  expect(other).not.toBe(credential);
  return keyUnwrapperFor(kind).wrap(VAULT_KEY, other);
}

describe('KeyUnwrapperFactory (Factory Method)', () => {
  it('resolve um embrulhador por tipo de credencial', () => {
    expect(keyUnwrapperFor('master').kind).toBe('master');
    expect(keyUnwrapperFor('pin').kind).toBe('pin');
    expect(keyUnwrapperFor('recovery').kind).toBe('recovery');
  });

  it('cada tipo recebe o custo do Argon2id adequado ao segredo', () => {
    // o PIN de 8 dígitos é o mais fraco: perfil mais caro
    expect(keyUnwrapperFor('pin').kdf).toMatchObject(KDF_PIN);
    expect(keyUnwrapperFor('master').kdf).toMatchObject(KDF_CREDENTIAL);
    expect(keyUnwrapperFor('recovery').kdf).toMatchObject(KDF_CREDENTIAL);
  });

  it('isUpToDate compara o custo gravado com o perfil atual', async () => {
    const kind: CredentialKind = 'master';
    const wrapped = await keyUnwrapperFor(kind).wrap(VAULT_KEY, MASTER);
    expect(isKdfUpToDate(kind, wrapped)).toBe(true);

    const older: WrappedMethod = {
      ...wrapped,
      kdf: { algo: 'argon2id', memoryKiB: 65_536, iterations: 3, parallelism: 4 },
    };
    expect(isKdfUpToDate(kind, older)).toBe(false);
  });

  for (const kind of ['master', 'pin', 'recovery'] as const) {
    it(`${kind}: embrulha e desembrulha a mesma chave de 32 bytes`, async () => {
      const unwrapper = keyUnwrapperFor(kind);
      const method = await unwrapper.wrap(VAULT_KEY, CREDENTIALS[kind]);

      const derived = await unwrapper.derive(method, CREDENTIALS[kind]);
      expect(derived).toHaveLength(32);
      const vaultKey = unwrapper.unwrap(method, derived);

      expect(vaultKey).toHaveLength(32);
      expect(vaultKey.equals(VAULT_KEY)).toBe(true);
      derived.fill(0);
    });

    it(`${kind}: credencial errada recusa o payload (AES-256-GCM)`, async () => {
      const unwrapper = keyUnwrapperFor(kind);
      const method = await wrapWithOther(kind, CREDENTIALS[kind]);

      const derived = await unwrapper.derive(method, 'credencial-errada');
      expect(() => unwrapper.unwrap(method, derived)).toThrow();
      derived.fill(0);
    });
  }

  it('o payload do embrulho só abre com a chave de trabalho certa', async () => {
    const method = await keyUnwrapperFor('pin').wrap(VAULT_KEY, PIN);
    const derived = await keyUnwrapperFor('pin').derive(method, PIN);
    // o payload guarda a chave em hex cifrado; sem o derived certo ele não abre
    expect(() => decryptRecord(method.payload, Buffer.alloc(32, 1))).toThrow();
    derived.fill(0);
  });
});
