// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAuthState, registerFailedAttempt, resetAttempts, statusFrom } from '@zero/main/auth';
import { vaultStorage } from '@zero/main/facade';
import { createVault, unlock } from '@zero/main/vault';
import { runUnlockChain } from '@zero/main/unlock';
import { keyUnwrapperFor } from '@zero/main/unwrapping';
import { currentMessages } from '@zero/main/i18n';
import type { UnlockContext } from '@zero/main/unlock';
import type { VaultContainerData } from '@zero/main/container';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

/** Container mínimo para a cadeia rodar sem gravar nada. */
async function makeContainer(): Promise<VaultContainerData> {
  const key = Buffer.alloc(32, 5);
  return {
    createdAt: Date.now(),
    kdf: keyUnwrapperFor('pin').kdf,
    attempts: 0,
    lockUntil: null,
    methods: {
      pin: await keyUnwrapperFor('pin').wrap(key, PIN),
      master: await keyUnwrapperFor('master').wrap(key, MASTER),
    },
    manifest: null,
  };
}

function context(
  credential: string,
  kind: 'pin' | 'master',
  container: VaultContainerData,
): UnlockContext {
  return { input: { credential, kind }, container };
}

describe('runUnlockChain (Chain of Responsibility)', () => {
  // criar o cofre custa três derivações Argon2id: sob carga 10 s não bastam
  beforeAll(async () => {
    if (!vaultStorage.exists()) {
      await createVault({ masterPassword: MASTER, pin: PIN, recoveryPhrase: PHRASE });
    }
  }, 60_000);

  it('a cadeia libera a chave com a credencial certa', async () => {
    const container = await makeContainer();
    const unlocked = await runUnlockChain(context(PIN, 'pin', container));
    expect(unlocked).toBeNull();
  });

  it('credencial errada conta tentativa e responde o mesmo erro único', async () => {
    resetAttempts();
    const container = await makeContainer();
    const result = await runUnlockChain(context('00000000', 'pin', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(loadAuthState().attempts).toBe(1);
  });

  it('PIN malformado é recusado antes do Argon2id (mesmo erro de credencial errada)', async () => {
    resetAttempts();
    const container = await makeContainer();
    // '123' falha no validador de formato: o payload nunca é tocado
    const result = await runUnlockChain(context('123', 'pin', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(loadAuthState().attempts).toBe(1);
  });

  it('senha mestra malformada segue a mesma régua do formato', async () => {
    resetAttempts();
    const container = await makeContainer();
    const result = await runUnlockChain(context('curta', 'master', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongMaster });
  });

  it('trava exponencial corta antes de qualquer derivação e não gasta tentativa', async () => {
    resetAttempts();
    registerFailedAttempt(); // 1 falha já trava 10 s na sequência do app
    const state = loadAuthState();
    expect(state.lockUntil).not.toBeNull();

    // o relógio para: o Argon2id do container custa >10 s sob carga e derrubaria
    // a espera antes de a cadeia rodar
    vi.useFakeTimers();
    try {
      const container = await makeContainer();
      const result = await runUnlockChain(context(PIN, 'pin', container));
      expect(result?.ok).toBe(false);
      expect(result?.error).toContain('Muitas tentativas');
      // quem está esperando não paga tentativa nova
      expect(loadAuthState().attempts).toBe(state.attempts);
    } finally {
      vi.useRealTimers();
    }
  });

  it('método ausente no container é credencial errada, com tentativa', async () => {
    resetAttempts();
    const container = await makeContainer();
    delete container.methods.pin;
    const result = await runUnlockChain(context(PIN, 'pin', container));
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(loadAuthState().attempts).toBe(1);
  });

  it('statusFrom expõe tentativa, espera e travado', () => {
    resetAttempts();
    registerFailedAttempt();
    const status = statusFrom(loadAuthState(), true, true);
    expect(status).toMatchObject({ exists: true, locked: true, attempts: 1 });
    expect(status.lockRemainingMs).toBeGreaterThan(0);
    expect(status.lockUntil).not.toBeNull();
  });

  it('unlock() usa a cadeia e mantém o mesmo contrato de antes', async () => {
    resetAttempts();
    const result = await unlock({ credential: '00000000', kind: 'pin' });
    expect(result).toMatchObject({ ok: false, error: currentMessages().errors.wrongPin });
    expect(result.status.attempts).toBe(1);
  });
});
