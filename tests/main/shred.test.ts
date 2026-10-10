// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shredDirectory, shredFile } from '@zero/main/shred';

const SECRET = 'guardinha-shred-prova-de-conteudo-original';

let root: string;
let target: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-shred-'));
  target = path.join(root, 'segredo.zke');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('shredFile', () => {
  it('apaga o arquivo e devolve true', () => {
    fs.writeFileSync(target, SECRET, { mode: 0o600 });
    expect(shredFile(target, 3)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('não deixa o conteúdo original durante a sobrescrita', () => {
    const large = Buffer.alloc(150_000, SECRET);
    fs.writeFileSync(target, large, { mode: 0o600 });
    const original = Buffer.from(large);

    // captura cada bloco gravado, na ordem, antes do unlink
    const written: Buffer[] = [];
    const realWrite = fs.writeSync.bind(fs);
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((
      fd: number,
      data: Uint8Array,
      offset?: number,
      length?: number,
      position?: number | null,
    ) => {
      written.push(Buffer.from(data.subarray(offset ?? 0, (offset ?? 0) + (length ?? 0))));
      return realWrite(fd, data, offset, length, position);
    }) as typeof fs.writeSync);

    const result = shredFile(target, 2);
    spy.mockRestore();

    expect(result).toBe(true);
    expect(written.length).toBeGreaterThan(0);
    // a primeira passada não pode conter nenhum trecho do conteúdo original
    const firstPass = Buffer.concat(written).subarray(0, original.length);
    expect(firstPass.includes(original)).toBe(false);
    expect(firstPass.equals(original)).toBe(false);
    // e a última passada é de zeros
    const lastPass = written[written.length - 1];
    expect(lastPass?.every((byte) => byte === 0)).toBe(true);
  });

  it('termina com a passada de zeros mesmo com número par de passadas', () => {
    fs.writeFileSync(target, 'conteudo', { mode: 0o600 });
    const written: Buffer[] = [];
    const realWrite = fs.writeSync.bind(fs);
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((
      fd: number,
      data: Uint8Array,
      offset?: number,
      length?: number,
      position?: number | null,
    ) => {
      written.push(Buffer.from(data.subarray(offset ?? 0, (offset ?? 0) + (length ?? 0))));
      return realWrite(fd, data, offset, length, position);
    }) as typeof fs.writeSync);

    shredFile(target, 4);
    spy.mockRestore();

    expect(written.at(-1)?.every((byte) => byte === 0)).toBe(true);
  });

  it('aceita o número de passadas em qualquer quantidade dentro do teto', () => {
    for (const passes of [1, 2, 3, 7, 16, 99, 0, -5, 2.7]) {
      fs.writeFileSync(target, 'conteudo', { mode: 0o600 });
      expect(shredFile(target, passes)).toBe(true);
      expect(fs.existsSync(target)).toBe(false);
    }
  });

  it('não segue symlink: o alvo continua intacto', () => {
    const real = path.join(root, 'real.txt');
    const link = path.join(root, 'atalho.txt');
    fs.writeFileSync(real, SECRET, { mode: 0o600 });
    fs.symlinkSync(real, link);

    expect(shredFile(link, 3)).toBe(false);
    expect(fs.existsSync(link)).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).toBe(SECRET);
  });

  it('devolve false sem lançar quando o caminho não existe', () => {
    expect(shredFile(path.join(root, 'nao-existe.zke'), 3)).toBe(false);
  });

  it('devolve false sem quebrar quando há um diretório no lugar do arquivo', () => {
    const dir = path.join(root, 'pasta');
    fs.mkdirSync(dir);
    expect(shredFile(dir, 3)).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('trata arquivo vazio sem travar', () => {
    fs.writeFileSync(target, '');
    expect(shredFile(target, 3)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('sobrescreve arquivo maior que um bloco, mantendo o tamanho', () => {
    const big = crypto.randomBytes(200_000);
    fs.writeFileSync(target, big, { mode: 0o600 });
    let observedSize = -1;
    const realFstat = fs.fstatSync.bind(fs);
    const spy = vi.spyOn(fs, 'fstatSync').mockImplementation((fd: number) => {
      const stat = realFstat(fd);
      observedSize = stat.size;
      return stat;
    });

    expect(shredFile(target, 1)).toBe(true);
    spy.mockRestore();

    expect(observedSize).toBe(big.length);
  });

  it('não imprime nada no console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fs.writeFileSync(target, SECRET, { mode: 0o600 });

    shredFile(target, 1);
    shredFile(path.join(root, 'nao-existe'), 1);

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
    log.mockRestore();
  });
});

describe('shredDirectory', () => {
  it('sobrescreve os arquivos e remove o diretório', () => {
    const dir = path.join(root, '.entries');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.zke'), SECRET, { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'b.enc'), SECRET, { mode: 0o600 });

    expect(shredDirectory(dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('devolve false quando o diretório não existe, sem lançar', () => {
    expect(shredDirectory(path.join(root, 'nao-existe'))).toBe(false);
  });

  it('não segue symlink dentro do diretório', () => {
    const dir = path.join(root, '.entries');
    const outside = path.join(root, 'fora.txt');
    fs.mkdirSync(dir);
    fs.writeFileSync(outside, SECRET, { mode: 0o600 });
    fs.symlinkSync(outside, path.join(dir, 'atalho.zke'));

    expect(shredDirectory(dir)).toBe(false);
    expect(fs.readFileSync(outside, 'utf8')).toBe(SECRET);
  });
});
