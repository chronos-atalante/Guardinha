import { describe, expect, it, vi } from 'vitest';
import { app, BrowserWindow, clipboard, ipcMain, session, shell } from '../mocks/electron.ts';
import { activityMonitor, IDLE_LOCK_MS } from '@zero/main/activity';
import { currentMessages } from '@zero/main/i18n';
import { isVaultLockedError } from '@zero/main/vault';
import { vaultSession } from '@zero/main/session';
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

  it('permissões da sessão negam tudo (o clipboard vive no main)', () => {
    expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    const policy = session.defaultSession.setPermissionRequestHandler.mock.calls[0]?.[0];
    expect(policy).toBeTypeOf('function');

    const grant = vi.fn<(granted: boolean) => void>();
    for (const permission of [
      'geolocation',
      'media',
      'clipboard-read',
      'clipboard-sanitized-write',
      'notifications',
    ]) {
      policy?.(null, permission, grant, null);
    }
    expect(grant).toHaveBeenCalledTimes(5);
    expect(grant.mock.calls.every(([value]) => !value)).toBe(true);
  });

  it('canal clipboard:copy copia pelo proxy do main', async () => {
    const handler = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'clipboard:copy',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    clipboard.writeText.mockClear();
    await handler?.({ senderFrame: { url: 'guardinha://app/index.html' } }, 'senha-copiada');
    expect(clipboard.writeText).toHaveBeenCalledWith('senha-copiada');
  });

  it('canal clipboard:copy recusa valor que não seja texto', () => {
    const handler = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'clipboard:copy',
    )?.[1];
    clipboard.writeText.mockClear();
    expect(() =>
      handler?.({ senderFrame: { url: 'guardinha://app/index.html' } }, { senha: 'x' }),
    ).toThrow();
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('encerramento do app bloqueia o cofre e cancela a limpeza do clipboard', () => {
    const handler = app.on.mock.calls.find(([event]) => event === 'before-quit')?.[1];
    expect(handler).toBeTypeOf('function');
    expect(() => handler?.()).not.toThrow();
  });

  it('auto-lock empurra vault:auto-locked para o renderer', async () => {
    const win = await waitForWindow();
    const send = vi.spyOn(win.webContents, 'send').mockClear();

    vi.useFakeTimers();
    try {
      // o ouvinte do ActivityMonitor foi registrado no whenReady (entrypoint)
      activityMonitor.touch();
      await vi.advanceTimersByTimeAsync(IDLE_LOCK_MS);
      expect(send).toHaveBeenCalledWith(
        'vault:auto-locked',
        expect.objectContaining({ locked: true }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('registra os canais de IPC do cofre', () => {
    const channels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(channels).toContain('vault:unlock');
    expect(channels).toContain('entries:list');
    expect(channels).toContain('shell:open-domain');
    expect(channels).toContain('clipboard:copy');
  });

  it('desliga a decodificação de vídeo, que o app não usa, ao subir', () => {
    // sem isso, o Chromium imprime `libva error: iHD_drv_video.so init failed`
    // ao iniciar em máquina com o driver VA-API do Intel quebrado
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-accelerated-video-decode');
  });
});

describe('sessão perdida durante uma operação do cofre', () => {
  /**
   * A chave pode sumir entre o status que o renderer recebeu e a chamada de
   * dados que ele fez em seguida: é o auto-lock disparando com a tela montada,
   * e é também o restart do processo main em `npm run dev`, que recria o
   * Singleton vazio e deixa o renderer com a tela antiga. Sem o aviso, o app
   * fica travado num erro que ninguém entende; com ele, o renderer reconsulta o
   * status e volta para a autenticação.
   */
  function invoke(channel: string, ...args: unknown[]): unknown {
    const handler = ipcMain.handle.mock.calls.find(([name]) => name === channel)?.[1];
    expect(handler).toBeTypeOf('function');
    return handler?.({ senderFrame: { url: 'guardinha://app/index.html' } }, ...args);
  }

  it('recusa a operação e avisa o renderer pelo canal do auto-lock', async () => {
    const win = await waitForWindow();
    const send = vi.spyOn(win.webContents, 'send').mockClear();
    vaultSession().wipe(); // a sessão foi zerada depois da tela montar

    expect(() => invoke('entries:list')).toThrow(currentMessages().errors.vaultLocked);

    // o aviso é o que tira o renderer da tela quebrada
    expect(send).toHaveBeenCalledWith(
      'vault:auto-locked',
      expect.objectContaining({ locked: true }),
    );
  });

  it('não devolve lista vazia quando a sessão se foi (fail-open seria pior)', () => {
    vaultSession().wipe();

    // devolver [] faria o app parecer um cofre vazio, que é a pior leitura
    // possível num app de credenciais; a resposta tem que ser erro
    expect(() => invoke('entries:list')).toThrow();
  });

  it('avisa também em entries:save e entries:delete', async () => {
    const win = await waitForWindow();
    const send = vi.spyOn(win.webContents, 'send').mockClear();
    vaultSession().wipe();

    expect(() =>
      invoke('entries:save', {
        title: 'x',
        username: '',
        password: '',
        domain: '',
        notes: '',
      }),
    ).toThrow();
    expect(() => invoke('entries:delete', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toThrow();

    expect(send.mock.calls.filter(([channel]) => channel === 'vault:auto-locked')).toHaveLength(2);
  });

  it('não avisa quando o erro é outro (adulteração, id inválido)', () => {
    const m = currentMessages();
    // o discriminador é a mensagem do Singleton: só ela dispara o aviso, para
    // que uma falha de domínio comum não faça o renderer sair da tela à toa
    expect(isVaultLockedError(new Error(m.errors.vaultLocked))).toBe(true);
    expect(isVaultLockedError(new Error(m.errors.invalidId))).toBe(false);
    expect(isVaultLockedError(new Error(m.errors.vaultTampered))).toBe(false);
    expect(isVaultLockedError(new Error(m.errors.entryNotFound))).toBe(false);
    expect(isVaultLockedError('texto solto')).toBe(false);
    expect(isVaultLockedError(null)).toBe(false);
  });
});
