import type { GeneratorOptions } from '@zero/types/generator';
import type { AppSettings } from '@zero/types/settings';
import type {
  CreateVaultInput,
  Credential,
  CredentialInput,
  PanicPinInput,
  PanicStatus,
  ResetPinInput,
  UnlockInput,
  VaultResult,
  VaultStatus,
} from '@zero/types/vault';

/**
 * Contrato único da ponte renderer ↔ main. O preload monta este objeto e o
 * registra no contextBridge como `window.api`; o renderer só enxerga isto.
 */
export interface ElectronApi {
  vault: {
    status: () => Promise<VaultStatus>;
    create: (input: CreateVaultInput) => Promise<VaultResult>;
    unlock: (input: UnlockInput) => Promise<VaultResult>;
    /** Prova posse da frase de recuperação e instala um novo PIN. */
    resetPin: (input: ResetPinInput) => Promise<VaultResult>;
    lock: () => Promise<VaultStatus>;
    /**
     * Cryptographic Erase sob comando explícito do usuário (botão de pânico).
     * Destruir sem confirmação é um clique de engano longe demais de ser
     * irreversível, então a confirmação mora no renderer.
     */
    destroy: () => Promise<VaultStatus>;
    /** Instala o PIN de coação (exige cofre desbloqueado). */
    setPanicPin: (input: PanicPinInput) => Promise<VaultResult>;
    /** Remove o PIN de coação. */
    clearPanicPin: () => Promise<VaultStatus>;
    /** Configura o limite estrito da senha mestra; `0` desliga. */
    setNukeLimit: (limit: number) => Promise<VaultResult>;
    /** Estado das proteções de pânico, para a interface montar o formulário. */
    panicStatus: () => Promise<PanicStatus>;
    /**
     * Ouvinte do auto-lock (Observer): o main empurra o status novo quando o
     * cofre trava sozinho por ociosidade. Devolve a função que cancela.
     */
    onAutoLocked: (listener: (status: VaultStatus) => void) => () => void;
  };
  /** Abre o domínio da credencial no navegador padrão do sistema. */
  openDomain: (domain: string) => Promise<void>;
  clipboard: {
    /** Copia para o clipboard nativo; some da área de transferência em 30 s. */
    copy: (value: string) => Promise<void>;
  };
  entries: {
    list: () => Promise<Credential[]>;
    save: (entry: CredentialInput) => Promise<Credential[]>;
    remove: (id: string) => Promise<Credential[]>;
  };
  generator: {
    generate: (options: GeneratorOptions) => Promise<string>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (settings: AppSettings) => Promise<AppSettings>;
  };
}
