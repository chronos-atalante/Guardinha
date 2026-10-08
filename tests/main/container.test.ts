// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isLegacyEntryPayload,
  openManifest,
  packEntryPayload,
  packVaultContainer,
  sealManifest,
  unpackEntryPayload,
  unpackVaultContainer,
} from '@zero/main/container';
import { encryptRecord, randomBytes } from '@zero/main/crypto';
import type { VaultContainerData } from '@zero/main/container';

function sampleContainer(): VaultContainerData {
  return {
    createdAt: 1_767_268_800_000,
    kdf: { algo: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 4 },
    attempts: 2,
    lockUntil: 1_767_268_810_000,
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
    },
    manifest: {
      salt: 'ff'.repeat(16),
      iv: '00'.repeat(16),
      tag: '99'.repeat(16),
      encryptedData: 'ab',
    },
  };
}

/**
 * Reescreve um container v3 no layout v2 (sem o KDF por método), que é como os
 * cofres antigos ficavam em disco.
 */
function downgradeToV2(packed: Buffer): Buffer {
  const flags = packed.readUInt8(44);
  const parts: Buffer[] = [packed.subarray(0, 45)];
  let cursor = 45;
  for (const flag of [0x01, 0x02, 0x04]) {
    if ((flags & flag) === 0) continue;
    cursor += 12; // descarta o KDF por método; sobra salt + payload (layout v2)
    const payload = cursor + 16;
    const textLength = packed.readUInt32BE(payload + 48);
    const end = payload + 52 + textLength;
    parts.push(packed.subarray(cursor, end));
    cursor = end;
  }
  parts.push(packed.subarray(cursor));
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

  it('grava na versão 3, com o custo do Argon2id de cada método', () => {
    const data = sampleContainer();
    const master = data.methods.master;
    const pin = data.methods.pin;
    if (master === undefined || pin === undefined) throw new Error('fixture incompleta');

    const packed = packVaultContainer(data);
    expect(packed.readUInt32BE(8)).toBe(3);
    expect(packed.readUInt32BE(45)).toBe(131_072); // master: 128 MiB
    expect(packed.readUInt32BE(49)).toBe(3);
    const pinOffset = 45 + 12 + 16 + 52 + Buffer.from(master.payload.encryptedData, 'hex').length;
    expect(packed.readUInt32BE(pinOffset)).toBe(262_144); // pin: 256 MiB
    expect(packed.readUInt32BE(pinOffset + 4)).toBe(4);
    expect(pin.kdf.memoryKiB).toBe(262_144);
  });

  it('lê a versão 2 herdando o KDF global do cabeçalho', () => {
    const data = sampleContainer();
    const pin = data.methods.pin;
    if (pin === undefined) throw new Error('fixture incompleta');

    const legacyBuffer = downgradeToV2(packVaultContainer(data));
    const legacy = unpackVaultContainer(legacyBuffer);
    expect(legacy).not.toBeNull();
    if (legacy === null) return;
    expect(legacy.kdf).toEqual(data.kdf);
    expect(legacy.createdAt).toBe(data.createdAt);
    expect(legacy.manifest).toEqual(data.manifest);
    expect(legacy.methods.master?.kdf).toEqual(data.kdf);
    expect(legacy.methods.pin?.kdf).toEqual(data.kdf);
    expect(legacy.methods.pin?.kdfSalt).toBe(pin.kdfSalt);
    expect(legacy.methods.pin?.payload).toEqual(pin.payload);
    // gravar de novo sobe para v3 com o custo correto de cada método
    expect(packVaultContainer(legacy).readUInt32BE(8)).toBe(3);
  });

  it('recusa parâmetro KDF fora da faixa (cabeçalho ou método)', () => {
    const packed = packVaultContainer(sampleContainer());

    const hugeHeader = Buffer.from(packed);
    hugeHeader.writeUInt32BE(4_294_967_295, 20);
    expect(unpackVaultContainer(hugeHeader)).toBeNull();

    const hugeMethod = Buffer.from(packed);
    hugeMethod.writeUInt32BE(4_294_967_295, 45);
    expect(unpackVaultContainer(hugeMethod)).toBeNull();

    const zeroIterations = Buffer.from(packed);
    zeroIterations.writeUInt32BE(0, 49);
    expect(unpackVaultContainer(zeroIterations)).toBeNull();
  });

  it('recusa gravar parâmetro KDF fora da faixa', () => {
    const data = sampleContainer();
    const pin = data.methods.pin;
    if (pin === undefined) throw new Error('fixture incompleta');
    data.methods.pin = {
      ...pin,
      kdf: { algo: 'argon2id', memoryKiB: 1, iterations: 1, parallelism: 1 },
    };
    expect(() => packVaultContainer(data)).toThrow('parâmetros KDF inválidos');
  });

  it('recusa mágica inválida, versão desconhecida e lixo no fim', () => {
    const packed = packVaultContainer(sampleContainer());

    const badMagic = Buffer.from(packed);
    badMagic.write('XXXXXXXX', 0, 'ascii');
    expect(unpackVaultContainer(badMagic)).toBeNull();

    const badVersion = Buffer.from(packed);
    badVersion.writeUInt32BE(99, 8);
    expect(unpackVaultContainer(badVersion)).toBeNull();

    expect(unpackVaultContainer(Buffer.concat([packed, Buffer.from([0])]))).toBeNull();
  });

  it('recusa truncamento e byte adulterado no cabeçalho', () => {
    const packed = packVaultContainer(sampleContainer());
    expect(unpackVaultContainer(packed.subarray(0, packed.length - 3))).toBeNull();

    const flipped = Buffer.from(packed);
    flipped.writeUInt32BE(0, 0); // quebra a mágica
    expect(unpackVaultContainer(flipped)).toBeNull();
  });

  it('recusa container sem nenhum método de desbloqueio', () => {
    const data = sampleContainer();
    data.methods = {};
    expect(unpackVaultContainer(packVaultContainer(data))).toBeNull();
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
