/** Credencial salva no cofre (conteúdo decifrado, só em memória). */
export interface Credential {
  id: string;
  title: string;
  username: string;
  password: string;
  domain: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** Entrada de credencial aceita pelo save (id ausente cria uma nova). */
export type CredentialInput = Omit<Credential, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * Como o usuário está tentando desbloquear o cofre. A frase de recuperação
 * **não é forma de login**: ela só serve para redefinir o PIN (`ResetPinInput`).
 */
export type UnlockKind = 'master' | 'pin';

/** Estado do cofre exposto ao renderer. */
export interface VaultStatus {
  exists: boolean;
  locked: boolean;
  attempts: number;
  lockUntil: number | null;
  lockRemainingMs: number;
}

export interface CreateVaultInput {
  masterPassword: string;
  pin: string;
  /** Frase escrita pelo próprio usuário (não gerada pelo app). */
  recoveryPhrase: string;
}

export interface UnlockInput {
  credential: string;
  kind: UnlockKind;
}

/** Redefinição do PIN provando posse da frase de recuperação. */
export interface ResetPinInput {
  phrase: string;
  newPin: string;
}

/** Resultado de uma operação de cofre, com o status atualizado. */
export interface VaultResult {
  ok: boolean;
  error?: string;
  status: VaultStatus;
}
