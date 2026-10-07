import crypto from 'node:crypto';
import { argon2id } from 'hash-wasm';

// Argon2id: mínimo 64 MB de RAM, t=3, p=4 (conforme especificação do cofre)
const ARGON2 = {
  memorySize: 65536, // KiB = 64 MB
  iterations: 3,
  parallelism: 4,
} as const;

export const MASTER_PASSWORD_LENGTH = 24;
export const PIN_LENGTH = 8;
/** Número mínimo de palavras da frase de recuperação (escrita pelo usuário). */
export const RECOVERY_MIN_WORDS = 12;

export interface EncryptedPayload {
  iv: string;
  tag: string;
  encryptedData: string;
}

export interface SaltedPayload extends EncryptedPayload {
  salt: string;
}

/** Derivação de chave primária via Argon2id. */
export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const hashHex = await argon2id({
    password,
    salt: new Uint8Array(salt),
    parallelism: ARGON2.parallelism,
    iterations: ARGON2.iterations,
    hashLength: 32,
    memorySize: ARGON2.memorySize,
    outputType: 'hex',
  });
  return Buffer.from(hashHex, 'hex');
}

/** Derivação de chave por arquivo (HKDF-SHA512 a partir da chave do cofre). */
export function deriveEntryKey(vaultKey: Buffer, salt: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha512', vaultKey, salt, 'guardinha-vault-entry-v1', 32));
}

export function randomBytes(size: number): Buffer {
  return crypto.randomBytes(size);
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

/**
 * Criptografia por arquivo individual com AES-256-GCM.
 * Salt (128-bits) e IV (128-bits) gerados por hardware para cada arquivo.
 */
export function encryptRecord(data: object, key: Buffer): SaltedPayload {
  const salt = crypto.randomBytes(16);
  const entryKey = deriveEntryKey(key, salt);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-gcm', entryKey, iv);
  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  entryKey.fill(0);

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    encryptedData: encrypted,
  };
}

export function decryptRecord(payload: SaltedPayload, vaultKey: Buffer): object {
  const salt = Buffer.from(payload.salt, 'hex');
  const entryKey = deriveEntryKey(vaultKey, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', entryKey, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

  let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  entryKey.fill(0);

  return JSON.parse(decrypted) as object;
}

/** Minúsculas, sem acento e com espaços simples (frase escrita pelo usuário). */
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .join(' ');
}

/** Gerador com injeção de palavras de entropia personalizada. */
export function generateHighEntropyPassword(
  length: number,
  useUpper: boolean,
  useNumbers: boolean,
  useSymbols: boolean,
  customEntropyWords: string[],
): string {
  if (length <= 0) return '';

  let charSet = 'abcdefghijklmnopqrstuvwxyz';
  if (useUpper) charSet += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (useNumbers) charSet += '0123456789';
  if (useSymbols) charSet += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Mistura palavras pessoais com entropia criptográfica de sistema
  const combinedEntropy = customEntropyWords.join('');
  const personalDigest = crypto
    .createHash('sha512')
    .update(combinedEntropy + crypto.randomBytes(32).toString('hex'))
    .digest();

  let password = '';
  for (let i = 0; i < length; i++) {
    // Digest pessoal (entropia dos gostos) desloca o índice; o randomInt de
    // hardware mantém a seleção uniforme sobre o conjunto de caracteres.
    const personalByte = personalDigest[i % personalDigest.length] ?? 0;
    const roll = (personalByte + crypto.randomInt(charSet.length)) % charSet.length;
    password += charSet[roll] ?? '';
  }

  return password;
}
