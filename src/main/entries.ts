import { decryptRecord, encryptRecord, randomUuid } from '@zero/main/crypto';
import { validateDomainFormat, validateUsernameFormat } from '@zero/main/auth';
import {
  deleteEntry,
  listEntryIds,
  readEntryPayload,
  updateManifest,
  verifyManifest,
  writeEntryPayload,
} from '@zero/main/storage';
import { requireSessionKey, touch } from '@zero/main/vault';
import { currentMessages } from '@zero/main/i18n';
import type { Credential, CredentialInput } from '@zero/types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida a forma decifrada antes de usar (arquivo corrompido vira null). */
function asCredential(value: object): Credential | null {
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.username !== 'string' ||
    typeof record.password !== 'string' ||
    typeof record.domain !== 'string' ||
    typeof record.notes !== 'string' ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number'
  ) {
    return null;
  }
  return {
    id: record.id,
    title: record.title,
    username: record.username,
    password: record.password,
    domain: record.domain,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Todas as credenciais decifradas, da mais recente para a mais antiga.
 * Confere o manifesto antes: arquivo removido/injetado de fora do app derruba
 * a lista com o erro único de adulteração (fail-closed, sem ignorar nada).
 */
export function listEntries(): Credential[] {
  const key = requireSessionKey();
  const m = currentMessages();
  verifyManifest(key);
  const records: Credential[] = [];
  for (const id of listEntryIds()) {
    let record: Credential | null;
    try {
      record = asCredential(decryptRecord(readEntryPayload(id), key));
    } catch {
      throw new Error(m.errors.vaultTampered);
    }
    if (record === null) throw new Error(m.errors.vaultTampered);
    records.push(record);
  }
  records.sort((a, b) => b.updatedAt - a.updatedAt);
  touch();
  return records;
}

/** Valida, cifra e grava a credencial em arquivo próprio (<uuid>.zke). */
export function saveEntry(input: CredentialInput): Credential[] {
  const key = requireSessionKey();
  const m = currentMessages();

  const title = input.title.trim();
  if (title === '') throw new Error(m.errors.invalidTitle);
  if (!validateUsernameFormat(input.username.trim())) throw new Error(m.errors.invalidUsername);
  const domain = input.domain.trim().toLowerCase();
  if (!validateDomainFormat(domain)) throw new Error(m.errors.invalidDomain);

  const now = Date.now();
  let id = randomUuid();
  let createdAt = now;

  if (input.id !== undefined && input.id !== '') {
    if (!UUID_PATTERN.test(input.id)) throw new Error(m.errors.invalidId);
    if (!listEntryIds().includes(input.id)) throw new Error(m.errors.entryNotFound);
    let stored: Credential | null;
    try {
      stored = asCredential(decryptRecord(readEntryPayload(input.id), key));
    } catch {
      stored = null;
    }
    if (stored === null) throw new Error(m.errors.vaultTampered);
    id = input.id;
    createdAt = stored.createdAt;
  }

  const record: Credential = {
    id,
    title,
    username: input.username.trim(),
    password: input.password,
    domain,
    notes: input.notes,
    createdAt,
    updatedAt: now,
  };
  writeEntryPayload(id, encryptRecord(record, key));
  updateManifest(key);
  touch();
  return listEntries();
}

/** Remove o arquivo cifrado da credencial e re-sella o manifesto. */
export function removeEntry(id: string): Credential[] {
  const key = requireSessionKey();
  const m = currentMessages();
  if (!UUID_PATTERN.test(id)) throw new Error(m.errors.invalidId);
  if (!listEntryIds().includes(id)) throw new Error(m.errors.entryNotFound);
  deleteEntry(id);
  updateManifest(key);
  touch();
  return listEntries();
}
