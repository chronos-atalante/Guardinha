import os from 'node:os';
import path from 'node:path';

/**
 * Onde o cofre mora. Só resolve caminhos: nenhum I/O, nenhuma dependência de
 * Electron, para que `storage.ts`, o armazenamento das entradas e a rotina de
 * erasure concordem sobre o mesmo lugar sem repetir a árvore de diretórios.
 */

function xdgDir(envVar: string, fallback: string): string {
  const value = process.env[envVar];
  if (value !== undefined && value !== '') return value;
  return path.join(os.homedir(), fallback);
}

/**
 * Raiz do cofre: `/var/lib/.guardinha/.vault`, pastas ocultas por padrão
 * (fora de `~/`, sobrevive à limpeza da pasta do usuário). `GUARDINHA_VAR_LIB`
 * redireciona a raiz e `GUARDINHA_VAULT_DIR` sobrepõe o caminho completo (testes/dev).
 */
export function vaultDir(): string {
  const override = process.env.GUARDINHA_VAULT_DIR;
  if (override !== undefined && override !== '') return override;
  const varLib = process.env.GUARDINHA_VAR_LIB;
  const base = varLib !== undefined && varLib !== '' ? varLib : '/var/lib';
  return path.join(base, '.guardinha', '.vault');
}

/** Cofre intermediário anterior em `$XDG_DATA_HOME/guardinha/vault`. */
export function xdgVaultDir(): string {
  return path.join(xdgDir('XDG_DATA_HOME', path.join('.local', 'share')), 'guardinha', 'vault');
}

export function legacyVaultDir(): string {
  return path.join(os.homedir(), '.guardinha-vault');
}

export function entriesDir(): string {
  return path.join(vaultDir(), '.entries');
}

/** Container com as chaves embrulhadas, a trava e o manifesto. */
export function containerFile(): string {
  return path.join(vaultDir(), 'vault.zkv');
}
