import { clipboard } from 'electron';

/** Limpeza automática 30 s depois da cópia. */
const CLEAR_AFTER_MS = 30_000;

/**
 * Proxy do clipboard nativo (Proxy do GoF): o processo main é o único a tocar
 * `electron.clipboard`, com temporizador de expiração e limpeza automática.
 * Antes de limpar, lê o clipboard atual; se o usuário já tiver copiado outra
 * coisa, o valor alheio é preservado. Sem leitura disponível, limpa mesmo
 * assim (no cofre, senha esquecida pesa mais que conveniência).
 */
export class SecureClipboardProxy {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private copied: string | null = null;

  /** Copia e agenda a limpeza; uma nova cópia reprograma o temporizador. */
  public async copy(value: string): Promise<void> {
    await clipboard.writeText(value);
    this.copied = value;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.clearIfUnchanged();
    }, CLEAR_AFTER_MS);
  }

  /** Cancela a limpeza pendente (encerramento do app). */
  public dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.copied = null;
  }

  private async clearIfUnchanged(): Promise<void> {
    let current: string | null = null;
    try {
      current = await clipboard.readText();
    } catch {
      // sem leitura disponível: segue para a limpeza
    }
    if (current !== null && current !== this.copied) {
      this.copied = null;
      return;
    }
    try {
      await clipboard.writeText('');
    } catch {
      // clipboard indisponível: nada a limpar
    } finally {
      this.copied = null;
    }
  }
}

/** Instância única do proxy de clipboard do app. */
export const secureClipboard = new SecureClipboardProxy();
