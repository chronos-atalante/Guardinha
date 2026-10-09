import { MASTER_PASSWORD_LENGTH, PIN_LENGTH } from '@zero/main/crypto';
import { readAuthState, writeAuthState } from '@zero/main/storage';
import type { PersistedAuthState } from '@zero/main/storage';
import type { VaultStatus } from '@zero/types';

const PENALTY_DELAYS_SECONDS = [10, 30, 60, 3600, 86400]; // 10s, 30s, 1m, 1h, 24h

export function loadAuthState(): PersistedAuthState {
  return readAuthState();
}

/** Visão do cofre para a interface: existe, está travado e quanto falta da espera. */
export function statusFrom(
  auth: PersistedAuthState,
  exists: boolean,
  locked: boolean,
): VaultStatus {
  return {
    exists,
    locked,
    attempts: auth.attempts,
    lockUntil: auth.lockUntil,
    lockRemainingMs: getLockRemainingMs(auth),
  };
}

export function calculateLockout(attemptCount: number): number {
  const index = Math.min(attemptCount - 1, PENALTY_DELAYS_SECONDS.length - 1);
  const delaySec = PENALTY_DELAYS_SECONDS[Math.max(0, index)] ?? 10;
  return Date.now() + delaySec * 1000;
}

export function getLockRemainingMs(state: PersistedAuthState): number {
  if (state.lockUntil === null) return 0;
  return Math.max(0, state.lockUntil - Date.now());
}

/** Registra tentativa fallhada e aplica trava exponencial. */
export function registerFailedAttempt(): PersistedAuthState {
  const state = readAuthState();
  const attempts = state.attempts + 1;
  const next: PersistedAuthState = {
    attempts,
    lockUntil: calculateLockout(attempts),
  };
  writeAuthState(next);
  return next;
}

export function resetAttempts(): void {
  writeAuthState({ attempts: 0, lockUntil: null });
}

export function validateMasterPasswordFormat(password: string): boolean {
  return password.length === MASTER_PASSWORD_LENGTH;
}

export function validatePinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function validateUsernameFormat(username: string): boolean {
  if (username === '') return true;
  // Permite palavra simples, kebab-case ou snake_case
  const validPattern = /^[a-z0-9]+([-_][a-z0-9]+)*$/i;
  return validPattern.test(username);
}

export function validateDomainFormat(domain: string): boolean {
  if (domain === '') return true;
  return /^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(domain) || /^https?:\/\//i.test(domain);
}
