import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  isLegacyEntryPayload,
  openManifest,
  packEntryPayload,
  packVaultContainer,
  sealManifest,
  unpackEntryPayload,
  unpackVaultContainer,
} from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import { isValidKdfParams, randomBytes } from '@zero/main/crypto';
import type { VaultContainerData, VaultKdfParams } from '@zero/main/container';
import type { SaltedPayload } from '@zero/main/crypto';
import type { Credential } from '@zero/types';

function xdgDir(envVar: string, fallback: string): string {
  const value = process.env[envVar];
  if (value !== undefined && value !== '') return value;
  return path.join(os.homedir(), fallback);
}

/**
 * Raiz do cofre: `/var/lib/.guardinha/.vault`, pastas ocultas por padrão
 * (fora de `~/`, sobrevive à limpeza da pasta do usuário). `GUARDINHA_VAR_LIB`
 * redireciona a raiz e `GUARDINHA_VAULT_DIR` sobrepõe o caminho completo (testes/dev).
 */
function vaultDir(): string {
  const override = process.env.GUARDINHA_VAULT_DIR;
  if (override !== undefined && override !== '') return override;
  const varLib = process.env.GUARDINHA_VAR_LIB;
  const base = varLib !== undefined && varLib !== '' ? varLib : '/var/lib';
  return path.join(base, '.guardinha', '.vault');
}

/** Cofre intermediário anterior em `$XDG_DATA_HOME/guardinha/vault`. */
function xdgVaultDir(): string {
  return path.join(xdgDir('XDG_DATA_HOME', path.join('.local', 'share')), 'guardinha', 'vault');
}

function legacyVaultDir(): string {
  return path.join(os.homedir(), '.guardinha-vault');
}

function entriesDir(): string {
  return path.join(vaultDir(), '.entries');
}

/**
 * Layout oculto: `entries/` (visível) vira `.entries/`. O rename é barato e
 * idempotente; roda antes de qualquer leitura/escrita das credenciais.
 */
function migrateHiddenLayout(): void {
  const oldDir = path.join(vaultDir(), 'entries');
  const newDir = path.join(vaultDir(), '.entries');
  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.renameSync(oldDir, newDir);
}

function containerFile(): string {
  return path.join(vaultDir(), 'vault.zkv');
}

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

export interface PersistedAuthState {
  attempts: number;
  lockUntil: number | null;
}

export interface StoredCredential extends Omit<Credential, 'password'> {
  payload: SaltedPayload;
}

// ---------- Estrutura e localização ----------

/** Garante a pasta do cofre em `/var/lib` com permissões restritas. */
export function ensureVaultStructure(): void {
  try {
    migrateHiddenLayout();
    fs.ensureDirSync(vaultDir(), { mode: 0o700 });
    fs.ensureDirSync(entriesDir(), { mode: 0o700 });
    fs.chmodSync(vaultDir(), 0o700);
    fs.chmodSync(entriesDir(), 0o700);
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(currentMessages().errors.vaultDirUnavailable, { cause: error });
    }
    throw error;
  }
}

/** Caminho efetivo do cofre (para mensagens e diagnóstico). */
export function vaultPath(): string {
  return vaultDir();
}

/** true se o erro é falta de permissão para criar a raiz do cofre em /var/lib. */
export function isVaultDirUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === currentMessages().errors.vaultDirUnavailable;
}

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
    };
  } catch {
    return { attempts: 0, lockUntil: null };
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
    if (data === null) return { attempts: 0, lockUntil: null };
    return { attempts: data.attempts, lockUntil: data.lockUntil };
  } catch {
    // getStatus nunca lança; a adulteração aparece nas operações de dados
    return { attempts: 0, lockUntil: null };
  }
}

export function writeAuthState(state: PersistedAuthState): void {
  const data = readVaultContainer();
  if (data === null) return;
  data.attempts = state.attempts;
  data.lockUntil = state.lockUntil;
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

// ---------- Entradas individuais (arquivos .zke cifrados) ----------

/**
 * Segunda camada contra path traversal (classe do CVE-2026-21589): o caminho
 * do arquivo só é montado a partir de id sem separador nem byte nulo, então
 * nenhum chamador consegue escapar de `.entries/` com `../`.
 */
function assertSafeEntryId(id: string): void {
  if (id === '' || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error(currentMessages().errors.invalidId);
  }
}

export function createVaultKey(): Buffer {
  return randomBytes(32);
}

export function listEntryIds(): string[] {
  ensureVaultStructure();
  const ids = new Set<string>();
  for (const file of fs.readdirSync(entriesDir())) {
    if (file.endsWith('.zke')) ids.add(file.slice(0, -4));
    else if (file.endsWith('.enc')) ids.add(file.slice(0, -4));
  }
  return [...ids];
}

function entryFile(id: string): string {
  const current = path.join(entriesDir(), `${id}.zke`);
  if (fs.existsSync(current)) return current;
  return path.join(entriesDir(), `${id}.enc`);
}

export function readEntryPayload(id: string): SaltedPayload {
  assertSafeEntryId(id);
  migrateHiddenLayout();
  const file = entryFile(id);
  if (!fs.existsSync(file)) throw new Error(currentMessages().errors.entryNotFound);
  const raw = fs.readFileSync(file);

  if (isLegacyEntryPayload(raw)) {
    let legacy: unknown;
    try {
      legacy = JSON.parse(raw.toString('utf8'));
    } catch {
      throw tampered();
    }
    if (typeof legacy !== 'object' || legacy === null) throw tampered();
    const payload = asPayload(legacy);
    if (payload === null) throw tampered();
    writeEntryPayload(id, payload);
    fs.removeSync(file);
    return payload;
  }

  const payload = unpackEntryPayload(raw);
  if (payload === null) throw tampered();
  return payload;
}

export function writeEntryPayload(id: string, payload: SaltedPayload): void {
  assertSafeEntryId(id);
  ensureVaultStructure();
  const buffer = packEntryPayload(payload);
  const file = path.join(entriesDir(), `${id}.zke`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, buffer, { mode: 0o600 });
  fs.renameSync(tmp, file);
  const legacy = path.join(entriesDir(), `${id}.enc`);
  if (fs.existsSync(legacy)) fs.removeSync(legacy);
}

export function deleteEntry(id: string): void {
  assertSafeEntryId(id);
  migrateHiddenLayout();
  for (const extension of ['zke', 'enc']) {
    const file = path.join(entriesDir(), `${id}.${extension}`);
    if (fs.existsSync(file)) fs.removeSync(file);
  }
}
