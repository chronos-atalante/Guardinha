import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyAndAutoClear } from '@zero/renderer/clipboard';

describe('copyAndAutoClear', () => {
  const writeText = vi.fn<(value: string) => Promise<void>>();
  const readText = vi.fn<() => Promise<string>>();

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset().mockResolvedValue(undefined);
    readText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('limpa o clipboard depois do intervalo quando o valor não mudou', async () => {
    readText.mockResolvedValue('senha-copiada');
    await copyAndAutoClear('senha-copiada');
    expect(writeText).toHaveBeenCalledWith('senha-copiada');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(writeText).toHaveBeenLastCalledWith('');
  });

  it('preserva o clipboard se o usuário copiou outra coisa depois', async () => {
    readText.mockResolvedValue('outra-coisa');
    await copyAndAutoClear('senha');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalledWith('');
  });

  it('limpa mesmo sem conseguir ler o clipboard', async () => {
    readText.mockRejectedValue(new Error('leitura negada'));
    await copyAndAutoClear('senha');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(writeText).toHaveBeenLastCalledWith('');
  });
});
