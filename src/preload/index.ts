import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronApi } from '@zero/types';

const api: ElectronApi = {
  vault: {
    status: () => ipcRenderer.invoke('vault:status'),
    create: (input) => ipcRenderer.invoke('vault:create', input),
    unlock: (input) => ipcRenderer.invoke('vault:unlock', input),
    resetPin: (input) => ipcRenderer.invoke('vault:resetPin', input),
    lock: () => ipcRenderer.invoke('vault:lock'),
  },
  openDomain: (domain) => ipcRenderer.invoke('shell:open-domain', domain),
  clipboard: {
    copy: (value) => ipcRenderer.invoke('clipboard:copy', value),
  },
  entries: {
    list: () => ipcRenderer.invoke('entries:list'),
    save: (entry) => ipcRenderer.invoke('entries:save', entry),
    remove: (id) => ipcRenderer.invoke('entries:delete', id),
  },
  generator: {
    generate: (options) => ipcRenderer.invoke('generator:generate', options),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
  },
};

contextBridge.exposeInMainWorld('api', api);
