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

/** Todo método que embrulha a chave, inclusive a frase e o PIN de coação. */
export type CredentialKind = UnlockKind | 'recovery' | 'panic';

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
 * O PIN de pânico é o mesmo formato do PIN e recebe o mesmo custo, de propósito:
 * o atacante que mede o tempo de um desbloqueio legítimo não pode perceber que
 * existe um segundo caminho.
 */
function kdfFor(kind: CredentialKind): VaultKdfParams {
  // o PIN de pânico é o mesmo segredo fraco do PIN, com o mesmo custo: um
  // desbloqueio por ele custa exatamente o mesmo que um legítimo, então quem
  // mede o tempo de um para o outro não descobre o atalho
  const base = kind === 'pin' || kind === 'panic' ? kdfProfileFor('pin') : kdfProfileFor('master');
  return { algo: 'argon2id', ...base };
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
 * PIN de coação: embrulha uma chave **decoy** de 32 bytes aleatórios, sem
 * nenhuma relação com a chave real. Desembrulhar o método `panic` só prova que
 * quem digitou conhece o PIN de pânico; não entrega nada do cofre de verdade,
 * porque a chave que sai daqui nunca descriptografou um único `.zke`.
 */
class PanicKeyUnwrapper extends Argon2KeyUnwrapper {
  public readonly kind = 'panic' as const;
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
    ['panic', new PanicKeyUnwrapper()],
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

/**
 * Gera a chave decoy do PIN de pânico. São 32 bytes aleatórios, então
 * qualquer tentativa de abrir um `.zke` com ela falha no GCM, e o app nem
 * tenta: quem entra por este caminho recebe um cofre vazio.
 */
export function decoyKey(): Buffer {
  return randomBytes(32);
}
