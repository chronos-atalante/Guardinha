import fs from 'fs-extra';
import path from 'node:path';
import {
  openManifest,
  packVaultContainer,
  sealManifest,
  unpackVaultContainer,
} from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import { isValidKdfParams } from '@zero/main/crypto';
import {
  containerFile,
  entriesDir,
  legacyVaultDir,
  vaultDir,
  xdgVaultDir,
} from '@zero/main/layout';
import { isVaultDestroyed } from '@zero/main/erasure-state';
import {
  ensureVaultStructure,
  isPermissionError,
  isVaultDirUnavailable,
  migrateHiddenLayout,
  vaultPath,
} from '@zero/main/structure';
import { listEntryIds } from '@zero/main/entries-store';
import type { VaultContainerData, VaultKdfParams } from '@zero/main/container';
import type { SaltedPayload } from '@zero/main/crypto';

/**
 * Container do cofre (`vault.zkv`): chaves embrulhadas, trava exponencial e
 * manifesto cifrado, mais as migrações dos formatos anteriores para `/var/lib`.
 * Os arquivos das credenciais ficam em `entries-store.ts` e a estrutura de
 * pastas em `structure.ts`; aqui é só o arquivo do container.
 */

export interface PersistedAuthState {
  attempts: number;
  lockUntil: number | null;
  /** Falhas só da senha mestra (campo da v4); PIN não soma aqui. */
  attemptsMaster: number;
  /** Limite estrito da senha mestra; `0` = autodestruição desligada. */
  nukeLimit: number;
}

/** Estado neutro: cofre ausente ou ilegível não pode parecer "tentou 0 vezes". */
const EMPTY_AUTH_STATE: PersistedAuthState = {
  attempts: 0,
  lockUntil: null,
  attemptsMaster: 0,
  nukeLimit: 0,
};

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

export { ensureVaultStructure, isVaultDirUnavailable, vaultPath };

// ---------- Migração dos formatos anteriores para /var/lib ----------

type MigrationResult = 'none' | 'ok' | 'invalid';

function asPayload(value: unknown): SaltedPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.salt !== 'string' ||
    record.salt === '' ||
    typeof record.iv !== 'string' ||
    typeof record.tag !== 'string' ||
    typeof record.encryptedData !== 'string'
  ) {
    return null;
  }
  return {
    salt: record.salt,
    iv: record.iv,
    tag: record.tag,
    encryptedData: record.encryptedData,
  };
}

function readLegacyAuthState(): PersistedAuthState {
  try {
    const raw = fs.readJsonSync(path.join(legacyVaultDir(), 'auth-state.json')) as {
      attempts?: unknown;
      lockUntil?: unknown;
    };
    return {
      attempts: typeof raw.attempts === 'number' ? raw.attempts : 0,
      lockUntil: typeof raw.lockUntil === 'number' ? raw.lockUntil : null,
      // o JSON legado não conhecia os campos da v4
      attemptsMaster: 0,
      nukeLimit: 0,
    };
  } catch {
    return EMPTY_AUTH_STATE;
  }
}

function parseLegacyEnvelope(raw: unknown): VaultContainerData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const envelope = raw as Record<string, unknown>;
  if (typeof envelope.createdAt !== 'number') return null;
  if (typeof envelope.kdf !== 'object' || envelope.kdf === null) return null;
  const kdf = envelope.kdf as Record<string, unknown>;
  if (
    kdf.algo !== 'argon2id' ||
    typeof kdf.memoryKiB !== 'number' ||
    typeof kdf.iterations !== 'number' ||
    typeof kdf.parallelism !== 'number'
  ) {
    return null;
  }
  const params: VaultKdfParams = {
    algo: 'argon2id',
    memoryKiB: kdf.memoryKiB,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
  };
  if (!isValidKdfParams(params)) return null;
  if (typeof envelope.methods !== 'object' || envelope.methods === null) return null;
  const methodsRaw = envelope.methods as Record<string, unknown>;

  const methods: VaultContainerData['methods'] = {};
  for (const name of ['master', 'pin', 'recovery'] as const) {
    const value = methodsRaw[name];
    if (value === undefined) continue;
    if (typeof value !== 'object' || value === null) return null;
    const method = value as Record<string, unknown>;
    const payload = asPayload(method.wrapped);
    if (payload === null || typeof method.salt !== 'string' || method.salt === '') return null;
    // o JSON legado tinha um KDF global para todos os métodos
    methods[name] = { kdf: params, kdfSalt: method.salt, payload };
  }
  if (methods.master === undefined && methods.pin === undefined) return null;

  const auth = readLegacyAuthState();
  return {
    createdAt: envelope.createdAt,
    kdf: params,
    attempts: auth.attempts,
    lockUntil: auth.lockUntil,
    // campos da v4: o JSON legado nunca os teve, então a autodestruição por
    // contagem nasce desligada num cofre migrado
    attemptsMaster: 0,
    nukeLimit: 0,
    methods,
    manifest: null,
  };
}

/** Move o cofre binário intermediário (`$XDG_DATA_HOME/…`) para `/var/lib`. */
function moveBinaryVault(): boolean {
  const source = xdgVaultDir();
  if (path.resolve(source) === path.resolve(vaultDir())) return false;
  const sourceContainer = path.join(source, 'vault.zkv');
  if (!fs.existsSync(sourceContainer)) return false;

  ensureVaultStructure();
  // entradas primeiro; o container é o "commit" da migração
  const sourceEntries = path.join(source, 'entries');
  if (fs.existsSync(sourceEntries)) {
    for (const file of fs.readdirSync(sourceEntries)) {
      const target = path.join(entriesDir(), file);
      if (!fs.existsSync(target)) fs.moveSync(path.join(sourceEntries, file), target);
    }
  }
  const tmp = `${containerFile()}.tmp`;
  fs.copySync(sourceContainer, tmp);
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, containerFile());
  fs.removeSync(source);
  try {
    fs.rmdirSync(path.dirname(source)); // só se a pasta `guardinha` ficou vazia
  } catch {
    // sobraram arquivos desconhecidos; não apagamos nada que não seja nosso
  }
  return true;
}

/**
 * Converte `~/.guardinha-vault` (JSON legado) para o formato binário em `/var/lib`.
 * Convergente: pode rodar de novo após uma interrupção no meio.
 */
function migrateJsonLegacy(): MigrationResult {
  const legacy = legacyVaultDir();
  const legacyEnvelope = path.join(legacy, 'envelope.json');
  if (!fs.existsSync(legacyEnvelope)) return 'none';

  let raw: unknown;
  try {
    raw = fs.readJsonSync(legacyEnvelope);
  } catch {
    return 'invalid';
  }
  const data = parseLegacyEnvelope(raw);
  if (data === null) return 'invalid';

  ensureVaultStructure();
  const legacyEntries = path.join(legacy, 'entries');
  if (fs.existsSync(legacyEntries)) {
    for (const file of fs.readdirSync(legacyEntries)) {
      if (!file.endsWith('.enc')) continue;
      const target = path.join(entriesDir(), file);
      if (!fs.existsSync(target)) {
        fs.moveSync(path.join(legacyEntries, file), target);
      }
    }
  }
  writeVaultContainer(data);

  fs.removeSync(legacyEnvelope);
  fs.removeSync(path.join(legacy, 'auth-state.json'));
  fs.removeSync(legacyEntries);
  try {
    fs.rmdirSync(legacy);
  } catch {
    // sobraram arquivos desconhecidos; não apagamos nada que não seja nosso
  }
  return 'ok';
}

/**
 * Traz qualquer cofre anterior para `/var/lib/.guardinha/.vault`: primeiro o
 * binário do XDG, depois o JSON de `~/.guardinha-vault`. Sem permissão de escrita
 * (pacote instalado sem sudo) desiste em silêncio; a gravação seguinte
 * localiza o erro de permissão.
 */
function migrateLegacyVault(): MigrationResult {
  const override = process.env.GUARDINHA_VAULT_DIR;
  if (override !== undefined && override !== '') return 'none';
  if (fs.existsSync(containerFile())) return 'none';
  try {
    if (moveBinaryVault()) return 'ok';
    return migrateJsonLegacy();
  } catch (error) {
    if (isPermissionError(error)) return 'none';
    throw error;
  }
}

// ---------- Container do cofre (vault.zkv) ----------

export function vaultExists(): boolean {
  migrateHiddenLayout();
  const migration = migrateLegacyVault();
  if (fs.existsSync(containerFile())) return true;
  // cofre legado existe mas ilegível: existe (não se oferece para recriar)
  return migration === 'invalid';
}

export function readVaultContainer(): VaultContainerData | null {
  const migration = migrateLegacyVault();
  if (!fs.existsSync(containerFile())) {
    if (migration === 'invalid') throw tampered();
    return null;
  }
  let raw: Buffer;
  try {
    raw = fs.readFileSync(containerFile());
  } catch {
    throw tampered();
  }
  const data = unpackVaultContainer(raw);
  if (data === null) throw tampered();
  return data;
}

export function writeVaultContainer(data: VaultContainerData): void {
  // Depois de um Cryptographic Erase o cofre não volta a existir por conta
  // própria: um `writeAuthState`, um `initManifest` ou qualquer `VaultContainerData`
  // ainda em memória parariam aqui, em vez de recriar um `vault.zkv` sem chave
  // e transformar "cofre destruído" em "cofre adulterado". Só `createVault`
  // libera de novo, e só porque o usuário pediu um cofre novo.
  if (isVaultDestroyed()) return;
  ensureVaultStructure();
  const buffer = packVaultContainer(data);
  const tmp = `${containerFile()}.tmp`;
  fs.writeFileSync(tmp, buffer, { mode: 0o600 });
  fs.renameSync(tmp, containerFile());
  fs.chmodSync(containerFile(), 0o600);
}

// ---------- Estado da trava exponencial (dentro do container) ----------

export function readAuthState(): PersistedAuthState {
  try {
    const data = readVaultContainer();
    if (data === null) return EMPTY_AUTH_STATE;
    return {
      attempts: data.attempts,
      lockUntil: data.lockUntil,
      attemptsMaster: data.attemptsMaster,
      nukeLimit: data.nukeLimit,
    };
  } catch {
    // getStatus nunca lança; a adulteração aparece nas operações de dados
    return EMPTY_AUTH_STATE;
  }
}

export function writeAuthState(state: PersistedAuthState): void {
  const data = readVaultContainer();
  if (data === null) return;
  data.attempts = state.attempts;
  data.lockUntil = state.lockUntil;
  data.attemptsMaster = state.attemptsMaster;
  data.nukeLimit = state.nukeLimit;
  writeVaultContainer(data);
}

// ---------- Manifesto de integridade (cifrado com a chave do cofre) ----------

/** Sella o manifesto com os arquivos atuais (só na primeira vez). */
export function initManifest(vaultKey: Buffer): void {
  const data = readVaultContainer();
  if (data === null) return;
  if (data.manifest !== null) return;
  data.manifest = sealManifest(vaultKey, listEntryIds());
  writeVaultContainer(data);
}

/** Reescreve o manifesto a partir do diretório (após salvar/remover). */
export function updateManifest(vaultKey: Buffer): void {
  const data = readVaultContainer();
  if (data === null) return;
  data.manifest = sealManifest(vaultKey, listEntryIds());
  writeVaultContainer(data);
}

/**
 * Confere manifesto × diretório: arquivo removido/injetado de fora do app
 * derruba a lista com o erro único de adulteração (fail-closed).
 */
export function verifyManifest(vaultKey: Buffer): void {
  initManifest(vaultKey);
  const data = readVaultContainer();
  if (data === null) throw new Error(currentMessages().errors.vaultMissing);
  if (data.manifest === null) throw tampered();

  let expected: string[];
  try {
    expected = openManifest(vaultKey, data.manifest);
  } catch {
    throw tampered();
  }
  const actual = new Set(listEntryIds());
  if (expected.length !== actual.size || expected.some((id) => !actual.has(id))) {
    throw tampered();
  }
}
