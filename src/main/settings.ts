import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { LANGUAGES } from '@zero/messages';
import type { AppSettings, Language } from '@zero/types';

/** Configurações não sensíveis em XDG ($XDG_CONFIG_HOME/guardinha/). */
function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'guardinha');
}

function settingsFile(): string {
  return path.join(configDir(), 'settings.json');
}

function normalizeLanguage(value: unknown): Language {
  if (typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)) {
    return value as Language;
  }
  return 'pt-BR';
}

export function loadSettings(): AppSettings {
  if (!fs.existsSync(settingsFile())) return { language: 'pt-BR' };
  try {
    const raw = fs.readJsonSync(settingsFile()) as { language?: unknown };
    return { language: normalizeLanguage(raw.language) };
  } catch {
    return { language: 'pt-BR' };
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized: AppSettings = { language: normalizeLanguage(settings.language) };
  fs.ensureDirSync(configDir(), { mode: 0o700 });
  fs.chmodSync(configDir(), 0o700);
  const tmp = `${settingsFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, settingsFile());
  return normalized;
}
