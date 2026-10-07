import { describe, expect, it, vi } from 'vitest';
import { BrowserWindow, ipcMain, session, shell } from '../mocks/electron.ts';
import '@zero/main/index';

/**
 * Janela e política da sessão registradas pelo entrypoint: navegação presa na
 * SPA, sem `window.open` para dentro do app e sem permissão web sobrando.
 */
async function waitForWindow(): Promise<BrowserWindow> {
  await vi.waitFor(() => {
    expect(BrowserWindow.instances.length).toBeGreaterThan(0);
  });
  const win = BrowserWindow.instances[0];
  if (win === undefined) throw new Error('Janela não criada.');
  return win;
}

describe('guardas de navegação e sessão', () => {
  it('cria a janela com DevTools habilitado fora de produção', async () => {
    const win = await waitForWindow();
    const webPreferences = win.options.webPreferences as Record<string, unknown>;
    expect(webPreferences.contextIsolation).toBe(true);
    expect(webPreferences.sandbox).toBe(true);
    // O mock isPackaged é falso (modo dev); no .deb embutido vira false.
    expect(webPreferences.devTools).toBe(true);
  });

  it('will-navigate recusa URL fora da página do app', async () => {
    const win = await waitForWindow();
    const navigation = win.webContents.on.mock.calls.find(([event]) => event === 'will-navigate');
    expect(navigation).toBeDefined();
    const listener = navigation?.[1];
    expect(listener).toBeTypeOf('function');

    const targetUrl = win.loadURL.mock.calls[0]?.[0] ?? '';
    expect(targetUrl).not.toBe('');

    const event = { preventDefault: vi.fn() };
    listener?.(event, 'https://exemplo.com/fora');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);

    listener?.(event, targetUrl);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('window.open nega janela e só repassa https para o navegador', async () => {
    const win = await waitForWindow();
    expect(win.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    expect(handler).toBeTypeOf('function');

    shell.openExternal.mockClear();
    expect(handler?.({ url: 'https://exemplo.com' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith('https://exemplo.com');

    expect(handler?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(handler?.({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('permissões da sessão negam tudo menos o clipboard', () => {
    expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    const policy = session.defaultSession.setPermissionRequestHandler.mock.calls[0]?.[0];
    expect(policy).toBeTypeOf('function');

    const grant = vi.fn<(granted: boolean) => void>();
    policy?.(null, 'geolocation', grant, null);
    expect(grant).toHaveBeenCalledWith(false);

    policy?.(null, 'media', grant, null);
    expect(grant).toHaveBeenLastCalledWith(false);

    policy?.(null, 'clipboard-sanitized-write', grant, null);
    expect(grant).toHaveBeenLastCalledWith(true);

    policy?.(null, 'clipboard-read', grant, null);
    expect(grant).toHaveBeenLastCalledWith(true);
  });

  it('registra os canais de IPC do cofre', () => {
    const channels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(channels).toContain('vault:unlock');
    expect(channels).toContain('entries:list');
    expect(channels).toContain('shell:open-domain');
  });
});
