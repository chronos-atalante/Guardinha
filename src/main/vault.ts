import {
  deriveKey,
  decryptRecord,
  encryptRecord,
  isSameKdf,
  kdfProfileFor,
  normalizeRecoveryPhrase,
  randomBytes,
  RECOVERY_MIN_WORDS,
} from '@zero/main/crypto';
import {
  getLockRemainingMs,
  loadAuthState,
  registerFailedAttempt,
  resetAttempts,
  validateMasterPasswordFormat,
  validatePinFormat,
} from '@zero/main/auth';
import { vaultStorage } from '@zero/main/facade';
import { vaultSession } from '@zero/main/session';
import { setupVaultDirectory } from '@zero/main/privilege';
import { evaluateMaster, evaluatePhrase, evaluatePin } from '@zero/shared';
import { currentMessages } from '@zero/main/i18n';
import type { VaultContainerData, VaultKdfParams, WrappedMethod } from '@zero/main/container';
import type { PersistedAuthState } from '@zero/main/storage';
import type {
  CreateVaultInput,
  ResetPinInput,
  UnlockInput,
  UnlockKind,
  VaultResult,
  VaultStatus,
} from '@zero/types';

/**
 * Custo do Argon2id para um método de desbloqueio: o PIN de 8 dígitos é o
 * segredo fraco (10^8 candidatas offline) e por isso recebe o perfil mais caro;
 * senha mestra e frase de recuperação têm entropia própria, um nível abaixo.
 */
function kdfFor(kind: UnlockKind | 'recovery'): VaultKdfParams {
  return { algo: 'argon2id', ...kdfProfileFor(kind) };
}

function statusFrom(auth: PersistedAuthState, exists: boolean, locked: boolean): VaultStatus {
  return {
    exists,
    locked,
    attempts: auth.attempts,
    lockUntil: auth.lockUntil,
    lockRemainingMs: getLockRemainingMs(auth),
  };
}

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

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

function fail(error: string): VaultResult {
  return { ok: false, error, status: getStatus() };
}

async function wrapKey(
  vaultKey: Buffer,
  credential: string,
  kdf: VaultKdfParams,
): Promise<WrappedMethod> {
  const kdfSalt = randomBytes(16);
  const derived = await deriveKey(credential, kdfSalt, kdf);
  const payload = encryptRecord({ key: vaultKey.toString('hex') }, derived);
  derived.fill(0);
  return { kdf, kdfSalt: kdfSalt.toString('hex'), payload };
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
  const target = kdfFor(kind);
  const current = container.methods[kind];
  if (current === undefined || isSameKdf(current.kdf, target)) return;
  try {
    container.methods[kind] = await wrapKey(vaultKey, credential, target);
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
  if (evaluateMaster(input.masterPassword).blocked) {
    return { ok: false, error: m.errors.trivialMaster, status: getStatus() };
  }
  if (!validatePinFormat(input.pin)) {
    return { ok: false, error: m.errors.invalidPin, status: getStatus() };
  }
  if (evaluatePin(input.pin).blocked) {
    return { ok: false, error: m.errors.trivialPin, status: getStatus() };
  }
  const recoveryPhrase = normalizeRecoveryPhrase(input.recoveryPhrase);
  if (recoveryPhrase.split(' ').length < RECOVERY_MIN_WORDS) {
    return { ok: false, error: m.errors.invalidRecovery, status: getStatus() };
  }
  if (evaluatePhrase(recoveryPhrase).blocked) {
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

  const methods: VaultContainerData['methods'] = {
    master: await wrapKey(vaultKey, input.masterPassword, kdfFor('master')),
    pin: await wrapKey(vaultKey, input.pin, kdfFor('pin')),
    recovery: await wrapKey(vaultKey, recoveryPhrase, kdfFor('recovery')),
  };

  const container: VaultContainerData = {
    createdAt: Date.now(),
    // informativo (v3 guarda o custo por método): o perfil mais caro do cofre
    kdf: kdfFor('pin'),
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

function wrongCredentialError(kind: UnlockKind): string {
  const m = currentMessages();
  if (kind === 'master') return m.errors.wrongMaster;
  return m.errors.wrongPin;
}

/** Desbloqueia o cofre com senha mestra ou PIN. */
export async function unlock(input: UnlockInput): Promise<VaultResult> {
  const m = currentMessages();
  const container = vaultStorage.readContainer();
  if (container === null) return fail(m.errors.vaultMissing);

  const locked = getLockRemainingMs(loadAuthState());
  if (locked > 0) {
    return fail(m.auth.lockout(formatCountdown(locked)));
  }

  const method = container.methods[input.kind];
  const wrong = wrongCredentialError(input.kind);
  if (method === undefined) {
    registerFailedAttempt();
    return fail(wrong);
  }

  try {
    const derived = await deriveKey(
      input.credential,
      Buffer.from(method.kdfSalt, 'hex'),
      method.kdf,
    );
    const unwrapped = decryptRecord(method.payload, derived);
    derived.fill(0);
    if (!('key' in unwrapped) || typeof unwrapped.key !== 'string' || unwrapped.key.length !== 64) {
      throw new Error('container corrompido');
    }

    const vaultKey = Buffer.from(unwrapped.key, 'hex');
    await upgradeMethod(container, input.kind, input.credential, vaultKey);

    // a chave nova assume a sessão (zerando a anterior) no Singleton
    vaultSession().adopt(vaultKey);
    vaultStorage.initManifest(vaultKey);
    resetAttempts();
    return { ok: true, status: getStatus() };
  } catch {
    const auth = registerFailedAttempt();
    return { ok: false, error: wrong, status: statusFrom(auth, true, true) };
  }
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
  if (evaluatePin(input.newPin).blocked) return fail(m.errors.trivialPin);

  const method = container.methods.recovery;
  if (method === undefined) return fail(m.errors.wrongRecovery);

  try {
    const phrase = normalizeRecoveryPhrase(input.phrase);
    if (phrase.split(' ').length < RECOVERY_MIN_WORDS) throw new Error('frase curta');
    const derived = await deriveKey(phrase, Buffer.from(method.kdfSalt, 'hex'), method.kdf);
    const unwrapped = decryptRecord(method.payload, derived);
    derived.fill(0);
    if (!('key' in unwrapped) || typeof unwrapped.key !== 'string' || unwrapped.key.length !== 64) {
      throw new Error('container corrompido');
    }

    const vaultKey = Buffer.from(unwrapped.key, 'hex');
    container.methods.pin = await wrapKey(vaultKey, input.newPin, kdfFor('pin'));
    // a frase está na mão: aproveita para subir o custo do método de recuperação
    const recovery = container.methods.recovery;
    if (recovery !== undefined && !isSameKdf(recovery.kdf, kdfFor('recovery'))) {
      container.methods.recovery = await wrapKey(vaultKey, phrase, kdfFor('recovery'));
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
