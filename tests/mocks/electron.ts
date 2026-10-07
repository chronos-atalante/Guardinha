import { vi } from 'vitest';

/**
 * Stub do módulo `electron` aplicado pelo alias em `vitest.config.mts`.
 * Mantém estado compartilhado entre o módulo sob teste e os asserts do teste.
 */

export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;
export type WindowEventHandler = (...args: unknown[]) => unknown;

export class MockWebContents {
  public readonly send = vi.fn<(channel: string, payload: unknown) => void>();
  public readonly on = vi.fn<(event: string, listener: WindowEventHandler) => void>();
}

export class BrowserWindow {
  public static instances: BrowserWindow[] = [];

  public static getAllWindows = vi.fn<() => BrowserWindow[]>(() => [...BrowserWindow.instances]);
  public static fromWebContents = vi.fn<() => BrowserWindow | null>(() => null);

  public readonly options: Record<string, unknown>;
  public readonly webContents = new MockWebContents();
  public readonly once = vi.fn<(event: string, listener: WindowEventHandler) => void>();
  public readonly on = vi.fn<(event: string, listener: WindowEventHandler) => void>();
  public readonly show = vi.fn<() => void>();
  public readonly focus = vi.fn<() => void>();
  public readonly restore = vi.fn<() => void>();
  public readonly isMinimized = vi.fn<() => boolean>(() => false);
  public readonly isDestroyed = vi.fn<() => boolean>(() => false);
  public readonly loadURL = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
  public readonly loadFile = vi.fn<(file: string) => Promise<void>>(() => Promise.resolve());

  constructor(options: Record<string, unknown>) {
    this.options = options;
    BrowserWindow.instances.push(this);
  }
}

export const app = {
  getPath: vi.fn<(name: string) => string>(() => '/tmp/guardinha-tests-appdata'),
  setPath: vi.fn<(name: string, value: string) => void>(),
  requestSingleInstanceLock: vi.fn<() => boolean>(() => true),
  quit: vi.fn<() => void>(),
  on: vi.fn<(event: string, listener: WindowEventHandler) => void>(),
  whenReady: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  getName: vi.fn<() => string>(() => 'guardinha'),
  name: 'Guardinha',
  isPackaged: vi.fn<() => boolean>(() => false),
};

export const Menu = {
  setApplicationMenu: vi.fn<(menu: unknown) => void>(),
};

export const ipcMain = {
  handle: vi.fn<(channel: string, listener: IpcHandler) => void>(),
  removeHandler: vi.fn<(channel: string) => void>(),
};

export const ipcRenderer = {
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve(undefined),
  ),
  on: vi.fn<(channel: string, listener: WindowEventHandler) => void>(),
  removeListener: vi.fn<(channel: string, listener: WindowEventHandler) => void>(),
  send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
};

export const contextBridge = {
  exposeInMainWorld: vi.fn<(key: string, api: unknown) => void>(),
};

export function resetElectronMock(): void {
  BrowserWindow.instances.length = 0;
  app.getPath.mockClear();
  app.setPath.mockClear();
  app.requestSingleInstanceLock.mockClear();
  app.quit.mockClear();
  app.on.mockClear();
  app.whenReady.mockClear();
  Menu.setApplicationMenu.mockClear();
  ipcMain.handle.mockClear();
  ipcRenderer.invoke.mockClear();
  ipcRenderer.on.mockClear();
  ipcRenderer.removeListener.mockClear();
  contextBridge.exposeInMainWorld.mockClear();
  BrowserWindow.getAllWindows.mockClear();
  BrowserWindow.fromWebContents.mockClear();
  app.getName.mockClear();
  app.isPackaged.mockClear();
}
