// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateLockout,
  getLockRemainingMs,
  loadAuthState,
  registerFailedAttempt,
  resetAttempts,
  validateDomainFormat,
  validateMasterPasswordFormat,
  validatePinFormat,
  validateUsernameFormat,
} from '@zero/main/auth';

const BASE = new Date('2026-01-01T12:00:00Z').getTime();

afterEach(() => {
  resetAttempts();
  vi.useRealTimers();
});

describe('trava exponencial', () => {
  it('escala 10s, 30s, 1m, 1h, 24h e trava no teto', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    expect(calculateLockout(1)).toBe(BASE + 10_000);
    expect(calculateLockout(2)).toBe(BASE + 30_000);
    expect(calculateLockout(3)).toBe(BASE + 60_000);
    expect(calculateLockout(4)).toBe(BASE + 3_600_000);
    expect(calculateLockout(5)).toBe(BASE + 86_400_000);
    expect(calculateLockout(99)).toBe(BASE + 86_400_000);
  });

  it('registerFailedAttempt incrementa e persiste o lockUntil', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    const first = registerFailedAttempt();
    expect(first.attempts).toBe(1);
    expect(first.lockUntil).toBe(BASE + 10_000);
    expect(loadAuthState()).toEqual(first);

    vi.setSystemTime(BASE + 15_000);
    const second = registerFailedAttempt();
    expect(second.attempts).toBe(2);
    expect(second.lockUntil).toBe(BASE + 15_000 + 30_000);
  });

  it('resetAttempts limpa a trava', () => {
    registerFailedAttempt();
    resetAttempts();
    expect(loadAuthState()).toEqual({ attempts: 0, lockUntil: null });
  });

  it('getLockRemainingMs zera após o prazo e ignora lockUntil nulo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    registerFailedAttempt();
    expect(getLockRemainingMs(loadAuthState())).toBe(10_000);
    vi.setSystemTime(BASE + 11_000);
    expect(getLockRemainingMs(loadAuthState())).toBe(0);
    expect(getLockRemainingMs({ attempts: 0, lockUntil: null })).toBe(0);
  });
});

describe('validações de formato', () => {
  it('senha mestra: exatamente 24 caracteres', () => {
    expect(validateMasterPasswordFormat('senha-mestra-de-zena-24c')).toBe(true);
    expect(validateMasterPasswordFormat('curta')).toBe(false);
    expect(validateMasterPasswordFormat('senha-mestra-de-zena-24cx')).toBe(false);
  });

  it('PIN: exatamente 8 dígitos', () => {
    expect(validatePinFormat('49201733')).toBe(true);
    expect(validatePinFormat('4920173')).toBe(false);
    expect(validatePinFormat('4920173a')).toBe(false);
    expect(validatePinFormat('4920 733')).toBe(false);
  });

  it('usuário: palavra, kebab-case ou snake_case', () => {
    expect(validateUsernameFormat('')).toBe(true);
    expect(validateUsernameFormat('chronos')).toBe(true);
    expect(validateUsernameFormat('chronos-atalante')).toBe(true);
    expect(validateUsernameFormat('chronos_atalante')).toBe(true);
    expect(validateUsernameFormat('Chronos Atalante')).toBe(false);
    expect(validateUsernameFormat('-inválido')).toBe(false);
  });

  it('domínio: hostname simples ou URL', () => {
    expect(validateDomainFormat('')).toBe(true);
    expect(validateDomainFormat('example.com')).toBe(true);
    expect(validateDomainFormat('sub.example.com.br')).toBe(true);
    expect(validateDomainFormat('https://example.com/path')).toBe(true);
    expect(validateDomainFormat('não é domínio')).toBe(false);
  });
});
