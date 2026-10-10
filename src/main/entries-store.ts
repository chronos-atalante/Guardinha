import fs from 'fs-extra';
import path from 'node:path';
import { isLegacyEntryPayload, packEntryPayload, unpackEntryPayload } from '@zero/main/container';
import { currentMessages } from '@zero/main/i18n';
import { entriesDir } from '@zero/main/layout';
import { ensureVaultStructure, migrateHiddenLayout, vaultFiles } from '@zero/main/structure';
import { randomBytes } from '@zero/main/crypto';
import { SHRED_PASSES, shredFile } from '@zero/main/shred';
import type { SaltedPayload } from '@zero/main/crypto';

/**
 * Arquivos individuais das credenciais (`.entries/<uuid>.zke`, e o `.enc` legado
 * em JSON). Saiu de `storage.ts` para caber o erasure sem estourar o teto de
 * linhas do repositório: o container (`vault.zkv`), a trava e o manifesto ficam
 * lá, e aqui fica tudo que é um arquivo por credencial.
 */

const ENTRY_EXTENSIONS = ['zke', 'enc'] as const;

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

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
    for (const extension of ENTRY_EXTENSIONS) {
      if (file.endsWith(`.${extension}`)) ids.add(file.slice(0, -(extension.length + 1)));
    }
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
  // o `.enc` legado também é sobrescrito: é a mesma credencial em outro formato
  if (fs.existsSync(legacy)) shredFile(legacy, SHRED_PASSES);
}

/**
 * Remove os arquivos da credencial com sobrescrita. Os `.zke` já são texto
 * cifrado e, sem a chave do cofre, são irrecuperáveis mesmo sem sobrescrita:
 * o shred aqui é higiene, não o controle principal (que é o Cryptographic Erase,
 * em `src/main/erase.ts`). O caminho chega sempre de `entryFile()`, nunca de
 * id cru, então o shred não vira rota alternativa para path traversal.
 */
export function deleteEntry(id: string): void {
  assertSafeEntryId(id);
  migrateHiddenLayout();
  for (const extension of ENTRY_EXTENSIONS) {
    const file = path.join(entriesDir(), `${id}.${extension}`);
    if (fs.existsSync(file)) shredFile(file, SHRED_PASSES);
  }
}

/**
 * Temporários órfãos: um `.tmp` deixado por um crash não é coberto pelo
 * manifesto (`listEntryIds` só lista `.zke` e `.enc`), então sobrevive sem
 * ninguém notar. Os mais velhos que `maxAgeMs` são sobrescritos e apagados; os
 * mais novos são deixados intactos, porque podem ser de uma escrita em curso.
 */
export function cleanStaleTempFiles(maxAgeMs: number): { removed: number; kept: number } {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  let kept = 0;
  for (const file of vaultFiles()) {
    if (!file.endsWith('.tmp')) continue;
    let stale = true;
    try {
      stale = fs.statSync(file).mtimeMs < cutoff;
    } catch {
      // someu no meio da varredura: tenta apagar assim mesmo
    }
    if (!stale) {
      kept++;
      continue;
    }
    if (shredFile(file, SHRED_PASSES)) removed++;
  }
  return { removed, kept };
}
