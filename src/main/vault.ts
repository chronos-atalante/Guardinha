import { normalizeRecoveryPhrase, RECOVERY_MIN_WORDS } from '@zero/main/crypto';
import {
  getLockRemainingMs,
  loadAuthState,
  registerFailedAttempt,
  resetAttempts,
  statusFrom,
  validateMasterPasswordFormat,
  validatePinFormat,
} from '@zero/main/auth';
import { vaultStorage } from '@zero/main/facade';
import { vaultSession } from '@zero/main/session';
import { setupVaultDirectory } from '@zero/main/privilege';
import { isKdfUpToDate, keyUnwrapperFor } from '@zero/main/unwrapping';
import { runUnlockChain } from '@zero/main/unlock';
import type { UnlockContext } from '@zero/main/unlock';
import { formatCountdown, strengthFor } from '@zero/shared';
import { currentMessages } from '@zero/main/i18n';
import type { VaultContainerData } from '@zero/main/container';
import type {
  CreateVaultInput,
  ResetPinInput,
  UnlockInput,
  UnlockKind,
  VaultResult,
  VaultStatus,
} from '@zero/types';

export function getStatus(): VaultStatus {
  const auth = loadAuthState();
  return statusFrom(auth, vaultStorage.exists(), !vaultSession().isUnlocked());
}

export function isUnlocked(): boolean {
  return vaultSession().isUnlocked();
}

/** Rearma a trava automática (chamado a cada operação bem-sucedida). */
export function touch(): void {
  vaultSession().touch();
}

/** Bloqueia o cofre: a chave sai da memória e o auto-lock é cancelado. */
export function lock(): VaultStatus {
  vaultSession().wipe();
  return getStatus();
}

/** Chave da sessão corrente; lança o erro localizado se o cofre estiver bloqueado. */
export function requireSessionKey(): Buffer {
  return vaultSession().requireKey();
}

function fail(error: string): VaultResult {
  return { ok: false, error, status: getStatus() };
}

/**
 * Migração incremental do custo do Argon2id: reembrulha o método recém-usado
 * com o perfil atual se o gravado for mais fraco. Só quem detém a credencial
 * consegue reembrulhar, então cada método sobe no próprio desbloqueio (um
 * cofre v2 vai a v3 aos poucos). Best-effort: sem permissão de escrita agora a
 * migração espera a próxima desbloqueada, sem derrubar o desbloqueio.
 */
async function upgradeMethod(
  container: VaultContainerData,
  kind: UnlockKind,
  credential: string,
  vaultKey: Buffer,
): Promise<void> {
  const unwrapper = keyUnwrapperFor(kind);
  const current = container.methods[kind];
  if (current === undefined || isKdfUpToDate(kind, current)) return;
  try {
    container.methods[kind] = await unwrapper.wrap(vaultKey, credential);
    vaultStorage.writeContainer(container);
  } catch {
    // escrita indisponível (ex.: sem sudo em /var/lib); tenta na próxima vez
  }
}

/** Cria o cofre com frase de recuperação escrita pelo próprio usuário. */
export async function createVault(input: CreateVaultInput): Promise<VaultResult> {
  const m = currentMessages();
  if (!validateMasterPasswordFormat(input.masterPassword)) {
    return { ok: false, error: m.errors.invalidMasterLength, status: getStatus() };
  }
  // revalida a força aqui: o renderer é conveniência, não é fronteira de segurança
  if (strengthFor('master').evaluate(input.masterPassword).blocked) {
    return { ok: false, error: m.errors.trivialMaster, status: getStatus() };
  }
  if (!validatePinFormat(input.pin)) {
    return { ok: false, error: m.errors.invalidPin, status: getStatus() };
  }
  if (strengthFor('pin').evaluate(input.pin).blocked) {
    return { ok: false, error: m.errors.trivialPin, status: getStatus() };
  }
  const recoveryPhrase = normalizeRecoveryPhrase(input.recoveryPhrase);
  if (recoveryPhrase.split(' ').length < RECOVERY_MIN_WORDS) {
    return { ok: false, error: m.errors.invalidRecovery, status: getStatus() };
  }
  if (strengthFor('phrase').evaluate(recoveryPhrase).blocked) {
    return { ok: false, error: m.errors.trivialPhrase, status: getStatus() };
  }
  if (vaultStorage.exists()) return { ok: false, error: m.errors.vaultExists, status: getStatus() };

  try {
    vaultStorage.ensureStructure();
  } catch (error) {
    if (!vaultStorage.isDirUnavailable(error)) {
      const message = error instanceof Error ? error.message : m.errors.internal;
      return { ok: false, error: message, status: getStatus() };
    }
    // sem permissão em /var/lib: abre o diálogo do sistema (pkexec) e tenta de novo
    if (!setupVaultDirectory()) {
      return { ok: false, error: m.errors.vaultAuthCancelled, status: getStatus() };
    }
    try {
      vaultStorage.ensureStructure();
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : m.errors.internal;
      return { ok: false, error: message, status: getStatus() };
    }
    // a raiz agora existe: refaz a checagem (migra cofre antigo, se houver)
    if (vaultStorage.exists()) {
      return { ok: false, error: m.errors.vaultExists, status: getStatus() };
    }
  }
  const vaultKey = vaultStorage.createKey();

  // um embrulho por tipo de credencial (Factory Method), cada um com seu custo
  const methods: VaultContainerData['methods'] = {
    master: await keyUnwrapperFor('master').wrap(vaultKey, input.masterPassword),
    pin: await keyUnwrapperFor('pin').wrap(vaultKey, input.pin),
    recovery: await keyUnwrapperFor('recovery').wrap(vaultKey, recoveryPhrase),
  };

  const container: VaultContainerData = {
    createdAt: Date.now(),
    // informativo (v3 guarda o custo por método): o perfil mais caro do cofre
    kdf: keyUnwrapperFor('pin').kdf,
    attempts: 0,
    lockUntil: null,
    methods,
    manifest: null,
  };
  vaultStorage.writeContainer(container);
  // sella o manifesto vazio e entrega a chave à sessão (Singleton)
  vaultStorage.initManifest(vaultKey);
  vaultSession().adopt(vaultKey);

  return { ok: true, status: getStatus() };
}

/**
 * Desbloqueia o cofre com senha mestra ou PIN. A cadeia de manipuladores
 * (`src/main/unlock.ts`) decide: trava exponencial, formato, Argon2id e
 * integridade, nesta ordem de custo.
 */
export async function unlock(input: UnlockInput): Promise<VaultResult> {
  const m = currentMessages();
  const container = vaultStorage.readContainer();
  if (container === null) return fail(m.errors.vaultMissing);

  const context: UnlockContext = { input, container };
  const rejected = await runUnlockChain(context);
  if (rejected !== null) return rejected;
  const vaultKey = context.vaultKey;
  if (vaultKey === undefined) return fail(m.errors.internal);

  await upgradeMethod(container, input.kind, input.credential, vaultKey);

  // a chave nova assume a sessão (zerando a anterior) no Singleton
  vaultSession().adopt(vaultKey);
  vaultStorage.initManifest(vaultKey);
  resetAttempts();
  return { ok: true, status: getStatus() };
}

/**
 * Redefine o PIN provando posse da frase de recuperação (único uso da frase).
 * Em caso de sucesso o cofre já sai desbloqueado com o novo PIN.
 */
export async function resetPin(input: ResetPinInput): Promise<VaultResult> {
  const m = currentMessages();
  const container = vaultStorage.readContainer();
  if (container === null) return fail(m.errors.vaultMissing);

  const locked = getLockRemainingMs(loadAuthState());
  if (locked > 0) {
    return fail(m.auth.lockout(formatCountdown(locked)));
  }
  if (!validatePinFormat(input.newPin)) return fail(m.errors.invalidPin);
  if (strengthFor('pin').evaluate(input.newPin).blocked) return fail(m.errors.trivialPin);

  const method = container.methods.recovery;
  if (method === undefined) return fail(m.errors.wrongRecovery);

  const recovery = keyUnwrapperFor('recovery');
  try {
    const phrase = normalizeRecoveryPhrase(input.phrase);
    if (phrase.split(' ').length < RECOVERY_MIN_WORDS) throw new Error('frase curta');
    const derived = await recovery.derive(method, phrase);
    const vaultKey = recovery.unwrap(method, derived);
    derived.fill(0);

    container.methods.pin = await keyUnwrapperFor('pin').wrap(vaultKey, input.newPin);
    // a frase está na mão: aproveita para subir o custo do método de recuperação
    if (!isKdfUpToDate('recovery', method)) {
      container.methods.recovery = await recovery.wrap(vaultKey, phrase);
    }
    vaultStorage.writeContainer(container);

    // a chave nova assume a sessão (zerando a anterior) no Singleton
    vaultSession().adopt(vaultKey);
    vaultStorage.initManifest(vaultKey);
    resetAttempts();
    return { ok: true, status: getStatus() };
  } catch {
    const auth = registerFailedAttempt();
    return { ok: false, error: m.errors.wrongRecovery, status: statusFrom(auth, true, true) };
  }
}
