import fs from 'node:fs';
import path from 'node:path';
import { Menu, app, BrowserWindow, ipcMain, shell } from 'electron';
import { createVault, getStatus, lock, resetPin, unlock } from '@zero/main/vault';
import { validateDomainFormat } from '@zero/main/auth';
import { removeEntry, saveEntry, listEntries } from '@zero/main/entries';
import { generateHighEntropyPassword } from '@zero/main/crypto';
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
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl !== undefined && devUrl !== '') {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('vault:status', () => getStatus());
  ipcMain.handle('vault:create', (_event, input: CreateVaultInput) => createVault(input));
  ipcMain.handle('vault:unlock', (_event, input: UnlockInput) => unlock(input));
  ipcMain.handle('vault:resetPin', (_event, input: ResetPinInput) => resetPin(input));
  ipcMain.handle('vault:lock', () => lock());

  /** Abre o domínio da credencial no navegador padrão (só http/https). */
  ipcMain.handle('shell:open-domain', (_event, domain: string) => {
    const m = currentMessages();
    if (domain === '' || !validateDomainFormat(domain)) {
      throw new Error(m.errors.invalidDomain);
    }
    const url = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    void shell.openExternal(url);
  });

  ipcMain.handle('entries:list', () => listEntries());
  ipcMain.handle('entries:save', (_event, entry: CredentialInput) => saveEntry(entry));
  ipcMain.handle('entries:delete', (_event, id: string) => removeEntry(id));

  ipcMain.handle('generator:generate', (_event, options: GeneratorOptions) => {
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

  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_event, settings: AppSettings) => saveSettings(settings));
}

/** Sem barra de menus (sem File/Edit/View): o menu da aplicação é removido. */
function removeApplicationMenu(): void {
  Menu.setApplicationMenu(null);
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
      registerIpc();
      removeApplicationMenu();
      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error: unknown) => {
      console.error('Falha ao iniciar o aplicativo:', error);
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
