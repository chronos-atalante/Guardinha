import {
  decryptRecord,
  deriveKey,
  encryptRecord,
  isSameKdf,
  kdfProfileFor,
  randomBytes,
} from '@zero/main/crypto';
import type { VaultKdfParams, WrappedMethod } from '@zero/main/container';
import type { UnlockKind } from '@zero/types';

/** Todo método que embrulha a chave, inclusive a frase de recuperação. */
export type CredentialKind = UnlockKind | 'recovery';

/**
 * Embrulho/desembrulho da chave do cofre (Strategy por tipo de credencial):
 * cada método tem o custo do Argon2id adequado ao segredo que o protege.
 */
export interface KeyUnwrapper {
  readonly kind: CredentialKind;
  /** Custo do Argon2id deste método (lido do container, na prática). */
  readonly kdf: VaultKdfParams;
  /** Embrulha a chave de 32 bytes para o container. */
  wrap(vaultKey: Buffer, credential: string): Promise<WrappedMethod>;
  /** Chave de trabalho derivada do salt gravado no container. */
  derive(method: WrappedMethod, credential: string): Promise<Buffer>;
  /** Desembrulha a chave do cofre; credencial errada lança (GCM). */
  unwrap(method: WrappedMethod, derived: Buffer): Buffer;
}

/**
 * Custo do Argon2id para um método de desbloqueio: o PIN de 8 dígitos é o
 * segredo fraco (10^8 candidatas offline) e por isso recebe o perfil mais caro;
 * senha mestra e frase de recuperação têm entropia própria, um nível abaixo.
 */
function kdfFor(kind: CredentialKind): VaultKdfParams {
  return { algo: 'argon2id', ...kdfProfileFor(kind) };
}

/** A chave desembrulhada tem 32 bytes; qualquer outra forma é container corrompido. */
function asVaultKey(unwrapped: object): Buffer {
  if (!('key' in unwrapped) || typeof unwrapped.key !== 'string' || unwrapped.key.length !== 64) {
    throw new Error('container corrompido');
  }
  return Buffer.from(unwrapped.key, 'hex');
}

abstract class Argon2KeyUnwrapper implements KeyUnwrapper {
  public abstract readonly kind: CredentialKind;

  public get kdf(): VaultKdfParams {
    return kdfFor(this.kind);
  }

  public async wrap(vaultKey: Buffer, credential: string): Promise<WrappedMethod> {
    const kdfSalt = randomBytes(16);
    const derived = await deriveKey(credential, kdfSalt, this.kdf);
    const payload = encryptRecord({ key: vaultKey.toString('hex') }, derived);
    derived.fill(0);
    return { kdf: this.kdf, kdfSalt: kdfSalt.toString('hex'), payload };
  }

  public async derive(method: WrappedMethod, credential: string): Promise<Buffer> {
    return deriveKey(credential, Buffer.from(method.kdfSalt, 'hex'), method.kdf);
  }

  public unwrap(method: WrappedMethod, derived: Buffer): Buffer {
    return asVaultKey(decryptRecord(method.payload, derived));
  }
}

class MasterKeyUnwrapper extends Argon2KeyUnwrapper {
  public readonly kind = 'master' as const;
}

class PinKeyUnwrapper extends Argon2KeyUnwrapper {
  public readonly kind = 'pin' as const;
}

class RecoveryKeyUnwrapper extends Argon2KeyUnwrapper {
  public readonly kind = 'recovery' as const;
}

/**
 * Mapa de embrulhadores por tipo de credencial. Os embrulhadores são puros
 * (sem estado), então a fábrica é só este mapa + `keyUnwrapperFor`.
 */
const UNWRAPPERS: ReadonlyMap<CredentialKind, KeyUnwrapper> = new Map<CredentialKind, KeyUnwrapper>(
  [
    ['master', new MasterKeyUnwrapper()],
    ['pin', new PinKeyUnwrapper()],
    ['recovery', new RecoveryKeyUnwrapper()],
  ],
);

/**
 * Factory Method: o tipo de credencial resolve seu desembrulho no mapa.
 * Acrescentar um método de desbloqueio é uma entrada nova, sem tocar em quem
 * chama (desbloqueio, criação do cofre e redefinição de PIN).
 */
export function keyUnwrapperFor(kind: CredentialKind): KeyUnwrapper {
  const found = UNWRAPPERS.get(kind);
  if (found === undefined) {
    throw new Error(`método de desbloqueio desconhecido: ${kind}`);
  }
  return found;
}

/** true se o custo gravado já é o atual (candidato a reembrulho caso contrário). */
export function isKdfUpToDate(kind: CredentialKind, method: WrappedMethod): boolean {
  return isSameKdf(method.kdf, keyUnwrapperFor(kind).kdf);
}
