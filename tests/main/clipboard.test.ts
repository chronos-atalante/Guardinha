// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureClipboardProxy } from '@zero/main/clipboard';
import { clipboard } from '../mocks/electron.ts';

describe('SecureClipboardProxy', () => {
  let proxy: SecureClipboardProxy;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboard.writeText.mockClear().mockResolvedValue(undefined);
    clipboard.readText.mockReset().mockResolvedValue('');
    proxy = new SecureClipboardProxy();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('limpa o clipboard 30 s depois quando o valor não mudou', async () => {
    clipboard.readText.mockResolvedValue('senha-copiada');
    await proxy.copy('senha-copiada');
    expect(clipboard.writeText).toHaveBeenLastCalledWith('senha-copiada');

    await vi.advanceTimersByTimeAsync(29_999);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('preserva o clipboard se o usuário copiou outra coisa antes da limpeza', async () => {
    clipboard.readText.mockResolvedValue('outra-coisa');
    await proxy.copy('senha');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(clipboard.writeText).not.toHaveBeenCalledWith('');
  });

  it('limpa mesmo sem conseguir ler o clipboard', async () => {
    clipboard.readText.mockRejectedValue(new Error('leitura negada'));
    await proxy.copy('senha');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('uma cópia nova reprograma a limpeza', async () => {
    clipboard.readText.mockResolvedValue('senha-b');
    await proxy.copy('senha-a');
    await vi.advanceTimersByTimeAsync(20_000);
    await proxy.copy('senha-b');

    await vi.advanceTimersByTimeAsync(15_000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('dispose cancela a limpeza pendente', async () => {
    await proxy.copy('senha');
    proxy.dispose();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});
