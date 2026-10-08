import { decryptRecord, encryptRecord, isValidKdfParams } from '@zero/main/crypto';
import type { Argon2Params, SaltedPayload } from '@zero/main/crypto';

/**
 * Formato binário do cofre. Nenhum arquivo legível de fora do app:
 *
 * - `vault.zkv` (magic `ZKVAULT1`): parâmetros KDF globais (informativos) +
 *   blobs de chave embrulhados com o KDF de cada método + contagem da trava
 *   exponencial + manifesto cifrado.
 * - `entries/<uuid>.zke` (magic `ZENTRY01`): salt | IV | tag | texto cifrado.
 *
 * Toda leitura é fail-closed: forma inválida, truncamento, parâmetro KDF fora
 * da faixa ou byte adulterado devolvem `null` (ou lançam), nunca conteúdo em
 * claro.
 */
const VAULT_MAGIC = Buffer.from('ZKVAULT1', 'ascii');
const ENTRY_MAGIC = Buffer.from('ZENTRY01', 'ascii');

/** Versão atual: parâmetros Argon2id individuais por método de desbloqueio. */
export const VAULT_VERSION = 3;
/** Versão anterior, ainda legível: um único KDF global no cabeçalho. */
const LEGACY_VAULT_VERSION = 2;

/**
 * `magic(8) + version(4) + createdAt(8) + memoryKiB(4) + iterations(4) +
 * parallelism(4) + attempts(4) + lockUntil(8) + flags(1)`.
 * Em v3 o tripo de KDF do cabeçalho é informativo (cada método tem o seu).
 */
const VAULT_HEADER_BYTES = 45;
/** `memoryKiB(4) + iterations(4) + parallelism(4)` antes do salt de cada método (v3). */
const METHOD_KDF_BYTES = 12;
/** `salt(16) + iv(16) + tag(16) + ctLen(4)` antes do texto cifrado. */
const BLOB_HEAD_BYTES = 52;
const ENTRY_HEADER_BYTES = 8 + BLOB_HEAD_BYTES;

const FLAG_MASTER = 0x01;
const FLAG_PIN = 0x02;
const FLAG_RECOVERY = 0x04;
const FLAG_MANIFEST = 0x08;
const FLAGS_ALL = FLAG_MASTER | FLAG_PIN | FLAG_RECOVERY | FLAG_MANIFEST;

const MANIFEST_VERSION = 1;

export interface VaultKdfParams extends Argon2Params {
  algo: 'argon2id';
}

/** Chave do cofre embrulhada por uma credencial (Argon2id + AES-256-GCM). */
export interface WrappedMethod {
  /** Custo do Argon2id usado só neste método (PIN é o mais caro). */
  kdf: VaultKdfParams;
  /** Salt do Argon2id (128 bits). */
  kdfSalt: string;
  /** Registro cifrado com a própria chave derivada. */
  payload: SaltedPayload;
}

export interface VaultContainerData {
  createdAt: number;
  kdf: VaultKdfParams;
  attempts: number;
  lockUntil: number | null;
  /** Chave do cofre embrulhada por cada credencial (blobs cifrados). */
  methods: { master?: WrappedMethod; pin?: WrappedMethod; recovery?: WrappedMethod };
  /** Lista de ids cifrada com a chave do cofre; `null` = ainda não sellada. */
  manifest: SaltedPayload | null;
}

function blobBytes(payload: SaltedPayload): number {
  return BLOB_HEAD_BYTES + Buffer.from(payload.encryptedData, 'hex').length;
}

function methodBlobBytes(method: WrappedMethod): number {
  return METHOD_KDF_BYTES + 16 + blobBytes(method.payload);
}

function assertKdf(value: VaultKdfParams): void {
  if (!isValidKdfParams(value)) throw new Error('parâmetros KDF inválidos');
}

function writeBlob(buffer: Buffer, offset: number, payload: SaltedPayload): number {
  Buffer.from(payload.salt, 'hex').copy(buffer, offset);
  Buffer.from(payload.iv, 'hex').copy(buffer, offset + 16);
  Buffer.from(payload.tag, 'hex').copy(buffer, offset + 32);
  const text = Buffer.from(payload.encryptedData, 'hex');
  buffer.writeUInt32BE(text.length, offset + 48);
  text.copy(buffer, offset + 52);
  return offset + 52 + text.length;
}

function readBlob(buffer: Buffer, offset: number): { payload: SaltedPayload; next: number } | null {
  const head = offset + BLOB_HEAD_BYTES;
  if (head > buffer.length) return null;
  const textLength = buffer.readUInt32BE(offset + 48);
  const end = head + textLength;
  if (end > buffer.length) return null;
  return {
    payload: {
      salt: buffer.subarray(offset, offset + 16).toString('hex'),
      iv: buffer.subarray(offset + 16, offset + 32).toString('hex'),
      tag: buffer.subarray(offset + 32, offset + 48).toString('hex'),
      encryptedData: buffer.subarray(head, end).toString('hex'),
    },
    next: end,
  };
}

function writeMethodBlob(buffer: Buffer, offset: number, method: WrappedMethod): number {
  buffer.writeUInt32BE(method.kdf.memoryKiB, offset);
  buffer.writeUInt32BE(method.kdf.iterations, offset + 4);
  buffer.writeUInt32BE(method.kdf.parallelism, offset + 8);
  Buffer.from(method.kdfSalt, 'hex').copy(buffer, offset + METHOD_KDF_BYTES);
  return writeBlob(buffer, offset + METHOD_KDF_BYTES + 16, method.payload);
}

function readKdfAt(buffer: Buffer, offset: number): VaultKdfParams | null {
  if (offset + METHOD_KDF_BYTES > buffer.length) return null;
  const kdf: VaultKdfParams = {
    algo: 'argon2id',
    memoryKiB: buffer.readUInt32BE(offset),
    iterations: buffer.readUInt32BE(offset + 4),
    parallelism: buffer.readUInt32BE(offset + 8),
  };
  return isValidKdfParams(kdf) ? kdf : null;
}

function readMethodBlob(
  buffer: Buffer,
  offset: number,
  kdf: VaultKdfParams,
): { method: WrappedMethod; next: number } | null {
  if (offset + 16 > buffer.length) return null;
  const read = readBlob(buffer, offset + 16);
  if (read === null) return null;
  return {
    method: {
      kdf,
      kdfSalt: buffer.subarray(offset, offset + 16).toString('hex'),
      payload: read.payload,
    },
    next: read.next,
  };
}

export function packVaultContainer(data: VaultContainerData): Buffer {
  assertKdf(data.kdf);
  const methods: [number, WrappedMethod | undefined][] = [
    [FLAG_MASTER, data.methods.master],
    [FLAG_PIN, data.methods.pin],
    [FLAG_RECOVERY, data.methods.recovery],
  ];
  let flags = 0;
  let size = VAULT_HEADER_BYTES;
  for (const [flag, method] of methods) {
    if (method !== undefined) {
      assertKdf(method.kdf);
      flags |= flag;
      size += methodBlobBytes(method);
    }
  }
  if (data.manifest !== null) {
    flags |= FLAG_MANIFEST;
    size += blobBytes(data.manifest);
  }

  const buffer = Buffer.alloc(size);
  VAULT_MAGIC.copy(buffer, 0);
  buffer.writeUInt32BE(VAULT_VERSION, 8);
  buffer.writeBigUInt64BE(BigInt(data.createdAt), 12);
  // tripo global de KDF: informativo em v3 (cada método tem o seu)
  buffer.writeUInt32BE(data.kdf.memoryKiB, 20);
  buffer.writeUInt32BE(data.kdf.iterations, 24);
  buffer.writeUInt32BE(data.kdf.parallelism, 28);
  buffer.writeUInt32BE(data.attempts, 32);
  buffer.writeBigInt64BE(BigInt(data.lockUntil ?? 0), 36);
  buffer.writeUInt8(flags, 44);

  let cursor = VAULT_HEADER_BYTES;
  for (const [flag, method] of methods) {
    if (method !== undefined && (flags & flag) !== 0) {
      cursor = writeMethodBlob(buffer, cursor, method);
    }
  }
  if (data.manifest !== null) cursor = writeBlob(buffer, cursor, data.manifest);

  return buffer.subarray(0, cursor);
}

export function unpackVaultContainer(buffer: Buffer): VaultContainerData | null {
  if (buffer.length < VAULT_HEADER_BYTES) return null;
  if (!buffer.subarray(0, 8).equals(VAULT_MAGIC)) return null;
  const version = buffer.readUInt32BE(8);
  if (version !== VAULT_VERSION && version !== LEGACY_VAULT_VERSION) return null;
  const flags = buffer.readUInt8(44);
  if ((flags & ~FLAGS_ALL) !== 0) return null;

  // o tripo do cabeçalho tem o mesmo formato do KDF de cada método
  const headerKdf = readKdfAt(buffer, 20);
  if (headerKdf === null) return null;

  let cursor = VAULT_HEADER_BYTES;
  const methods: VaultContainerData['methods'] = {};
  const entries: [number, 'master' | 'pin' | 'recovery'][] = [
    [FLAG_MASTER, 'master'],
    [FLAG_PIN, 'pin'],
    [FLAG_RECOVERY, 'recovery'],
  ];
  for (const [flag, name] of entries) {
    if ((flags & flag) === 0) continue;
    let kdf = headerKdf;
    if (version === VAULT_VERSION) {
      const perMethod = readKdfAt(buffer, cursor);
      if (perMethod === null) return null;
      kdf = perMethod;
      cursor += METHOD_KDF_BYTES;
    }
    const read = readMethodBlob(buffer, cursor, kdf);
    if (read === null) return null;
    methods[name] = read.method;
    cursor = read.next;
  }

  let manifest: SaltedPayload | null = null;
  if ((flags & FLAG_MANIFEST) !== 0) {
    const read = readBlob(buffer, cursor);
    if (read === null) return null;
    manifest = read.payload;
    cursor = read.next;
  }

  if (cursor !== buffer.length) return null;
  if (methods.master === undefined && methods.pin === undefined) return null;

  const lockUntilRaw = buffer.readBigInt64BE(36);
  return {
    createdAt: Number(buffer.readBigUInt64BE(12)),
    kdf: headerKdf,
    attempts: buffer.readUInt32BE(32),
    lockUntil: lockUntilRaw === 0n ? null : Number(lockUntilRaw),
    methods,
    manifest,
  };
}

export function packEntryPayload(payload: SaltedPayload): Buffer {
  const text = Buffer.from(payload.encryptedData, 'hex');
  const buffer = Buffer.alloc(ENTRY_HEADER_BYTES + text.length);
  ENTRY_MAGIC.copy(buffer, 0);
  Buffer.from(payload.salt, 'hex').copy(buffer, 8);
  Buffer.from(payload.iv, 'hex').copy(buffer, 24);
  Buffer.from(payload.tag, 'hex').copy(buffer, 40);
  buffer.writeUInt32BE(text.length, 56);
  text.copy(buffer, 60);
  return buffer;
}

export function unpackEntryPayload(buffer: Buffer): SaltedPayload | null {
  if (buffer.length < ENTRY_HEADER_BYTES) return null;
  if (!buffer.subarray(0, 8).equals(ENTRY_MAGIC)) return null;
  const textLength = buffer.readUInt32BE(56);
  if (buffer.length !== ENTRY_HEADER_BYTES + textLength) return null;
  return {
    salt: buffer.subarray(8, 24).toString('hex'),
    iv: buffer.subarray(24, 40).toString('hex'),
    tag: buffer.subarray(40, 56).toString('hex'),
    encryptedData: buffer.subarray(60).toString('hex'),
  };
}

/** Payload legado era JSON (`{...}`); serve para detectar e converter. */
export function isLegacyEntryPayload(buffer: Buffer): boolean {
  return buffer.length > 0 && buffer[0] === 0x7b;
}

/** Sell a lista de ids do cofre com a própria chave (AES-256-GCM + HKDF). */
export function sealManifest(vaultKey: Buffer, ids: string[]): SaltedPayload {
  return encryptRecord({ v: MANIFEST_VERSION, ids }, vaultKey);
}

/** Abre o manifesto; qualquer forma inesperada lança (fail-closed). */
export function openManifest(vaultKey: Buffer, payload: SaltedPayload): string[] {
  const value = decryptRecord(payload, vaultKey) as Record<string, unknown>;
  const ids = value.ids;
  if (value.v !== MANIFEST_VERSION || !Array.isArray(ids)) {
    throw new Error('manifesto inválido');
  }
  const result: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || id === '') throw new Error('manifesto inválido');
    result.push(id);
  }
  return result;
}
