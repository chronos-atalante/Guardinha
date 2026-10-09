# AGENTS.md: Guardinha

Diretrizes para agentes e contribuidores deste repositório. Este arquivo manda
no código daqui. Referências humanas: `README.md` (visão completa).

## O projeto

App desktop Electron + TypeScript + React (Vite) para guardar credenciais
offline, alvo Linux Mint 22.X (Zena) e distribuição `.deb`. Versão:
`package.json` → `version` é a fonte da verdade.

Camadas:

- `src/main/`: janela e IPC (`index.ts`), cofre e ciclo de vida (`vault.ts`),
  chave em memória (`session.ts`, Singleton `VaultSessionManager`), atividade
  e auto-lock (`activity.ts`, Observer `ActivityMonitor`), desbloqueio
  (`unlock.ts`, cadeia de manipuladores), desembrulho de chaves
  (`unwrapping.ts`, mapa por tipo de credencial), CRUD de credenciais
  (`entries.ts`), criptografia (`crypto.ts`), persistência (`storage.ts`) sob
  a fachada (`facade.ts`, `VaultStorageFacade`), clipboard (`clipboard.ts`,
  `SecureClipboardProxy`), trava exponencial (`auth.ts`), sudo via PolicyKit
  (`privilege.ts`) e idioma (`settings.ts`, `i18n.ts`).
- `src/messages/`: textos do app em pt-BR (canônico) e en (`@zero/messages`);
  guia em `docs/messages.md`.
- `src/preload/`: única ponte da UI; monta e expõe `window.api` tipado.
- `src/renderer/`: React; não acessa disco, rede nem Node direto.
- `src/shared/`: regras puras compartilhadas por `main` e `renderer`
  (`@zero/shared`, ex.: avaliação de força de credencial e a Strategy
  `strengthFor`; sem Node nem DOM).
- `src/types/`: contratos compartilhados (`@zero/types`, barrel).

## Arquitetura

- Cada arquivo do `main` responde por um domínio; o renderer só conhece o
  contrato de `window.api` (`docs/api.md`).
- Acesso ao cofre: login só com **PIN**; a **senha mestra** só é oferecida
  depois de 3 falhas de PIN; a **frase de recuperação** é escrita pelo próprio
  usuário (mínimo de 12 palavras, o app nunca gera) e serve exclusivamente para
  redefinir o PIN (`vault.resetPin`), nunca como login.
- Persistência: cofre em `/var/lib/.guardinha/.vault/` (fora de `~/`, 0700;
  **pastas ocultas por padrão**, prefixo `.`; a raiz é criada pelo `postinst`
  do `.deb`, `build/scripts/after-install.sh`) com `vault.zkv` binário (chaves
  embrulhadas + trava exponencial + manifesto cifrado) e
  `.entries/<uuid>.zke` individuais; a raiz `.guardinha/` é
  `root:root 0711` sem listagem (navegar/excluir o topo exige sudo) e, quando
  falta permissão, `createVault` chama o helper do pacote via `pkexec`
  (ação PolicyKit `com.guardinha.keypass.setup-vault`; diálogo do sistema: a
  senha nunca passa pelo app). Migração automática do intermediário
  `$XDG_DATA_HOME/guardinha/` e do legado `~/.guardinha-vault/` (JSON); raiz
  sobrepõe com `GUARDINHA_VAR_LIB`, caminho completo com `GUARDINHA_VAULT_DIR`
  (testes; `npm run dev` usa `.dev-vault/`); configurações em
  `$XDG_CONFIG_HOME/guardinha/settings.json`.
- IPC via `ipcRenderer.invoke` e `ipcMain.handle`; canal novo só com tipo em
  `src/types/` e entrada em `docs/api.md`.
- A chave do cofre vive em memória no main, dentro do Singleton
  `VaultSessionManager` (`session.ts`); ele zera o Buffer no lock, no auto-lock
  de 5 minutos e no encerramento do app. O temporizador de ociosidade mora no
  `ActivityMonitor` (`activity.ts`): no evento de idle o Singleton zera a chave
  e o entrypoint empurra `vault:auto-locked` para o renderer (o polling de
  15 s em `App.tsx` fica como rede de segurança). O desbloqueio passa pela
  cadeia `unlock.ts` (trava exponencial, formato, Argon2id, integridade) e o
  desembrulho da chave vem do mapa em `unwrapping.ts`. `vault.ts` e
  `entries.ts` não tocam `fs` nem cifra: passam pela fachada
  `VaultStorageFacade` (`facade.ts`).

## Design patterns

- Singleton: `VaultSessionManager` (`src/main/session.ts`) é a única detentora
  da chave do cofre (construtor privado, atalho `vaultSession()`).
- Fachada: `VaultStorageFacade` (`src/main/facade.ts`) concentra `fs-extra`,
  AES-256-GCM e o manifesto; `vault.ts` e `entries.ts` pedem operações de alto
  nível. `src/preload/index.ts` também é fachada (monta `window.api`).
- Proxy: `SecureClipboardProxy` (`src/main/clipboard.ts`) envolve o clipboard
  nativo com expiração em 30 s.
- Chain of Responsibility: `unlock.ts` encadeia trava exponencial, formato,
  derivação Argon2id e integridade; `vault.ts` só chama `runUnlockChain`.
- Factory Method: `unwrapping.ts` resolve o embrulho/desembrulho da chave por
  tipo de credencial (`keyUnwrapperFor(kind)`, mapa `UNWRAPPERS`).
- Strategy: `src/shared/strategy.ts` (`strengthFor(kind)`) escolhe a régua de
  força por tipo de credencial; as funções puras continuam em `strength.ts`.
- Observer: `activity.ts` (`ActivityMonitor`) notifica o Singleton e o
  entrypoint na ociosidade; cada ouvinte se inscreve e cancela sozinho.
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

- `npm run check`: typecheck + lint + format + `security:audit` (osv-scanner
  sobre o lockfile, `.osv-scanner.toml`) + `lint:shell` (shellcheck nos
  scripts de `build/scripts/`). Obrigatório antes de concluir qualquer
  mudança. As duas ferramentas ficam em `bin/` e não entram no git:
  `bin/osv-scanner` (copiar de `Chronos/Biblioteca/bin/`) e `bin/shellcheck`
  (release `koalaman/shellcheck` no GitHub).
- `npm test` (ou `test:coverage`): Vitest em `tests/**`.
- `npm run dev` / `build` / `dist`: desenvolvimento, build, `.deb`.
- `python3 build/make-icon.py`: regenera `build/icon.png` (PIL); é o `icon`
  do electron-builder e da janela.
- `node --import ./src/node.loader.ts <arquivo.ts>`: roda `.ts` direto com os
  aliases `@zero/*`.
- Capture o exit do próprio npm (`npm run check; echo $?`), não o código de
  saída de um `tail`/`grep` no fim do pipe.

## Segurança

- Nada de credencial no repositório; erros do cofre não podem ecoar senha,
  PIN ou frase.
- Renderer com CSP e preload sandboxed (por isso ele é CommonJS); não
  enfraquecer `contextIsolation` nem inserir HTML dinâmico.
- Janela e sessão contidas (`src/main/index.ts`): navegação presa à página do
  app (`will-navigate`), `window.open` só repassa `https:` para o navegador do
  sistema, toda permissão web da sessão é negada (a cópia passa pelo canal
  `clipboard:copy`) e DevTools (`devTools: !app.isPackaged`) fica desligado no
  empacotado; não afrouxar.
- Credencial copiada some do clipboard 30 s depois (`SecureClipboardProxy`, em
  `src/main/clipboard.ts`), salvo o usuário copiar outra coisa antes; o
  renderer não usa `navigator.clipboard`.
- Na produção a SPA é servida por `guardinha://` via
  `registerAppProtocol` (substitui `file://`); todo handler IPC valida
  `event.senderFrame` com `assertAppFrame`. Fuses de segurança no electron-
  builder via chave `electronFuses`.
- Argon2id com custo por método de desbloqueio (PIN de 8 dígitos: 256 MB /
  t=4 / p=4; senha mestra e frase de recuperação: 128 MB / t=3 / p=4) e
  AES-256-GCM por arquivo: mudar parâmetros exige migrar o `vault.zkv` (hoje
  versão `3`, com o KDF de cada método dentro do container; a versão `2` ainda é
  lida e cada método é reembrulhado com o custo atual no próprio desbloqueio,
  e isso só é possível para quem tem a credencial) e converter entradas
  legadas.
- `.deb` e `out/` nunca entram no git.

## Documentação

- Documentação nova vai em `docs/`; o índice é `docs/README.md` e o
  `README.md` da raiz é a porta de entrada.
- Mapa: `docs/api.md` (contrato `window.api`), `docs/messages.md` (i18n e
  regras de tradução), `docs/seguranca.md` (onde cada medida mora no código).
- Convenção dos textos: português do Brasil, com pontuação adequada (vírgulas,
  dois-pontos, ponto e vírgula, parênteses e ponto final) e **sem travessões**.
