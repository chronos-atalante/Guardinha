// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { currentMessages } from '@zero/main/i18n';
import { eraseVault } from '@zero/main/erase';
import { clearDestroyedFlag } from '@zero/main/erasure-state';
import { cleanStaleTempFiles, writeEntryPayload } from '@zero/main/entries-store';
import { saveEntry } from '@zero/main/entries';
import { containerFile, entriesDir, vaultDir } from '@zero/main/layout';
import {
  readAuthState,
  readVaultContainer,
  writeAuthState,
  writeVaultContainer,
} from '@zero/main/storage';
import { ensureVaultStructure } from '@zero/main/structure';
import { vaultSession } from '@zero/main/session';
import { createVault, panicDestroy } from '@zero/main/vault';
import type { VaultContainerData } from '@zero/main/container';

const MASTER = 'senha-mestra-guardinha24';
const PIN = '49201733';
/** Frase de 12 palavras escrita pelo usuário (o app não gera frase alguma). */
const PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

/** Payload qualquer: o erase apaga bytes, não decifra nada. */
const DUMMY_PAYLOAD = {
  salt: 'aa'.repeat(16),
  iv: 'bb'.repeat(16),
  tag: 'cc'.repeat(16),
  encryptedData: 'dd',
};

/**
 * Cofre semeado sem passar pelo Argon2id: o Cryptographic Erase não depende de
 * a credencial ser válida, e um cofre real por teste custaria três derivações
 * (cerca de 45 s cada). Só o teste de integração, no fim do arquivo, cria um
 * cofre de verdade.
 */
function seedVault(entryIds: string[]): void {
  fs.rmSync(vaultDir(), { recursive: true, force: true });
  // um erase anterior no mesmo processo deixou o cofre marcado como destruído,
  // e é a guarda de `writeVaultContainer` recusando; aqui o teste recomeça
  clearDestroyedFlag();
  ensureVaultStructure();
  const cheap = { algo: 'argon2id', memoryKiB: 16_384, iterations: 1, parallelism: 1 } as const;
  const container: VaultContainerData = {
    createdAt: 1_767_268_800_000,
    kdf: cheap,
    attempts: 0,
    lockUntil: null,
    attemptsMaster: 0,
    nukeLimit: 0,
    methods: {
      pin: { kdf: cheap, kdfSalt: '11'.repeat(16), payload: DUMMY_PAYLOAD },
      master: { kdf: cheap, kdfSalt: '22'.repeat(16), payload: DUMMY_PAYLOAD },
    },
    manifest: null,
  };
  writeVaultContainer(container);
  for (const id of entryIds) writeEntryPayload(id, DUMMY_PAYLOAD);
}

afterEach(() => {
  vaultSession().wipe();
  fs.rmSync(vaultDir(), { recursive: true, force: true });
});

describe('Cryptographic Erase (eraseVault)', () => {
  it('apaga o container, as entradas e a pasta .entries', () => {
    seedVault(['aaaaaaaa-1111-4111-8111-111111111111']);
    expect(fs.existsSync(containerFile())).toBe(true);
    expect(fs.existsSync(entriesDir())).toBe(true);

    const result = eraseVault();

    expect(result.failed).toBe(0);
    expect(result.shredded).toBeGreaterThanOrEqual(3); // container + .zke + a pasta
    expect(fs.existsSync(containerFile())).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
  });

  it('não deixa nenhum arquivo legível na raiz do cofre', () => {
    seedVault(['aaaaaaaa-2222-4222-8222-222222222222']);

    eraseVault();

    const remaining = fs.existsSync(vaultDir()) ? fs.readdirSync(vaultDir()) : [];
    expect(remaining).toEqual([]);
  });

  it('apaga também o .tmp do container, que é uma cópia dos blobs de chave', () => {
    seedVault(['aaaaaaaa-3333-4333-8333-333333333333']);
    const orphan = `${containerFile()}.tmp`;
    fs.copyFileSync(containerFile(), orphan);
    expect(fs.existsSync(orphan)).toBe(true);

    eraseVault();

    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('é idempotente: chamar de novo devolve zero e não lança', () => {
    seedVault(['aaaaaaaa-4444-4444-8444-444444444444']);
    eraseVault();

    expect(eraseVault()).toEqual({ shredded: 0, failed: 0 });
  });

  it('não segue symlink: um alvo de fora continua intacto', () => {
    seedVault([]);
    const outside = path.join(vaultDir(), '..', 'alvo-de-fora.txt');
    fs.symlinkSync(outside, path.join(entriesDir(), 'plantado.zke'));
    fs.writeFileSync(outside, 'conteudo que nao é do cofre', { mode: 0o600 });

    eraseVault();

    expect(fs.readFileSync(outside, 'utf8')).toBe('conteudo que nao é do cofre');
    fs.rmSync(outside, { force: true });
  });

  it('conta o que resistiu, sem abortar por causa disso', () => {
    seedVault([]);
    // diretório com nome de arquivo: o shred aborta e devolve false
    fs.mkdirSync(path.join(entriesDir(), 'zko'));

    const result = eraseVault();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(containerFile())).toBe(false); // o resto foi apagado
  });
});

describe('o container não ressuscita depois do erase', () => {
  it('writeAuthState posterior não recria o vault.zkv', () => {
    seedVault(['bbbbbbbb-1111-4111-8111-111111111111']);
    eraseVault();
    expect(fs.existsSync(containerFile())).toBe(false);

    // `writeAuthState` é read-modify-write do container; sem a guarda ele leria
    // `null` e pararia, e isso precisa ser verdade por desenho e não por sorte
    writeAuthState({ attempts: 9, lockUntil: Date.now() + 1000, attemptsMaster: 3, nukeLimit: 50 });

    expect(fs.existsSync(containerFile())).toBe(false);
    expect(readVaultContainer()).toBeNull();
    expect(readAuthState()).toMatchObject({ attempts: 0, attemptsMaster: 0, nukeLimit: 0 });
  });

  it('initManifest posterior não recria o vault.zkv sem chave', async () => {
    seedVault(['bbbbbbbb-2222-4222-8222-222222222222']);
    const { initManifest } = await import('@zero/main/storage');
    const key = Buffer.alloc(32, 3);

    eraseVault();
    initManifest(key);

    expect(fs.existsSync(containerFile())).toBe(false);
  });
});

describe('varredura de temporários órfãos', () => {
  it('apaga .tmp velho e preserva .tmp recente', () => {
    seedVault(['dddddddd-1111-4111-8111-111111111111']);
    const old = path.join(entriesDir(), 'velho.zke.tmp');
    const fresh = path.join(entriesDir(), 'novo.zke.tmp');
    fs.writeFileSync(old, 'conteudo', { mode: 0o600 });
    fs.writeFileSync(fresh, 'conteudo', { mode: 0o600 });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(old, twoHoursAgo, twoHoursAgo);

    const result = cleanStaleTempFiles(60_000);

    expect(result).toEqual({ removed: 1, kept: 1 });
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('não toca em arquivo que não é temporário', () => {
    seedVault([]);
    const notVault = path.join(vaultDir(), 'settings.json');
    fs.writeFileSync(notVault, '{"language":"pt-BR"}', { mode: 0o600 });

    expect(cleanStaleTempFiles(60_000)).toEqual({ removed: 0, kept: 0 });
    expect(fs.existsSync(notVault)).toBe(true);
  });
});

describe('mensagem de cofre destruído', () => {
  it('existe e não ecoa nada do conteúdo do cofre', () => {
    const m = currentMessages();
    expect(m.errors.vaultDestroyed).toBeTruthy();
    expect(m.errors.vaultDestroyed).not.toContain(PIN);
    expect(m.errors.vaultDestroyed).not.toContain(MASTER);
  });
});

describe('panicDestroy com cofre de verdade (integração)', () => {
  // `createVault` faz três derivações Argon2id (128 + 256 + 128 MB): é o teste
  // mais caro da suíte e o que garante o caminho completo, do container real
  // com chave embrulhada até o arquivo sumir do disco.
  it('zera a chave da RAM, apaga o disco e devolve o status de cofre novo', async () => {
    fs.rmSync(vaultDir(), { recursive: true, force: true });
    const created = await createVault({
      masterPassword: MASTER,
      pin: PIN,
      recoveryPhrase: PHRASE,
    });
    expect(created.ok).toBe(true);
    saveEntry({
      title: 'Banco do Teste',
      username: 'tester',
      password: 'senha-de-teste-guardinha',
      domain: 'banco.teste',
      notes: '',
    });
    expect(fs.existsSync(containerFile())).toBe(true);

    // a referência é pega antes do wipe para conferir byte a byte depois
    const keyRef = vaultSession().keyOrNull();
    expect(keyRef).not.toBeNull();

    const status = panicDestroy();

    expect(fs.existsSync(containerFile())).toBe(false);
    expect(fs.existsSync(entriesDir())).toBe(false);
    expect(vaultSession().keyOrNull()).toBeNull();
    expect(vaultSession().isUnlocked()).toBe(false);
    // o Buffer realmente zerado, não só sem referência
    expect(keyRef?.every((byte) => byte === 0)).toBe(true);
    expect(status).toMatchObject({ exists: false, locked: true });
  });
});
