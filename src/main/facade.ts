import { decryptRecord, encryptRecord, randomUuid } from '@zero/main/crypto';
import {
  createVaultKey,
  deleteEntry,
  ensureVaultStructure,
  initManifest,
  isVaultDirUnavailable,
  listEntryIds,
  readEntryPayload,
  readVaultContainer,
  updateManifest,
  vaultExists,
  vaultPath,
  verifyManifest,
  writeEntryPayload,
  writeVaultContainer,
} from '@zero/main/storage';
import { currentMessages } from '@zero/main/i18n';
import type { VaultContainerData } from '@zero/main/container';
import type { Credential } from '@zero/types';

function tampered(): Error {
  return new Error(currentMessages().errors.vaultTampered);
}

/** Valida a forma decifrada antes de usar (arquivo corrompido vira adulteração). */
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
 * Fachada única do cofre sobre `fs-extra`, AES-256-GCM e o manifesto HMAC
 * (`.zke` e `.zkv`): `vault.ts` e `entries.ts` pedem operações de alto nível
 * aqui e nunca tocam sistema de arquivos, cifra ou pacote binário direto.
 */
export class VaultStorageFacade {
  // ---------- Estrutura e localização ----------

  public exists(): boolean {
    return vaultExists();
  }

  public ensureStructure(): void {
    ensureVaultStructure();
  }

  /** true se o erro é falta de permissão para criar a raiz em `/var/lib`. */
  public isDirUnavailable(error: unknown): boolean {
    return isVaultDirUnavailable(error);
  }

  /** Caminho efetivo do cofre (mensagens e diagnóstico). */
  public path(): string {
    return vaultPath();
  }

  // ---------- Chaves e identificadores ----------

  public createKey(): Buffer {
    return createVaultKey();
  }

  /** UUID novo para uma credencial. */
  public newId(): string {
    return randomUuid();
  }

  // ---------- Container (`vault.zkv`) ----------

  public readContainer(): VaultContainerData | null {
    return readVaultContainer();
  }

  public writeContainer(data: VaultContainerData): void {
    writeVaultContainer(data);
  }

  // ---------- Manifesto de integridade ----------

  public initManifest(vaultKey: Buffer): void {
    initManifest(vaultKey);
  }

  public updateManifest(vaultKey: Buffer): void {
    updateManifest(vaultKey);
  }

  /** Confere manifesto × diretório; adulteração derruba a operação inteira. */
  public verifyManifest(vaultKey: Buffer): void {
    verifyManifest(vaultKey);
  }

  // ---------- Credenciais (arquivos `.zke`) ----------

  public listIds(): string[] {
    return listEntryIds();
  }

  /**
   * Decifra o arquivo da credencial e confere a forma: payload inválido ou
   * registro fora do contrato vira o erro único de adulteração (fail-closed).
   */
  public readRecord(id: string, vaultKey: Buffer): Credential {
    let record: Credential | null;
    try {
      record = asCredential(decryptRecord(readEntryPayload(id), vaultKey));
    } catch {
      throw tampered();
    }
    if (record === null) throw tampered();
    return record;
  }

  /** Cifra, grava o arquivo individual e re-sella o manifesto. */
  public writeRecord(record: Credential, vaultKey: Buffer): void {
    writeEntryPayload(record.id, encryptRecord(record, vaultKey));
    updateManifest(vaultKey);
  }

  /** Apaga o arquivo cifrado e re-sella o manifesto. */
  public removeRecord(id: string, vaultKey: Buffer): void {
    deleteEntry(id);
    updateManifest(vaultKey);
  }
}

/** Instância única da fachada de persistência do cofre. */
export const vaultStorage = new VaultStorageFacade();
