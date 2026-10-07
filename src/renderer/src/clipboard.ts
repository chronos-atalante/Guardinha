/**
 * Copia para o clipboard e limpa o conteúdo depois de um intervalo: senha ou
 * usuário parado no clipboard é vazamento para quem olha a área de transferência.
 *
 * Antes de limpar, tenta ler o clipboard atual; se o usuário já tiver copiado
 * outra coisa depois, o valor alheio é preservado. Sem leitura disponível,
 * limpa mesmo assim (no cofre, senha esquecida pesa mais que conveniência).
 */
const CLEAR_AFTER_MS = 30_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let copied: string | null = null;

async function clearIfUnchanged(): Promise<void> {
  try {
    const current = await navigator.clipboard.readText();
    if (current !== copied) return;
  } catch {
    // sem leitura disponível: segue para a limpeza
  }
  try {
    await navigator.clipboard.writeText('');
  } catch {
    // clipboard indisponível: nada a limpar
  } finally {
    copied = null;
  }
}

export async function copyAndAutoClear(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  copied = value;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void clearIfUnchanged();
  }, CLEAR_AFTER_MS);
}
