import { currentMessages } from '@zero/main/i18n';

/** Trava automática após 5 minutos sem operação no cofre. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;

/**
 * Única detentora da chave do cofre em memória (Singleton). A guarda, a
 * zeragem de memória e o auto-lock por ociosidade moram aqui: nenhum outro
 * módulo mantém cópia da chave, e o lock deixa de ser uma variável de módulo
 * espalhada entre arquivos.
 */
export class VaultSessionManager {
  private static instance: VaultSessionManager | null = null;

  private key: Buffer | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    // Singleton: a construção passa por getInstance().
  }

  /** Instância única do processo; o construtor é privado de propósito. */
  public static getInstance(): VaultSessionManager {
    VaultSessionManager.instance ??= new VaultSessionManager();
    return VaultSessionManager.instance;
  }

  /** Assume a posse da chave (zerando a anterior) e arma o auto-lock. */
  public adopt(key: Buffer): void {
    this.wipe();
    this.key = key;
    this.touch();
  }

  /** Chave corrente; lança o erro localizado se o cofre estiver bloqueado. */
  public requireKey(): Buffer {
    if (this.key === null) {
      throw new Error(currentMessages().errors.vaultLocked);
    }
    return this.key;
  }

  /** Chave corrente ou `null`; nenhum chamador deve reter o Buffer. */
  public keyOrNull(): Buffer | null {
    return this.key;
  }

  public isUnlocked(): boolean {
    return this.key !== null;
  }

  /** Rearma a trava automática (chamado a cada operação bem-sucedida). */
  public touch(): void {
    if (this.key === null) return;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.wipe();
    }, IDLE_LOCK_MS);
  }

  /**
   * Zera a chave na memória (`fill(0)`) e cancela o auto-lock: o lock manual e
   * o encerramento do app passam por aqui, sem sobrar cópia legível.
   */
  public wipe(): void {
    if (this.key !== null) {
      this.key.fill(0);
      this.key = null;
    }
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

/** Atalho da instância única (o construtor é privado). */
export function vaultSession(): VaultSessionManager {
  return VaultSessionManager.getInstance();
}
