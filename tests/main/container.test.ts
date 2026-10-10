// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FLAG_PANIC,
  isLegacyEntryPayload,
  openManifest,
  packEntryPayload,
  packVaultContainer,
  sealManifest,
  unpackEntryPayload,
  unpackVaultContainer,
} from '@zero/main/container';
import { encryptRecord, randomBytes } from '@zero/main/crypto';
import type { VaultContainerData, WrappedMethod } from '@zero/main/container';

const METHOD_FLAGS_V4 = [0x01, 0x02, 0x04, FLAG_PANIC] as const;

function sampleContainer(): VaultContainerData {
  return {
    createdAt: 1_767_268_800_000,
    kdf: { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 },
    attempts: 2,
    lockUntil: 1_767_268_810_000,
    attemptsMaster: 1,
    nukeLimit: 0,
    methods: {
      master: {
        kdf: { algo: 'argon2id', memoryKiB: 131_072, iterations: 3, parallelism: 4 },
        kdfSalt: 'aa'.repeat(16),
        payload: {
          salt: 'bb'.repeat(16),
          iv: 'cc'.repeat(16),
          tag: 'dd'.repeat(16),
          encryptedData: 'ee11',
        },
      },
      pin: {
        kdf: { algo: 'argon2id', memoryKiB: 262_144, iterations: 4, parallelism: 4 },
        kdfSalt: '11'.repeat(16),
        payload: {
          salt: '22'.repeat(16),
          iv: '33'.repeat(16),
          tag: '44'.repeat(16),
          encryptedData: '556677',
        },
      },
      panic: {
        kdf: { algo: 'argon2id', memoryKiB: 262_144, iterations: 4, parallelism: 4 },
        kdfSalt: '5a'.repeat(16),
        payload: {
          salt: '6b'.repeat(16),
          iv: '7c'.repeat(16),
          tag: '8d'.repeat(16),
          encryptedData: '9e0f',
        },
      },
      recovery: {
        kdf: { algo: 'argon2id', memoryKiB: 131_072, iterations: 3, parallelism: 4 },
        kdfSalt: '1a'.repeat(16),
        payload: {
          salt: '2b'.repeat(16),
          iv: '3c'.repeat(16),
          tag: '4d'.repeat(16),
          encryptedData: '5e60',
        },
      },
    },
    manifest: {
      salt: 'ff'.repeat(16),
      iv: '00'.repeat(16),
      tag: '99'.repeat(16),
      encryptedData: 'ab',
    },
  };
}

/** Reconstroi um container novo a partir do empacotado, trocando a versão. */
function withVersion(packed: Buffer, version: number): Buffer {
  const out = Buffer.from(packed);
  out.writeUInt32BE(version, 8);
  return out;
}

/**
 * Reescreve um container v4 no layout v3 (cabeçalho de 45 bytes, sem
 * `attemptsMaster`/`nukeLimit`, sem o método de pânico): é como os cofres v3
 * ficaram em disco.
 */
function downgradeToV3(packed: Buffer): Buffer {
  const flags = packed.readUInt8(44) & ~FLAG_PANIC;
  // v3 e v4 têm o mesmo corpo (KDF por método antes de cada blob); o que muda
  // é o cabeçalho de 45 bytes e a ausência do método de pânico
  const parts: Buffer[] = [packed.subarray(0, 45)];
  let cursor = 53;
  // master, pin e recovery seguem inteiros; o blob do pânico é descartado
  for (const flag of [0x01, 0x02, 0x04, FLAG_PANIC]) {
    if ((packed.readUInt8(44) & flag) === 0) continue;
    const start = cursor;
    cursor += 12; // KDF por método
    const payload = cursor + 16;
    const end = payload + 52 + packed.readUInt32BE(payload + 48);
    if ((flags & flag) !== 0) parts.push(packed.subarray(start, end));
    cursor = end;
  }
  // o manifesto (flag 0x08) fica no fim: o cursor já aponta para ele
  parts.push(packed.subarray(cursor));
  const v3 = Buffer.concat(parts);
  v3.writeUInt8(flags, 44);
  v3.writeUInt32BE(3, 8);
  return v3;
}

/** Do v4 para o v2: além do cabeçalho, cada método perde o KDF próprio. */
function downgradeToV2(packed: Buffer): Buffer {
  const v3 = downgradeToV3(packed);
  const flags = v3.readUInt8(44);
  const parts: Buffer[] = [v3.subarray(0, 45)];
  let cursor = 45;
  for (const flag of [0x01, 0x02, 0x04]) {
    if ((flags & flag) === 0) continue;
    cursor += 12; // descarta o KDF por método; sobra salt + payload (layout v2)
    const payload = cursor + 16;
    const textLength = v3.readUInt32BE(payload + 48);
    const end = payload + 52 + textLength;
    parts.push(v3.subarray(cursor, end));
    cursor = end;
  }
  parts.push(v3.subarray(cursor));
  const v2 = Buffer.concat(parts);
  v2.writeUInt32BE(2, 8);
  return v2;
}

describe('container do cofre (vault.zkv)', () => {
  it('roundtrip preserva todos os campos', () => {
    const data = sampleContainer();
    const restored = unpackVaultContainer(packVaultContainer(data));
    expect(restored).toEqual(data);
  });

  it('roundtrip sem manifesto e com lockUntil nulo', () => {
    const data: VaultContainerData = { ...sampleContainer(), lockUntil: null, manifest: null };
    const restored = unpackVaultContainer(packVaultContainer(data));
    expect(restored).toEqual(data);
  });

  it('grava na versão 4, com cabeçalho de 53 bytes e o custo por método', () => {
    const data = sampleContainer();
    const master = data.methods.master;
    const pin = data.methods.pin;
    if (master === undefined || pin === undefined) throw new Error('fixture incompleta');

    const packed = packVaultContainer(data);
    expect(packed.readUInt32BE(8)).toBe(4);
    // campos novos da v4, logo depois da máscara de flags
    expect(packed.readUInt32BE(45)).toBe(1); // attemptsMaster
    expect(packed.readUInt32BE(49)).toBe(0); // nukeLimit desligado por padrão
    // e o primeiro bloco de método só começa depois dos 53 bytes
    expect(packed.readUInt32BE(53)).toBe(131_072); // master: 128 MiB
    expect(packed.readUInt32BE(57)).toBe(3);
    const pinOffset = 53 + 12 + 16 + 52 + Buffer.from(master.payload.encryptedData, 'hex').length;
    expect(packed.readUInt32BE(pinOffset)).toBe(262_144); // pin: 256 MiB
    expect(packed.readUInt32BE(pinOffset + 4)).toBe(4);
    expect(pin.kdf.memoryKiB).toBe(262_144);
  });

  it('nukeLimit e attemptsMaster guardam e recuperam o valor gravado', () => {
    const data: VaultContainerData = { ...sampleContainer(), attemptsMaster: 7, nukeLimit: 50 };
    const restored = unpackVaultContainer(packVaultContainer(data));
    expect(restored?.attemptsMaster).toBe(7);
    expect(restored?.nukeLimit).toBe(50);
  });

  it('preserva os dois campos com o valor zero (autodestrução desligada)', () => {
    const data: VaultContainerData = { ...sampleContainer(), attemptsMaster: 0, nukeLimit: 0 };
    const restored = unpackVaultContainer(packVaultContainer(data));
    expect(restored?.attemptsMaster).toBe(0);
    expect(restored?.nukeLimit).toBe(0);
  });

  it('grava e lê o método de pânico na v4', () => {
    const data = sampleContainer();
    const panic = data.methods.panic;
    if (panic === undefined) throw new Error('fixture incompleta');
    const restored = unpackVaultContainer(packVaultContainer(data));
    expect(packVaultContainer(data).readUInt8(44) & FLAG_PANIC).toBe(FLAG_PANIC);
    expect(restored?.methods.panic?.payload).toEqual(panic.payload);
    expect(restored?.methods.panic?.kdfSalt).toBe(panic.kdfSalt);
  });

  it('lê a versão 3 sem os campos novos, que valem zero', () => {
    const data = sampleContainer();
    const legacyBuffer = downgradeToV3(packVaultContainer(data));
    expect(legacyBuffer.length).toBeLessThan(packVaultContainer(data).length);

    const legacy = unpackVaultContainer(legacyBuffer);
    expect(legacy).not.toBeNull();
    if (legacy === null) return;
    expect(legacy.attempts).toBe(data.attempts);
    expect(legacy.lockUntil).toBe(data.lockUntil);
    expect(legacy.methods.master?.kdfSalt).toBe(data.methods.master?.kdfSalt);
    expect(legacy.methods.pin?.kdfSalt).toBe(data.methods.pin?.kdfSalt);
    // a v3 não tem como carregar attemptsMaster nem nukeLimit
    expect(legacy.attemptsMaster).toBe(0);
    expect(legacy.nukeLimit).toBe(0);
    expect(legacy.methods.panic).toBeUndefined();
    expect(legacy.manifest).toEqual(data.manifest);

    // gravar de novo sobe para v4 preservando o conteúdo
    const upgraded = packVaultContainer(legacy);
    expect(upgraded.readUInt32BE(8)).toBe(4);
    expect(unpackVaultContainer(upgraded)?.methods.pin?.payload).toEqual(data.methods.pin?.payload);
  });

  it('lê a versão 2 herdando o KDF global do cabeçalho', () => {
    const data = sampleContainer();
    const pin = data.methods.pin;
    if (pin === undefined) throw new Error('fixture incompleta');

    const legacy = unpackVaultContainer(downgradeToV2(packVaultContainer(data)));
    expect(legacy).not.toBeNull();
    if (legacy === null) return;
    expect(legacy.kdf).toEqual(data.kdf);
    expect(legacy.createdAt).toBe(data.createdAt);
    expect(legacy.manifest).toEqual(data.manifest);
    expect(legacy.methods.master?.kdf).toEqual(data.kdf);
    expect(legacy.methods.pin?.kdf).toEqual(data.kdf);
    expect(legacy.methods.pin?.kdfSalt).toBe(pin.kdfSalt);
    expect(legacy.methods.pin?.payload).toEqual(pin.payload);
    // gravar de novo sobe para v4 com o custo correto de cada método
    expect(packVaultContainer(legacy).readUInt32BE(8)).toBe(4);
  });

  it('recusa parâmetro KDF fora da faixa (cabeçalho ou método)', () => {
    const packed = packVaultContainer(sampleContainer());

    const hugeHeader = Buffer.from(packed);
    hugeHeader.writeUInt32BE(4_294_967_295, 20);
    expect(unpackVaultContainer(hugeHeader)).toBeNull();

    const hugeMethod = Buffer.from(packed);
    hugeMethod.writeUInt32BE(4_294_967_295, 53);
    expect(unpackVaultContainer(hugeMethod)).toBeNull();

    const zeroIterations = Buffer.from(packed);
    zeroIterations.writeUInt32BE(0, 57);
    expect(unpackVaultContainer(zeroIterations)).toBeNull();
  });

  it('recusa gravar parâmetro KDF fora da faixa', () => {
    const data = sampleContainer();
    const pin = data.methods.pin;
    if (pin === undefined) throw new Error('fixture incompleta');
    data.methods.pin = {
      ...pin,
      kdf: { algo: 'argon2id', memoryKiB: 1, iterations: 1, parallelism: 1 },
    } satisfies WrappedMethod;
    expect(() => packVaultContainer(data)).toThrow('parâmetros KDF inválidos');
  });

  it('recusa mágica inválida, versão desconhecida e lixo no fim', () => {
    const packed = packVaultContainer(sampleContainer());

    const badMagic = Buffer.from(packed);
    badMagic.write('XXXXXXXX', 0, 'ascii');
    expect(unpackVaultContainer(badMagic)).toBeNull();

    const badVersion = withVersion(packed, 99);
    expect(unpackVaultContainer(badVersion)).toBeNull();

    expect(unpackVaultContainer(Buffer.concat([packed, Buffer.from([0])]))).toBeNull();
  });

  it('recusa flag desconhecida, para um arquivo corrompido não entrar', () => {
    const packed = packVaultContainer(sampleContainer());
    const unknownFlag = Buffer.from(packed);
    unknownFlag.writeUInt8(unknownFlag.readUInt8(44) | 0x80, 44);
    expect(unpackVaultContainer(unknownFlag)).toBeNull();
  });

  it('recusa truncamento e byte adulterado no cabeçalho', () => {
    const packed = packVaultContainer(sampleContainer());
    expect(unpackVaultContainer(packed.subarray(0, packed.length - 3))).toBeNull();

    const flipped = Buffer.from(packed);
    flipped.writeUInt32BE(0, 0); // quebra a mágica
    expect(unpackVaultContainer(flipped)).toBeNull();
  });

  it('recusa um header da v4 cortado no meio dos campos novos', () => {
    const packed = packVaultContainer(sampleContainer());
    // cabeçalho de 45 bytes declarado como v4: os 8 bytes dos campos faltam
    expect(unpackVaultContainer(packed.subarray(0, 45))).toBeNull();
  });

  it('recusa container sem nenhum método de desbloqueio', () => {
    const data = sampleContainer();
    data.methods = {};
    expect(unpackVaultContainer(packVaultContainer(data))).toBeNull();
  });

  it('recusa container só com o método de pânico (ninguém abriria)', () => {
    const data = sampleContainer();
    const panic = data.methods.panic;
    if (panic === undefined) throw new Error('fixture incompleta');
    data.methods = { panic };
    expect(unpackVaultContainer(packVaultContainer(data))).toBeNull();
  });

  it('mantém o roundtrip de todas as flags conhecidas ligadas', () => {
    const data = sampleContainer();
    const packed = packVaultContainer(data);
    for (const flag of METHOD_FLAGS_V4) {
      expect(packed.readUInt8(44) & flag).toBe(flag);
    }
  });
});

describe('payload de entrada (.zke)', () => {
  it('roundtrip preserva salt, iv, tag e texto cifrado', () => {
    const payload = {
      salt: 'aa'.repeat(16),
      iv: 'bb'.repeat(16),
      tag: 'cc'.repeat(16),
      encryptedData: 'deadbeef',
    };
    expect(unpackEntryPayload(packEntryPayload(payload))).toEqual(payload);
  });

  it('recusa truncamento, byte extra e mágica errada', () => {
    const packed = packEntryPayload({
      salt: 'aa'.repeat(16),
      iv: 'bb'.repeat(16),
      tag: 'cc'.repeat(16),
      encryptedData: '00',
    });
    expect(unpackEntryPayload(packed.subarray(0, 20))).toBeNull();
    expect(unpackEntryPayload(Buffer.concat([packed, Buffer.from([0])]))).toBeNull();

    const badMagic = Buffer.from(packed);
    badMagic.write('ZZZZZZZZ', 0, 'ascii');
    expect(unpackEntryPayload(badMagic)).toBeNull();
  });

  it('detecta payload legado em JSON', () => {
    expect(isLegacyEntryPayload(Buffer.from('{"salt":"aa"}', 'utf8'))).toBe(true);
    expect(
      isLegacyEntryPayload(
        packEntryPayload({
          salt: 'aa'.repeat(16),
          iv: 'bb'.repeat(16),
          tag: 'cc'.repeat(16),
          encryptedData: '00',
        }),
      ),
    ).toBe(false);
  });
});

describe('manifesto de integridade', () => {
  it('roundtrip devolve os mesmos ids', () => {
    const key = randomBytes(32);
    const ids = ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'ffffffff-0000-4000-8000-000000000000'];
    expect(openManifest(key, sealManifest(key, ids))).toEqual(ids);
  });

  it('falha com a chave errada', () => {
    const key = randomBytes(32);
    const blob = sealManifest(key, ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']);
    expect(() => openManifest(randomBytes(32), blob)).toThrow();
  });

  it('falha com forma inesperada (fail-closed)', () => {
    const key = randomBytes(32);
    const notManifest = encryptRecord({ foo: 1 }, key);
    expect(() => openManifest(key, notManifest)).toThrow();
  });
});
