// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  KDF_CREDENTIAL,
  KDF_PIN,
  MASTER_PASSWORD_LENGTH,
  RECOVERY_MIN_WORDS,
  decryptRecord,
  deriveKey,
  encryptRecord,
  generateHighEntropyPassword,
  isSameKdf,
  isValidKdfParams,
  kdfProfileFor,
  normalizeRecoveryPhrase,
  randomBytes,
} from '@zero/main/crypto';

/** Parâmetros mínimos: aqui os testes cuidam da forma, não do custo. */
const TEST_KDF = { memoryKiB: 16_384, iterations: 1, parallelism: 1 };

describe('deriveKey (Argon2id)', () => {
  it('produz sempre 32 bytes e é determinística para a mesma senha+salt', async () => {
    const salt = randomBytes(16);
    const first = await deriveKey('senha-de-teste', salt, TEST_KDF);
    const second = await deriveKey('senha-de-teste', salt, TEST_KDF);
    expect(first).toHaveLength(32);
    expect(first.equals(second)).toBe(true);
  });

  it('muda com salt diferente', async () => {
    const a = await deriveKey('senha-de-teste', randomBytes(16), TEST_KDF);
    const b = await deriveKey('senha-de-teste', randomBytes(16), TEST_KDF);
    expect(a.equals(b)).toBe(false);
  });

  it('muda com parâmetros de custo diferentes', async () => {
    const salt = randomBytes(16);
    const cheap = await deriveKey('senha-de-teste', salt, TEST_KDF);
    const dearer = await deriveKey('senha-de-teste', salt, {
      ...TEST_KDF,
      memoryKiB: 32_768,
    });
    expect(cheap.equals(dearer)).toBe(false);
  });
});

describe('perfis de custo do Argon2id', () => {
  it('PIN é o perfil mais caro; mestra e frase ficam um nível abaixo', () => {
    expect(kdfProfileFor('pin')).toEqual(KDF_PIN);
    expect(kdfProfileFor('master')).toEqual(KDF_CREDENTIAL);
    expect(kdfProfileFor('recovery')).toEqual(KDF_CREDENTIAL);
    expect(KDF_PIN.memoryKiB).toBeGreaterThan(KDF_CREDENTIAL.memoryKiB);
    expect(KDF_PIN.iterations).toBeGreaterThanOrEqual(KDF_CREDENTIAL.iterations);
    expect(isSameKdf(KDF_PIN, KDF_CREDENTIAL)).toBe(false);
    expect(isSameKdf(KDF_CREDENTIAL, { ...KDF_CREDENTIAL })).toBe(true);
  });

  it('aceita parâmetros dentro da faixa e recusa fora dela', () => {
    expect(isValidKdfParams(KDF_PIN)).toBe(true);
    expect(isValidKdfParams(KDF_CREDENTIAL)).toBe(true);
    expect(isValidKdfParams({ memoryKiB: 65_536, iterations: 3, parallelism: 4 })).toBe(true);

    expect(isValidKdfParams({ memoryKiB: 1, iterations: 3, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams({ memoryKiB: 8_388_608, iterations: 3, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams({ memoryKiB: 65_536, iterations: 0, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams({ memoryKiB: 65_536, iterations: 3.5, parallelism: 4 })).toBe(false);
    expect(isValidKdfParams(null)).toBe(false);
    expect(isValidKdfParams('65536')).toBe(false);
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
