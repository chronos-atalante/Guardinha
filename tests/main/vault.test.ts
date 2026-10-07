// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { resetAttempts } from '@zero/main/auth';
import { currentMessages } from '@zero/main/i18n';
import { listEntries, removeEntry, saveEntry } from '@zero/main/entries';
import { createVault, getStatus, lock, resetPin, unlock } from '@zero/main/vault';

const MASTER = 'senha-mestra-de-zena-24c';
const PIN = '49201733';
const NEW_PIN = '87654321';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase alguma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';
const WRONG_PHRASE = 'frase errada com doze palavras no total para nao cair no minimo';

describe('ciclo de vida do cofre (integração)', () => {
  it('1. cria o cofre com senha mestra, PIN e frase escrita pelo usuário', async () => {
    expect(getStatus()).toMatchObject({ exists: false, locked: true });

    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toMatchObject({ exists: true, locked: false, attempts: 0 });
  });

  it('2. recusa recriar um cofre existente', async () => {
    const result = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(currentMessages().errors.vaultExists);
  });

  it('3. valida formato da senha mestra, do PIN e da frase de recuperação', async () => {
    lock();
    resetAttempts();
    const short = await createVault({
      masterPassword: 'curta',
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(short.ok).toBe(false);
    expect(short.error).toBe(currentMessages().errors.invalidMasterLength);

    const badPin = await createVault({
      masterPassword: MASTER,
      pin: '123',
      recoveryPhrase: PHRASE,
    });
    expect(badPin.ok).toBe(false);
    expect(badPin.error).toBe(currentMessages().errors.invalidPin);

    const shortPhrase = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: 'apenas onze palavras aqui nao satisfaz o minimo',
    });
    expect(shortPhrase.ok).toBe(false);
    expect(shortPhrase.error).toBe(currentMessages().errors.invalidRecovery);
  });

  it('4. falha com PIN errado, trava por 10 s e depois aceita o PIN certo', async () => {
    lock();
    resetAttempts();

    const failed = await unlock({ credential: '00000000', kind: 'pin' });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe(currentMessages().errors.wrongPin);
    expect(failed.status.attempts).toBe(1);
    expect(failed.status.locked).toBe(true);

    const blocked = await unlock({ credential: PIN, kind: 'pin' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain('Muitas tentativas');

    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow + 11_000);
    const unlocked = await unlock({ credential: PIN, kind: 'pin' });
    expect(unlocked.ok).toBe(true);
    expect(unlocked.status).toMatchObject({ locked: false, attempts: 0 });
    vi.useRealTimers();
  });

  it('5. gerencia credenciais: cria, atualiza, lista e remove', () => {
    expect(getStatus().locked).toBe(false);

    const created = saveEntry({
      title: 'GitHub',
      username: 'chronos-atalante',
      password: 's3nh@-forte',
      domain: 'GitHub.com',
      notes: 'conta pessoal',
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: 'GitHub',
      username: 'chronos-atalante',
      domain: 'github.com',
      notes: 'conta pessoal',
    });
    const id = created[0]?.id ?? '';
    const createdAt = created[0]?.createdAt ?? 0;
    expect(id).not.toBe('');

    const updated = saveEntry({
      id,
      title: 'GitHub Pessoal',
      username: 'chronos',
      password: 'outra-senha',
      domain: 'github.com',
      notes: '',
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id, title: 'GitHub Pessoal', createdAt });

    expect(listEntries().some((entry) => entry.id === id)).toBe(true);

    const removed = removeEntry(id);
    expect(removed).toHaveLength(0);
    expect(listEntries()).toHaveLength(0);
  });

  it('6. rejeita entrada inválida e operação com cofre bloqueado', () => {
    expect(() =>
      saveEntry({ title: '  ', username: '', password: '', domain: '', notes: '' }),
    ).toThrow(currentMessages().errors.invalidTitle);
    expect(() =>
      saveEntry({ title: 'X', username: 'com espaço', password: '', domain: '', notes: '' }),
    ).toThrow(currentMessages().errors.invalidUsername);
    expect(() =>
      saveEntry({ title: 'X', username: '', password: '', domain: 'não é domínio', notes: '' }),
    ).toThrow(currentMessages().errors.invalidDomain);
    expect(() => removeEntry('id-falso')).toThrow(currentMessages().errors.invalidId);

    lock();
    expect(() => listEntries()).toThrow(currentMessages().errors.vaultLocked);
  });

  it('7. desbloqueia com a senha mestra', async () => {
    const withMaster = await unlock({ credential: MASTER, kind: 'master' });
    expect(withMaster.ok).toBe(true);
  });

  it('8. redefine o PIN pela frase de recuperação (único uso da frase)', async () => {
    lock();
    resetAttempts();

    const badPin = await resetPin({ phrase: PHRASE, newPin: '123' });
    expect(badPin.ok).toBe(false);
    expect(badPin.error).toBe(currentMessages().errors.invalidPin);

    const wrongPhrase = await resetPin({ phrase: WRONG_PHRASE, newPin: NEW_PIN });
    expect(wrongPhrase.ok).toBe(false);
    expect(wrongPhrase.error).toBe(currentMessages().errors.wrongRecovery);
    expect(wrongPhrase.status.attempts).toBe(1);

    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow + 11_000);

    const reset = await resetPin({ phrase: PHRASE, newPin: NEW_PIN });
    expect(reset.ok).toBe(true);
    expect(reset.status).toMatchObject({ locked: false, attempts: 0 });

    lock();
    const oldPin = await unlock({ credential: PIN, kind: 'pin' });
    expect(oldPin.ok).toBe(false);
    expect(oldPin.error).toBe(currentMessages().errors.wrongPin);

    vi.setSystemTime(realNow + 22_000);
    const newPin = await unlock({ credential: NEW_PIN, kind: 'pin' });
    expect(newPin.ok).toBe(true);
    vi.useRealTimers();
  });
});
