# ZenaKeyPass (ZenaKey)

Aplicativo desktop **Electron + TypeScript + React** para guardar credenciais
**100% offline**, com criptografia dupla, alvo **Linux Mint 22.X (Zena)** e
distribuição em **`.deb`**.

## Recursos

- **Cofre em `~/.zena-vault/`** (pasta oculta, permissão 0700): envelope com a
  chave do cofre embrulhada por senha mestra (24 caracteres), PIN (8 dígitos) e
  frase de recuperação **escrita pelo próprio usuário** (mínimo de 12 palavras;
  o app nunca gera).
- **Acesso**: login só com **PIN**; a senha mestra é oferecida como opção
  apenas **após 3 falhas** de PIN; a frase de recuperação **não é forma de
  login** — serve exclusivamente para redefinir o PIN esquecido.
- **Criptografia**: Argon2id (64 MB, t=3, p=4) na derivação de chave e
  **AES-256-GCM por arquivo** (`entries/<uuid>.enc`), com salt e IV de 128 bits
  gerados por hardware e chave por arquivo via HKDF-SHA512.
- **Trava exponencial**: 10 s → 30 s → 1 min → 1 h → 24 h por tentativa errada,
  persistida em disco; auto-lock após 5 minutos ocioso.
- **Interface** em coluna com Sidebar (Início, Configuração & Gerador,
  Atribuições), busca, copiar usuário/senha, botão de globo que **abre o site
  da credencial no navegador**, gerador de senhas com slider de tamanho de
  baixa sensibilidade, injeção de 5 gostos pessoais e pós-créditos de cinema.
- **Idioma**: pt-BR (canônico) e inglês; todos os textos em `src/messages/`
  (ver `docs/messages.md`).

## Arquitetura

Segue o mesmo padrão do **chronos-biblioteca**:

- Imports dentro de `src/` só pelos aliases `@zero/*` (`tsconfig.base.json`
  espelhado em `electron.vite.config.mts`, `vitest.config.mts` e
  `src/node.loader.ts`).
- `src/main/` (cofre, criptografia, IPC), `src/preload/` (fachada `window.api`,
  build CJS), `src/renderer/` (React), `src/types/` (contratos) e
  `src/messages/` (textos).
- O renderer não acessa disco nem Node: tudo via `ipcRenderer.invoke`
  (`docs/api.md`).

## Comandos

| Comando             | O que faz                                          |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Sobe o app em modo desenvolvimento (hot reload)    |
| `npm run typecheck` | `tsc --noEmit` nos projetos node, web e testes     |
| `npm run lint`      | ESLint rigoroso (type-aware) em todo o repositório |
| `npm run format`    | Formata tudo com Prettier                          |
| `npm run check`     | typecheck + lint + format:check                    |
| `npm test`          | Suíte Vitest (`tests/**/*.test.{ts,tsx}`)          |
| `npm run build`     | Limpa + compila main/preload/renderer              |
| `npm run dist`      | Build + gera o `.deb` com electron-builder         |

## Segurança

- Chave do cofre só em memória no processo main; nunca sai por IPC e é zerada
  no lock.
- `contextIsolation: true`, `sandbox: true`, preload CJS e CSP no `index.html`.
- Nenhuma senha ou frase em log; erros chegam à UI já localizados.

## Licença

MIT.
