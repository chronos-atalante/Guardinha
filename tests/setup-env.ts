import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Isola todas as escritas (cofre, configurações, estado de auth) em um
 * diretório temporário exclusivo deste processo de teste. Precisa rodar antes
 * do import dos módulos sob teste, por isso fica em `setupFiles`.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardinha-tests-'));

process.env.HOME = root;
process.env.GUARDINHA_VAULT_DIR = path.join(root, '.guardinha-vault');
delete process.env.ELECTRON_RENDERER_URL;

function cleanup(): void {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // melhor esforço: diretório temporário
  }
}

process.once('exit', cleanup);
