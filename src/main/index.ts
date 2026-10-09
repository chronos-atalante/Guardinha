import fs from 'node:fs';
import path from 'node:path';
import { Menu, app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron';
import { createVault, getStatus, lock, resetPin, unlock } from '@zero/main/vault';
import { activityMonitor } from '@zero/main/activity';
import { validateDomainFormat } from '@zero/main/auth';
import { removeEntry, saveEntry, listEntries } from '@zero/main/entries';
import { generateHighEntropyPassword } from '@zero/main/crypto';
import { secureClipboard } from '@zero/main/clipboard';
import { loadSettings, saveSettings } from '@zero/main/settings';
import { currentMessages } from '@zero/main/i18n';
import type {
  AppSettings,
  CreateVaultInput,
  CredentialInput,
  GeneratorOptions,
  ResetPinInput,
  UnlockInput,
} from '@zero/types';

let mainWindow: BrowserWindow | null = null;

/**
 * O preload é emitido como `.cjs` (CommonJS) porque o Electron executa preload
 * **sandboxed** como script simples, sem loader ESM; `format: 'cjs'` está fixado
 * em `electron.vite.config.mts`. Resolve o que existir no bundle gerado.
 */
function preloadScript(): string {
  const dir = path.join(__dirname, '../preload');
  const found = ['index.cjs', 'index.mjs', 'index.js']
    .map((name) => path.join(dir, name))
    .find((file) => fs.existsSync(file));
  return found ?? path.join(dir, 'index.cjs');
}

function createWindow(): void {
  const iconPath = path.join(__dirname, '../../build/icon.png');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 520,
    minHeight: 360,
    title: 'Guardinha',
    backgroundColor: '#020617',
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    show: false,
    webPreferences: {
      preload: preloadScript(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Em produção o DevTools fica de fora: atalho não expõe o renderer.
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // O app é uma SPA local: navegação só vale para a própria página (o reload
  // mantém a mesma URL); qualquer salto para outra URL é recusado.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const targetUrl = devUrl !== undefined && devUrl !== '' ? devUrl : `${APP_ORIGIN}/index.html`;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== targetUrl) event.preventDefault();
  });

  // `window.target=_blank` nunca cria janela: https vai para o navegador do
  // sistema e o resto (javascript:, file:, data:) é só recusado.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((error: unknown) => {
        console.error('Falha ao abrir URL externa:', error);
      });
    }
    return { action: 'deny' };
  });

  void mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Nega toda permissão web do renderer (mídia, geolocalização, notificações,
 * clipboard…): a cópia de credenciais passa pelo canal `clipboard:copy` e usa o
 * clipboard nativo no main, sem pedir permissão nenhuma ao sistema.
 */
function registerPermissionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

const APP_SCHEME = 'guardinha';
const APP_ORIGIN = `${APP_SCHEME}://app`;

protocol.registerSchemesAsPrivileged([
  {
    // Serve a SPA em produção via protocol.handle (substitui file://).
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function rendererMime(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Serve a SPA empacotada sob o scheme `guardinha://` (em vez de `file://`,
 * recomendado pela doc atual do Electron): todo `/assets/...` resolve dentro
 * de `out/renderer`, com path traversal rejeitado por `path.resolve` + prefix.
 */
function registerAppProtocol(): void {
  const root = path.join(__dirname, '../renderer');
  protocol.handle(APP_SCHEME, (request) => {
    try {
      const u = new URL(request.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const full = path.resolve(root, rel === '' ? 'index.html' : rel);
      if (!full.startsWith(`${root}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        return new Response('Não encontrado.', { status: 404 });
      }
      return new Response(new Uint8Array(fs.readFileSync(full)), {
        headers: { 'Content-Type': rendererMime(full) },
      });
    } catch {
      return new Response('Erro', { status: 500 });
    }
  });
}

/**
 * Só aceita URL da página oficial do app: dev server do Vite em dev, ou o
 * scheme `guardinha://` em produção. Qualquer frame fora desse host (ex.: um
 * `<webview>` injetado) é bloqueado antes do handler de domínio rodar.
 */
function isAppFrameUrl(url: string | undefined): boolean {
  if (url === undefined) return false;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const base = devUrl !== undefined && devUrl !== '' ? devUrl : `${APP_ORIGIN}/index.html`;
  try {
    const frame = new URL(url);
    const expected = new URL(base);
    return (
      frame.protocol === expected.protocol &&
      frame.host === expected.host &&
      frame.port === expected.port
    );
  } catch {
    return false;
  }
}

/**
 * Recusa IPC cujo emissor não é a página oficial do app (scheme `guardinha://`
 * em produção ou dev server do Vite em dev). Requer `event.senderFrame`.
 */
function assertAppFrame(event: unknown): void {
  const sf = (event as { senderFrame?: { url?: unknown } | null } | null | undefined)?.senderFrame;
  const url = sf?.url;
  if (!isAppFrameUrl(typeof url === 'string' ? url : undefined)) {
    throw new Error('IPC bloqueado: frame fora da página oficial do app.');
  }
}

function registerIpc(): void {
  ipcMain.handle('vault:status', (event) => {
    assertAppFrame(event);
    return getStatus();
  });
  ipcMain.handle('vault:create', (event, input: CreateVaultInput) => {
    assertAppFrame(event);
    return createVault(input);
  });
  ipcMain.handle('vault:unlock', (event, input: UnlockInput) => {
    assertAppFrame(event);
    return unlock(input);
  });
  ipcMain.handle('vault:resetPin', (event, input: ResetPinInput) => {
    assertAppFrame(event);
    return resetPin(input);
  });
  ipcMain.handle('vault:lock', (event) => {
    assertAppFrame(event);
    return lock();
  });

  /** Abre o domínio da credencial no navegador padrão (só http/https). */
  ipcMain.handle('shell:open-domain', (event, domain: string) => {
    assertAppFrame(event);
    const m = currentMessages();
    if (domain === '' || !validateDomainFormat(domain)) {
      throw new Error(m.errors.invalidDomain);
    }
    const url = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    void shell.openExternal(url);
  });

  ipcMain.handle('entries:list', (event) => {
    assertAppFrame(event);
    return listEntries();
  });
  ipcMain.handle('entries:save', (event, entry: CredentialInput) => {
    assertAppFrame(event);
    return saveEntry(entry);
  });
  ipcMain.handle('entries:delete', (event, id: string) => {
    assertAppFrame(event);
    return removeEntry(id);
  });

  /** Copia para o clipboard nativo e limpa sozinho 30 s depois (no main). */
  ipcMain.handle('clipboard:copy', (event, value: string) => {
    assertAppFrame(event);
    if (typeof value !== 'string') {
      throw new Error(currentMessages().errors.internal);
    }
    return secureClipboard.copy(value);
  });

  ipcMain.handle('generator:generate', (event, options: GeneratorOptions) => {
    assertAppFrame(event);
    const m = currentMessages();
    const length = options.length;
    if (!Number.isInteger(length) || length < 0 || length > 72) {
      throw new Error(m.errors.invalidGenerator);
    }
    if (!Array.isArray(options.customEntropyWords)) {
      throw new Error(m.errors.invalidGenerator);
    }
    return generateHighEntropyPassword(
      length,
      options.useUpper,
      options.useNumbers,
      options.useSymbols,
      options.customEntropyWords,
    );
  });

  ipcMain.handle('settings:get', (event) => {
    assertAppFrame(event);
    return loadSettings();
  });
  ipcMain.handle('settings:set', (event, settings: AppSettings) => {
    assertAppFrame(event);
    return saveSettings(settings);
  });
}

/** Sem barra de menus (sem File/Edit/View): o menu da aplicação é removido. */
function removeApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}

/**
 * Ouvinte do `ActivityMonitor` (Observer): o auto-lock zera a chave no main e
 * empurra o novo status para o renderer no mesmo instante (o renderer não
 * precisa esperar o polling de 15 s para voltar à tela de autenticação).
 */
function registerActivityObserver(): void {
  activityMonitor.subscribe(() => {
    const status = lock();
    mainWindow?.webContents.send('vault:auto-locked', status);
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(() => {
      registerAppProtocol();
      registerIpc();
      removeApplicationMenu();
      registerPermissionPolicy();
      registerActivityObserver();
      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error: unknown) => {
      console.error('Falha ao iniciar o aplicativo:', error);
    });

  // Encerramento de sessão: a chave sai da memória junto com o processo e o
  // temporizador do clipboard é cancelado (o wipe roda antes de qualquer I/O).
  app.on('before-quit', () => {
    try {
      lock();
    } catch (error) {
      console.error('Falha ao bloquear o cofre no encerramento:', error);
    }
    secureClipboard.dispose();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
