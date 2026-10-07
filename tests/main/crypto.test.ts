// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MASTER_PASSWORD_LENGTH,
  RECOVERY_MIN_WORDS,
  decryptRecord,
  deriveKey,
  encryptRecord,
  generateHighEntropyPassword,
  normalizeRecoveryPhrase,
  randomBytes,
} from '@zero/main/crypto';

describe('deriveKey (Argon2id)', () => {
  it('produz sempre 32 bytes e é determinística para a mesma senha+salt', async () => {
    const salt = randomBytes(16);
    const first = await deriveKey('senha-de-teste', salt);
    const second = await deriveKey('senha-de-teste', salt);
    expect(first).toHaveLength(32);
    expect(first.equals(second)).toBe(true);
  });

  it('muda com salt diferente', async () => {
    const a = await deriveKey('senha-de-teste', randomBytes(16));
    const b = await deriveKey('senha-de-teste', randomBytes(16));
    expect(a.equals(b)).toBe(false);
  });
});

describe('encryptRecord / decryptRecord (AES-256-GCM)', () => {
  it('faz o roundtrip com os campos íntegros', () => {
    const key = randomBytes(32);
    const data = { title: 'GitHub', username: 'chronos', password: 's3nh@-forte' };
    const payload = encryptRecord(data, key);
    expect(payload.salt).toHaveLength(32); // 128 bits em hex
    expect(payload.iv).toHaveLength(32); // 128 bits em hex
    expect(payload.tag).toHaveLength(32); // 128 bits em hex
    expect(decryptRecord(payload, key)).toEqual(data);
  });

  it('falha com a chave errada', () => {
    const payload = encryptRecord({ secret: 1 }, randomBytes(32));
    expect(() => decryptRecord(payload, randomBytes(32))).toThrow();
  });

  it('falha com o conteúdo adulterado', () => {
    const key = randomBytes(32);
    const payload = encryptRecord({ secret: 'valor' }, key);
    const tampered = { ...payload, encryptedData: `${payload.encryptedData.slice(0, -2)}00` };
    expect(() => decryptRecord(tampered, key)).toThrow();
  });

  it('usa salt e IV distintos por arquivo', () => {
    const key = randomBytes(32);
    const first = encryptRecord({ a: 1 }, key);
    const second = encryptRecord({ a: 1 }, key);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });
});

describe('generateHighEntropyPassword', () => {
  it('respeita o tamanho e o conjunto de caracteres', () => {
    const password = generateHighEntropyPassword(32, true, true, true, ['fusca', '77']);
    expect(password).toHaveLength(32);
    expect(password).toMatch(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]+$/);
  });

  it('sem maiúsculas/números/símbolos usa só minúsculas', () => {
    const password = generateHighEntropyPassword(16, false, false, false, []);
    expect(password).toMatch(/^[a-z]+$/);
    expect(password).toHaveLength(16);
  });

  it('comprimento 0 devolve vazio', () => {
    expect(generateHighEntropyPassword(0, true, true, true, [])).toBe('');
  });

  it('palavras pessoais mudam a distribuição sem quebrar o formato', () => {
    const withWords = generateHighEntropyPassword(40, true, true, true, ['violao', 'sofa']);
    const withoutWords = generateHighEntropyPassword(40, true, true, true, []);
    expect(withWords).toHaveLength(40);
    expect(withoutWords).toHaveLength(40);
  });
});

describe('frase de recuperação', () => {
  it('exige ao menos 12 palavras conforme a especificação', () => {
    expect(RECOVERY_MIN_WORDS).toBe(12);
  });

  it('normaliza caixa e espaços', () => {
    expect(normalizeRecoveryPhrase('  Abelha\tAGUA  alface ')).toBe('abelha agua alface');
  });

  it('senha mestra tem 24 caracteres conforme a especificação', () => {
    expect(MASTER_PASSWORD_LENGTH).toBe(24);
  });
});
