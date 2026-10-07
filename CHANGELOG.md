# Registro de mudanças

Todos os lançamentos seguem [versionamento semântico](https://semver.org/lang/pt-BR/)
(`MAJOR.MINOR.PATCH`) e o formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
em português do Brasil.

## [1.0.1] - 2026-10-07

### Alterado

- Ferramenta de build atualizada: vite 8 (rolldown) e electron-vite
  6.0.0-beta.6 — build mais rápido e bundle do renderer menor, sem mudança
  de comportamento do app.

### Corrigido

- CI: `github/codeql-action` em v4.38.2 com `init` e `analyze` na mesma
  versão; `npm ci` volta a resolver as dependências (peer do electron-vite
  com vite 8); a publicação do `.deb` tolera a ausência dos segredos
  opcionais de GPG/APT e Vercel.

## [1.0.0] - 2026-10-07

Primeira versão pública do **Guardinha** (pacote `.deb` para Linux Mint 22.X).

### Adicionado

- Cofre offline de credenciais: registros com usuário/senha, busca, copiar
  usuário/senha e botão que abre o site da credencial no navegador
  (canal `shell:open-domain`, restrito a `http:`/`https:`).
- Acesso em camadas: login só com **PIN**; a senha mestra só é oferecida após
  3 falhas de PIN; a frase de recuperação (mínimo de 12 palavras, escrita pelo
  próprio usuário, o app nunca gera) serve exclusivamente para redefinir o
  PIN — nunca é forma de login.
- Trava exponencial (10 s → 30 s → 1 min → 1 h → 24 h) persistida em disco e
  auto-lock após 5 minutos ocioso.
- Criptografia: Argon2id (64 MB, t=3, p=4) embrulhando as chaves em `vault.zkv`
  (versão 2) e AES-256-GCM por registro em `.entries/<uuid>.zke`, com chave por
  arquivo via HKDF-SHA512 e salt/IV de 128 bits.
- Manifesto cifrado com integridade fail-closed: registro removido ou injetado
  de fora do app é detectado e o acesso falha com um único erro de adulteração.
- Cofre em `/var/lib/.guardinha/.vault/` (fora de `~/`; topo `root:root 0711`
  sem listagem, cofre 0700 com dono usuário, pastas ocultas) criado pelo
  `postinst` do `.deb`; migração automática do legado `~/.guardinha-vault/`
  (JSON) e do XDG visível para o layout oculto binário.
- Criação da estrutura via PolicyKit: helper `guardinha-setup` do pacote
  chamado com `pkexec` (ação `com.guardinha.keypass.setup-vault`); a senha de
  administrador é digitada no diálogo do sistema e nunca passa pelo app.
- Interface React com Sidebar (Início, Configuração & Gerador, Atribuições),
  busca, gerador de senhas com slider de baixa sensibilidade e pós-créditos de
  cinema.
- Idiomas pt-BR (canônico) e en, escolhidos em Configuração e persistidos em
  `$XDG_CONFIG_HOME/guardinha/settings.json` (textos em `src/messages/`; ver
  `docs/messages.md`).
- Qualidade no `npm run check`: typecheck, ESLint, Prettier, auditoria OSV
  (`osv-scanner` + `.osv-scanner.toml`) e shellcheck nos scripts de
  empacotamento.
- CI no GitHub Actions: publicação automática de Release + repo APT flat
  (`publish.yml`), CodeQL, Dependabot, agradecimento a PRs mesclados e
  templates de issue/PR.
- Documentação: `README.md` (índice), `AGENTS.md`, `docs/api.md`,
  `docs/messages.md`, governança (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `LICENSE`) e avisos de terceiros (`THIRD-PARTY-NOTICES.txt`).

### Segurança

- Renderer com CSP estrita, preload sandboxed (`contextIsolation: true`,
  `sandbox: true`), sem `innerHTML` dinâmico e sem acesso a disco ou rede —
  tudo via IPC tipado (`docs/api.md`).
- Chave do cofre só na memória do processo main; zerada no lock e no
  auto-lock; nenhuma senha, PIN ou frase em log ou eco de erro.
- Fronteiras validadas: ids de registro com anti path-traversal
  (`assertSafeEntryId`, defesa em profundidade inspirada no CVE-2026-21589) e
  `openExternal` exclusivamente para `http:`/`https:`.
