// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packEntryPayload, packVaultContainer } from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import {
  deleteEntry,
  ensureVaultStructure,
  listEntryIds,
  readEntryPayload,
  readVaultContainer,
  vaultExists,
  writeEntryPayload,
} from '@zero/main/storage';
import type { VaultContainerData } from '@zero/main/container';

const LEGACY_ENVELOPE = {
  version: 1,
  createdAt: 1_760_000_000_000,
  kdf: { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 },
  methods: {
    master: {
      salt: 'aa'.repeat(16),
      wrapped: {
        salt: 'bb'.repeat(16),
        iv: 'cc'.repeat(16),
        tag: 'dd'.repeat(16),
        encryptedData: 'ee',
      },
    },
    pin: {
      salt: '11'.repeat(16),
      wrapped: {
        salt: '22'.repeat(16),
        iv: '33'.repeat(16),
        tag: '44'.repeat(16),
        encryptedData: '55',
      },
    },
  },
};

const LEGACY_ENTRY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LEGACY_ENTRY_PAYLOAD = {
  salt: 'ff'.repeat(16),
  iv: '00'.repeat(16),
  tag: '99'.repeat(16),
  encryptedData: 'ab',
};

interface SavedEnv {
  HOME: string | undefined;
  XDG_DATA_HOME: string | undefined;
  GUARDINHA_VAULT_DIR: string | undefined;
  GUARDINHA_VAR_LIB: string | undefined;
}

let savedEnv: SavedEnv;
const tempRoots: string[] = [];

function freshEnv(): { home: string; varLib: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-legacy-home-'));
  const varLib = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-legacy-var-'));
  tempRoots.push(home, varLib);
  process.env.HOME = home;
  process.env.GUARDINHA_VAR_LIB = varLib;
  delete process.env.XDG_DATA_HOME;
  delete process.env.GUARDINHA_VAULT_DIR;
  return { home, varLib };
}

function targetVaultDir(): string {
  return path.join(process.env.GUARDINHA_VAR_LIB ?? '', '.guardinha', '.vault');
}

beforeAll(() => {
  savedEnv = {
    HOME: process.env.HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    GUARDINHA_VAULT_DIR: process.env.GUARDINHA_VAULT_DIR,
    GUARDINHA_VAR_LIB: process.env.GUARDINHA_VAR_LIB,
  };
});

afterAll(() => {
  process.env.HOME = savedEnv.HOME;
  if (savedEnv.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = savedEnv.XDG_DATA_HOME;
  if (savedEnv.GUARDINHA_VAULT_DIR === undefined) delete process.env.GUARDINHA_VAULT_DIR;
  else process.env.GUARDINHA_VAULT_DIR = savedEnv.GUARDINHA_VAULT_DIR;
  if (savedEnv.GUARDINHA_VAR_LIB === undefined) delete process.env.GUARDINHA_VAR_LIB;
  else process.env.GUARDINHA_VAR_LIB = savedEnv.GUARDINHA_VAR_LIB;
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('migração do legado JSON (~/.guardinha-vault)', () => {
  beforeAll(() => {
    const { home } = freshEnv();
    const legacyDir = path.join(home, '.guardinha-vault');
    const legacyEntries = path.join(legacyDir, 'entries');
    fs.mkdirSync(legacyEntries, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'envelope.json'), JSON.stringify(LEGACY_ENVELOPE));
    fs.writeFileSync(
      path.join(legacyDir, 'auth-state.json'),
      JSON.stringify({ attempts: 3, lockUntil: 1_760_000_060_000 }),
    );
    fs.writeFileSync(
      path.join(legacyEntries, `${LEGACY_ENTRY_ID}.enc`),
      JSON.stringify(LEGACY_ENTRY_PAYLOAD),
    );
  });

  it('move o cofre para $GUARDINHA_VAR_LIB/.guardinha/.vault em binário', () => {
    expect(vaultExists()).toBe(true);
    const containerPath = path.join(targetVaultDir(), 'vault.zkv');
    expect(fs.existsSync(containerPath)).toBe(true);

    const container = readVaultContainer();
    expect(container).not.toBeNull();
    expect(container?.createdAt).toBe(LEGACY_ENVELOPE.createdAt);
    expect(container?.kdf).toEqual(LEGACY_ENVELOPE.kdf);
    expect(container?.methods.master?.kdfSalt).toBe('aa'.repeat(16));
    // o JSON legado tinha um KDF único: ele vira o KDF de cada método
    expect(container?.methods.master?.kdf).toEqual(LEGACY_ENVELOPE.kdf);
    expect(container?.methods.pin?.kdf).toEqual(LEGACY_ENVELOPE.kdf);
    expect(container?.methods.pin?.payload.encryptedData).toBe('55');
    // estado da trava exponencial veio do auth-state.json legado
    expect(container?.attempts).toBe(3);
    expect(container?.lockUntil).toBe(1_760_000_060_000);
    // manifesto sella na primeira destravada (migração não tem a chave)
    expect(container?.manifest).toBeNull();
  });

  it('remove os arquivos legados após a migração', () => {
    const legacyDir = path.join(process.env.HOME ?? '', '.guardinha-vault');
    expect(fs.existsSync(path.join(legacyDir, 'envelope.json'))).toBe(false);
    expect(fs.existsSync(path.join(legacyDir, 'auth-state.json'))).toBe(false);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it('converte o payload legado JSON para .zke binário na primeira leitura', () => {
    expect(listEntryIds()).toContain(LEGACY_ENTRY_ID);
    const payload = readEntryPayload(LEGACY_ENTRY_ID);
    expect(payload).toEqual(LEGACY_ENTRY_PAYLOAD);
    const entriesDir = path.join(targetVaultDir(), '.entries');
    expect(fs.existsSync(path.join(entriesDir, `${LEGACY_ENTRY_ID}.zke`))).toBe(true);
    expect(fs.existsSync(path.join(entriesDir, `${LEGACY_ENTRY_ID}.enc`))).toBe(false);
  });

  it('usa permissões restritas (0700 nas pastas, 0600 nos arquivos)', () => {
    ensureVaultStructure();
    expect(fs.statSync(targetVaultDir()).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(targetVaultDir(), '.entries')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(targetVaultDir(), 'vault.zkv')).mode & 0o777).toBe(0o600);
    expect(
      fs.statSync(path.join(targetVaultDir(), '.entries', `${LEGACY_ENTRY_ID}.zke`)).mode & 0o777,
    ).toBe(0o600);
  });

  it('é idempotente (rodar de novo não altera o container)', () => {
    const containerPath = path.join(targetVaultDir(), 'vault.zkv');
    const before = fs.readFileSync(containerPath);
    expect(vaultExists()).toBe(true);
    expect(readVaultContainer()).not.toBeNull();
    expect(fs.readFileSync(containerPath).equals(before)).toBe(true);
  });
});

describe('migração do intermediário XDG (~/.local/share)', () => {
  const INTERMEDIATE_ENTRY_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  let sourceContainer: Buffer;

  beforeAll(() => {
    const { home } = freshEnv();
    const source = path.join(home, '.local', 'share', 'guardinha', 'vault');
    const sourceEntries = path.join(source, 'entries');
    fs.mkdirSync(sourceEntries, { recursive: true });
    const data: VaultContainerData = {
      createdAt: 1_770_000_000_000,
      kdf: { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 },
      attempts: 1,
      lockUntil: null,
      methods: {
        master: {
          kdf: { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 },
          kdfSalt: 'ab'.repeat(16),
          payload: {
            salt: 'cd'.repeat(16),
            iv: 'ef'.repeat(16),
            tag: '12'.repeat(16),
            encryptedData: '34',
          },
        },
      },
      manifest: null,
    };
    sourceContainer = packVaultContainer(data);
    fs.writeFileSync(path.join(source, 'vault.zkv'), sourceContainer, { mode: 0o600 });
    fs.writeFileSync(
      path.join(sourceEntries, `${INTERMEDIATE_ENTRY_ID}.zke`),
      packEntryPayload(LEGACY_ENTRY_PAYLOAD),
      { mode: 0o600 },
    );
  });

  it('move o binário do XDG para /var/lib sem reconverter', () => {
    expect(vaultExists()).toBe(true);
    const moved = fs.readFileSync(path.join(targetVaultDir(), 'vault.zkv'));
    expect(moved.equals(sourceContainer)).toBe(true);
    expect(listEntryIds()).toContain(INTERMEDIATE_ENTRY_ID);
    const source = path.join(process.env.HOME ?? '', '.local', 'share', 'guardinha');
    expect(fs.existsSync(source)).toBe(false);
  });

  it('é idempotente depois da mudança', () => {
    const before = fs.readFileSync(path.join(targetVaultDir(), 'vault.zkv'));
    expect(vaultExists()).toBe(true);
    expect(readVaultContainer()).not.toBeNull();
    expect(fs.readFileSync(path.join(targetVaultDir(), 'vault.zkv')).equals(before)).toBe(true);
  });
});

describe('layout oculto (entries → .entries)', () => {
  const ENTRY_ID = 'dddddddd-eeee-4fff-8000-111111111111';

  beforeAll(() => {
    freshEnv();
    const oldEntries = path.join(targetVaultDir(), 'entries');
    fs.mkdirSync(oldEntries, { recursive: true });
    fs.writeFileSync(
      path.join(oldEntries, `${ENTRY_ID}.zke`),
      packEntryPayload(LEGACY_ENTRY_PAYLOAD),
      { mode: 0o600 },
    );
  });

  it('renomeia para .entries na primeira leitura (pasta fica oculta)', () => {
    expect(listEntryIds()).toContain(ENTRY_ID);
    expect(fs.existsSync(path.join(targetVaultDir(), '.entries'))).toBe(true);
    expect(fs.existsSync(path.join(targetVaultDir(), 'entries'))).toBe(false);
    expect(readEntryPayload(ENTRY_ID)).toEqual(LEGACY_ENTRY_PAYLOAD);
  });

  it('é idempotente (segunda leitura não mexe mais)', () => {
    expect(listEntryIds()).toEqual([ENTRY_ID]);
    expect(fs.existsSync(path.join(targetVaultDir(), '.entries'))).toBe(true);
  });
});

describe('path traversal bloqueado na camada de storage (CVE-2026-21589)', () => {
  it('recusa id com separador, nulo ou vazio antes de montar o caminho', () => {
    expect(() => readEntryPayload('../../vault.zkv')).toThrow(currentMessages().errors.invalidId);
    expect(() => writeEntryPayload('..\\..\\fora', LEGACY_ENTRY_PAYLOAD)).toThrow(
      currentMessages().errors.invalidId,
    );
    expect(() => deleteEntry('/etc/passwd')).toThrow(currentMessages().errors.invalidId);
    expect(() => deleteEntry('')).toThrow(currentMessages().errors.invalidId);
    expect(() => deleteEntry(String.fromCharCode(0))).toThrow(currentMessages().errors.invalidId);
  });
});
