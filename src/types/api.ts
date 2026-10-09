import type { GeneratorOptions } from '@zero/types/generator';
import type { AppSettings } from '@zero/types/settings';
import type {
  CreateVaultInput,
  Credential,
  CredentialInput,
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
