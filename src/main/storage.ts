import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from '@zero/main/crypto';
import type { SaltedPayload } from '@zero/main/crypto';
import type { Credential } from '@zero/types';

/** Raiz do cofre: pasta oculta no home do usuário (override via ZENA_VAULT_DIR). */
function vaultDir(): string {
  const override = process.env.ZENA_VAULT_DIR;
  if (override !== undefined && override !== '') return override;
  return path.join(os.homedir(), '.zena-vault');
}

function entriesDir(): string {
  return path.join(vaultDir(), 'entries');
}

function envelopeFile(): string {
  return path.join(vaultDir(), 'envelope.json');
}

function authStateFile(): string {
  return path.join(vaultDir(), 'auth-state.json');
}

export interface VaultEnvelope {
  version: number;
  createdAt: number;
  kdf: {
    algo: 'argon2id';
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  };
  /** Cada método de desbloqueio embrulha a mesma vaultKey aleatória. */
  methods: {
    master?: UnlockMethod;
    pin?: UnlockMethod;
    recovery?: UnlockMethod;
  };
}

export interface UnlockMethod {
  salt: string;
  wrapped: SaltedPayload;
}

export interface StoredCredential extends Omit<Credential, 'password'> {
  payload: SaltedPayload;
}

export interface PersistedAuthState {
  attempts: number;
  lockUntil: number | null;
}

/** Garante pasta oculta no Linux Mint com permissões restritas. */
export function ensureVaultStructure(): void {
  fs.ensureDirSync(vaultDir(), { mode: 0o700 });
  fs.ensureDirSync(entriesDir(), { mode: 0o700 });
  fs.chmodSync(vaultDir(), 0o700);
}

export function vaultExists(): boolean {
  return fs.existsSync(envelopeFile());
}

export function readEnvelope(): VaultEnvelope | null {
  if (!vaultExists()) return null;
  return fs.readJsonSync(envelopeFile()) as VaultEnvelope;
}

export function writeEnvelope(envelope: VaultEnvelope): void {
  ensureVaultStructure();
  const tmp = `${envelopeFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(envelope, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, envelopeFile());
  fs.chmodSync(envelopeFile(), 0o600);
}

export function createVaultKey(): Buffer {
  return randomBytes(32);
}

// ---------- Entradas individuais ----------

function entryPath(id: string): string {
  return path.join(entriesDir(), `${id}.enc`);
}

export function listEntryIds(): string[] {
  ensureVaultStructure();
  return fs
    .readdirSync(entriesDir())
    .filter((file) => file.endsWith('.enc'))
    .map((file) => file.replace(/\.enc$/, ''));
}

export function readEntryPayload(id: string): SaltedPayload {
  return fs.readJsonSync(entryPath(id)) as SaltedPayload;
}

export function writeEntryPayload(id: string, payload: SaltedPayload): void {
  ensureVaultStructure();
  const file = entryPath(id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function deleteEntry(id: string): void {
  const file = entryPath(id);
  if (fs.existsSync(file)) fs.removeSync(file);
}

// ---------- Estado de autenticação (trava exponencial) ----------

export function readAuthState(): PersistedAuthState {
  if (!fs.existsSync(authStateFile())) return { attempts: 0, lockUntil: null };
  try {
    return fs.readJsonSync(authStateFile()) as PersistedAuthState;
  } catch {
    return { attempts: 0, lockUntil: null };
  }
}

export function writeAuthState(state: PersistedAuthState): void {
  ensureVaultStructure();
  fs.writeFileSync(authStateFile(), JSON.stringify(state), { mode: 0o600 });
}
