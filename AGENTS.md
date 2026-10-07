# AGENTS.md: ZenaKeyPass

Diretrizes para agentes e contribuidores deste repositório. Este arquivo manda
no código daqui. Referências humanas: `README.md` (visão completa).

## O projeto

App desktop Electron + TypeScript + React (Vite) para guardar credenciais
offline, alvo Linux Mint 22.X (Zena) e distribuição `.deb`. Versão:
`package.json` → `version` é a fonte da verdade.

Camadas:

- `src/main/`: janela e IPC (`index.ts`), cofre e sessão (`vault.ts`), CRUD de
  credenciais (`entries.ts`), criptografia (`crypto.ts`), persistência
  (`storage.ts`), trava exponencial (`auth.ts`) e idioma (`settings.ts`,
  `i18n.ts`).
- `src/messages/`: textos do app em pt-BR (canônico) e en (`@zero/messages`);
  guia em `docs/messages.md`.
- `src/preload/`: única ponte da UI; monta e expõe `window.api` tipado.
- `src/renderer/`: React; não acessa disco, rede nem Node direto.
- `src/types/`: contratos compartilhados (`@zero/types`, barrel).

## Arquitetura

- Cada arquivo do `main` responde por um domínio; o renderer só conhece o
  contrato de `window.api` (`docs/api.md`).
- Acesso ao cofre: login só com **PIN**; a **senha mestra** só é oferecida
  depois de 3 falhas de PIN; a **frase de recuperação** é escrita pelo próprio
  usuário (mínimo de 12 palavras, o app nunca gera) e serve exclusivamente para
  redefinir o PIN (`vault.resetPin`), nunca como login.
- Persistência: cofre em `~/.zena-vault/` (`envelope.json`, `entries/<uuid>.enc`,
  `auth-state.json`; override de teste via `ZENA_VAULT_DIR`) e configurações em
  `~/.config/zena-keypass/settings.json`.
- IPC via `ipcRenderer.invoke` e `ipcMain.handle`; canal novo só com tipo em
  `src/types/` e entrada em `docs/api.md`.
- A chave do cofre vive em memória no main (`vault.ts`); é zerada no lock e no
  auto-lock de 5 minutos.

## Design patterns

- Fachada: `src/preload/index.ts` monta o objeto `api: ElectronApi` e o
  registra no `contextBridge`; `ipcRenderer` não aparece fora dele.
- Barrel exports: `index.ts` só re-exporta (exceto os entrypoints
  `src/main/index.ts` e `src/preload/index.ts`).
- Tipagem de domínio por interfaces/uniões fechadas em `src/types/`
  (`UnlockKind`, `VaultStatus`), nunca strings soltas.
- UI composicional: estado no topo (`App.tsx`), telas e modais controlados
  (`Home`, `EntryModal`, `AuthModal`).

## Código: regras duras

- Imports dentro de `src/` só pelos aliases ESM `@zero/*` (nenhum caminho
  relativo entre pastas). O mapa é declarado em `tsconfig.base.json` e
  espelhado em `electron.vite.config.mts`, `vitest.config.mts` e
  `src/node.loader.ts`; mudar um alias vale nos quatro.
- Arquivos no teto de ~500 linhas; passou disso, extraia módulos.
- Type safety: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitReturns` e `verbatimModuleSyntax`
  (import de tipo sempre `import type`). Sem `any`, sem cast gratuito.
- Estilo: Prettier com 100 colunas, aspas simples e ponto e vírgula. Não
  desligue regra de lint para passar, corrija o código.
- `console` só `warn`/`error` (regra do ESLint); nenhum `debugger`/`alert`.
- Textos fixos de UI e mensagens de erro **só em `src/messages/`** (pt-BR é o
  canônico; `en.ts` deve fechar com `Messages`): no renderer use
  `useMessages()`/`richText()` (`src/renderer/src/i18n.tsx`), no main
  `currentMessages()` (`src/main/i18n.ts`). Marcadores ricos `**negrito**` e
  `` `código` `` só em string exibida. Dados por dependência
  (`attributions.ts`) e logs ficam fora dos bundles (`docs/messages.md`).

## Comandos

- `npm run check`: typecheck + lint + format. Obrigatório antes de concluir
  qualquer mudança.
- `npm test` (ou `test:coverage`): Vitest em `tests/**`.
- `npm run dev` / `build` / `dist`: desenvolvimento, build, `.deb`.
- `node --import ./src/node.loader.ts <arquivo.ts>`: roda `.ts` direto com os
  aliases `@zero/*`.
- Capture o exit do próprio npm (`npm run check; echo $?`), não o código de
  saída de um `tail`/`grep` no fim do pipe.

## Segurança

- Nada de credencial no repositório; erros do cofre não podem ecoar senha,
  PIN ou frase.
- Renderer com CSP e preload sandboxed (por isso ele é CommonJS); não
  enfraquecer `contextIsolation` nem inserir HTML dinâmico.
- Argon2id com 64 MB / t=3 / p=4 e AES-256-GCM por arquivo: mudar parâmetros
  exige migrar o `envelope.json` (versão `1`).
- `.deb` e `out/` nunca entram no git.

## Documentação

- Documentação nova vai em `docs/`; o `README.md` é o índice.
- Mapa: `docs/api.md` (contrato `window.api`), `docs/messages.md` (i18n e
  regras de tradução).
