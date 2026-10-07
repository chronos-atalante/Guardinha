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
        kdfSalt: 'aa'.repeat(16),
        payload: {
          salt: 'bb'.repeat(16),
          iv: 'cc'.repeat(16),
          tag: 'dd'.repeat(16),
          encryptedData: 'ee11',
        },
      },
      pin: {
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
