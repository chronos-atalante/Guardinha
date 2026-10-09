# Guardinha

Aplicativo desktop **Electron + TypeScript + React** para guardar credenciais
**100% offline**, com criptografia dupla, alvo **Linux Mint 22.X (Zena)** e
distribuição em **`.deb`**.

## Recursos

- **Cofre em `/var/lib/.guardinha/.vault/`** (padrão FHS de dados de
  aplicativos, fora de `~/`, sobrevive à limpeza da pasta do usuário; **pastas
  ocultas por padrão** com prefixo `.`, 0700, criadas pelo instalador do `.deb`;
  o cofre binário do XDG antigo e o legado `~/.guardinha-vault/` são migrados
  automaticamente): **nenhum arquivo legível**:
  `vault.zkv` binário guarda a chave do cofre embrulhada por senha mestra
  (24 caracteres), PIN (8 dígitos) e frase de recuperação **escrita pelo
  próprio usuário** (mínimo de 12 palavras; o app nunca gera).
- **Pasta raiz protegida**: `/var/lib/.guardinha/` é `root:root 0711` sem
  listagem: navegar ou apagar o topo exige sudo. Quando o app precisa criar
  a estrutura e falta permissão, ele abre o **diálogo padrão do Mint**
  (PolicyKit/`pkexec`) para você digitar a senha de administrador: a senha
  fica no sistema, nunca passa pelo app.
- **Integridade**: um manifesto cifrado dentro de `vault.zkv` lista as
  credenciais; arquivo removido ou injetado de fora do app é detectado e o
  acesso falha fechado (erro único de adulteração).
- **Acesso**: login só com **PIN**; a senha mestra é oferecida como opção
  apenas **após 3 falhas** de PIN; a frase de recuperação **não é forma de
  login**; serve exclusivamente para redefinir o PIN esquecido.
- **Checagem de força**: medidor ao vivo (nota, segmentos e motivos) na senha
  mestra, no PIN, na frase, na senha de cada credencial e na saída do gerador;
  na criação do cofre e na redefinição do PIN o processo main **recusa
  credencial previsível** (dígito repetido, sequência de ponta a ponta, mesmo
  bloco repetido, frase com palavras repetidas demais).
- **Criptografia**: Argon2id com custo definido por credencial, sendo o **PIN
  de 8 dígitos** com 256 MB / t=4 / p=4 (o segredo fraco, e por isso o mais
  caro) e a **senha mestra / frase de recuperação** com 128 MB / t=3 / p=4,
  além de **AES-256-GCM por registro** (`entries/<uuid>.zke`), com salt e IV de
  128 bits gerados por hardware e chave por arquivo via HKDF-SHA512.
- **Trava exponencial**: 10 s → 30 s → 1 min → 1 h → 24 h por tentativa errada,
  persistida em disco; auto-lock após 5 minutos ocioso.
- **Interface** em coluna com Sidebar (Início, Gerador de Senhas, Atribuições,
  Configurações), busca, copiar usuário/senha, botão de globo que **abre o site
  da credencial no navegador**, gerador de senhas com slider de tamanho,
  injeção de 5 palavras de entropia pessoal e pós-créditos de cinema.
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

| Comando                  | O que faz                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `npm run dev`            | Sobe o app em modo desenvolvimento (hot reload)               |
| `npm run typecheck`      | `tsc --noEmit` nos projetos node, web e testes                |
| `npm run lint`           | ESLint rigoroso (type-aware) em todo o repositório            |
| `npm run format`         | Formata tudo com Prettier                                     |
| `npm run check`          | typecheck + lint + format:check + auditoria OSV + shellcheck  |
| `npm test`               | Suíte Vitest (`tests/**/*.test.{ts,tsx}`)                     |
| `npm run security:audit` | OSV Scanner sobre o `package-lock.json` (`.osv-scanner.toml`) |
| `npm run lint:shell`     | Shellcheck nos scripts de `build/scripts/`                    |
| `npm run build`          | Limpa + compila main/preload/renderer                         |
| `npm run dist`           | Build + gera o `.deb` com electron-builder                    |

## Documentação

- [`docs/README.md`](docs/README.md) é o índice da documentação técnica:
  visão geral, arquitetura, cofre, credenciais, telas, API, mensagens, build,
  testes e mapa de segurança.
- Os guias mais consultados são [`docs/api.md`](docs/api.md) (contrato
  `window.api`) e [`docs/messages.md`](docs/messages.md) (i18n).

## Comunidade

- Quer contribuir? [`CONTRIBUTING.md`](CONTRIBUTING.md): ambiente, scripts,
  convenções e fluxo de PR; as regras duras estão em
  [`AGENTS.md`](AGENTS.md).
- Convivimento em [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md); dúvidas e ideias
  viram issue pelas templates de `.github/ISSUE_TEMPLATE/`.
- Vulnerabilidade de segurança: **não abra issue**:
  siga o [`SECURITY.md`](SECURITY.md).
- Lançamentos em [`CHANGELOG.md`](CHANGELOG.md); licenças dos componentes
  distribuídos em [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).

## Segurança

- Chave do cofre só em memória no processo main (dentro de um Singleton que
  zera o Buffer); nunca sai por IPC. O desbloqueio é uma cadeia de
  verificações (trava exponencial, formato, Argon2id, integridade).
- `contextIsolation: true`, `sandbox: true`, preload CJS e CSP no `index.html`.
- Nenhuma senha ou frase em log; erros chegam à UI já localizados.
- Navegação presa à página do app; `window.open` só repassa `https:` para o
  navegador do sistema; toda permissão web da sessão é negada (a cópia de
  usuário/senha usa o clipboard nativo no main).
- Copiar credencial limpa o clipboard 30 s depois, salvo cópia posterior do
  usuário; DevTools fica desligado no app empacotado.

## Licença

MIT; ver [`LICENSE`](LICENSE).
