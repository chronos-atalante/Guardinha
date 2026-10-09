import { activityMonitor } from '@zero/main/activity';
import { currentMessages } from '@zero/main/i18n';

/**
 * Única detentora da chave do cofre em memória (Singleton). A guarda e a
 * zeragem de memória moram aqui: nenhum outro módulo mantém cópia da chave, e
 * o lock deixa de ser uma variável de módulo espalhada entre arquivos.
 *
 * A ociosidade não é assunto desta classe: quem mede o tempo é o
 * `ActivityMonitor` (Observer), que avisa e este Singleton obedece.
 */
export class VaultSessionManager {
  private static instance: VaultSessionManager | null = null;

  private key: Buffer | null = null;

  private constructor() {
    activityMonitor.subscribe(() => {
      this.wipe();
    });
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

  /** Marca atividade e rearma a trava automática. */
  public touch(): void {
    if (this.key === null) return;
    activityMonitor.touch();
  }

  /**
   * Zera a chave na memória (`fill(0)`) e cancela o auto-lock: o lock manual,
   * o timeout e o encerramento do app passam por aqui, sem sobrar cópia
   * legível.
   */
  public wipe(): void {
    if (this.key !== null) {
      this.key.fill(0);
      this.key = null;
    }
    activityMonitor.stop();
  }
}

/** Atalho da instância única (o construtor é privado). */
export function vaultSession(): VaultSessionManager {
  return VaultSessionManager.getInstance();
}
