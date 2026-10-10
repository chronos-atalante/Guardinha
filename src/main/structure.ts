import fs from 'fs-extra';
import path from 'node:path';
import { currentMessages } from '@zero/main/i18n';
import { entriesDir, vaultDir } from '@zero/main/layout';

/**
 * Estrutura de diretórios do cofre: garante as pastas com o modo certo,
 * migra o layout visível para o oculto e sabe listar o que existe lá dentro.
 * Fica entre `layout.ts` (só caminhos) e os módulos que leem e escrevem
 * arquivo, para que nenhum deles precise repetir a árvore de pastas nem criar
 * ciclo de importação com quem escreve o container.
 */

export function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

/**
 * Layout oculto: `entries/` (visível) vira `.entries/`. O rename é barato e
 * idempotente; roda antes de qualquer leitura/escrita das credenciais.
 */
export function migrateHiddenLayout(): void {
  const oldDir = path.join(vaultDir(), 'entries');
  const newDir = path.join(vaultDir(), '.entries');
  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.renameSync(oldDir, newDir);
}

/** Garante a pasta do cofre em `/var/lib` com permissões restritas. */
export function ensureVaultStructure(): void {
  try {
    migrateHiddenLayout();
    fs.ensureDirSync(vaultDir(), { mode: 0o700 });
    fs.ensureDirSync(entriesDir(), { mode: 0o700 });
    fs.chmodSync(vaultDir(), 0o700);
    fs.chmodSync(entriesDir(), 0o700);
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(currentMessages().errors.vaultDirUnavailable, { cause: error });
    }
    throw error;
  }
}

/** Caminho efetivo do cofre (para mensagens e diagnóstico). */
export function vaultPath(): string {
  return vaultDir();
}

/** true se o erro é falta de permissão para criar a raiz do cofre em /var/lib. */
export function isVaultDirUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === currentMessages().errors.vaultDirUnavailable;
}

/**
 * Todo arquivo regular do cofre, pasta do container e de `.entries` juntas.
 * Serve para o erasure e para a varredura de temporários órfãos, que precisam
 * ver o que existe de fato em vez do que o manifesto afirma.
 */
export function vaultFiles(): string[] {
  const files: string[] = [];
  for (const dir of [vaultDir(), entriesDir()]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.lstatSync(full).isFile()) files.push(full);
    }
  }
  return files;
}
