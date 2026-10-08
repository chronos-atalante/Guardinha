# Build, pacote e distribuição

O app é compilado com electron-vite (`main`, `preload` e `renderer`) e
empacotado em `.deb` pelo electron-builder. Nada disso entra no git: `out/`,
`release/`, `apt/` e `*.deb` estão no `.gitignore`.

## Comandos

| Comando                      | O que faz                                                    |
| ---------------------------- | ------------------------------------------------------------ |
| `npm run dev`                | Sobe com hot reload usando o cofre de teste em `.dev-vault/` |
| `npm run build`              | Apaga `out/` e compila os três bundles                       |
| `npm start`                  | Pré-visualiza o build (`electron-vite preview`)              |
| `npm run dist`               | Build + gera o `.deb` em `release/`                          |
| `npm run dist:dir`           | Mesmo, mas deixa a árvore descompactada (`--dir`)            |
| `npm run check`              | typecheck, lint, formato, OSV Scanner e shellcheck           |
| `npm test`                   | Suíte Vitest                                                 |
| `npm run test:coverage`      | Suíte com cobertura em `coverage/`                           |
| `python3 build/make-icon.py` | Regenera `build/icon.png` (requer PIL)                       |

Os binários `bin/osv-scanner` e `bin/shellcheck` não são versionados; copie-os
de `Chronos/Biblioteca/bin/` ou baixe as releases correspondentes.

## Saída do build

| Caminho                 | Conteúdo                                               |
| ----------------------- | ------------------------------------------------------ |
| `out/main/index.js`     | Processo principal (bundled pelo Vite em modo SSR)     |
| `out/preload/index.cjs` | Ponte `contextBridge` (CommonJS, exigido pelo sandbox) |
| `out/renderer/`         | HTML, CSS e JS da interface                            |
| `release/`              | `.deb` e árvore gerada pelo electron-builder           |

Os aliases `@zero/*` são resolvidos na hora do bundle
(`electron.vite.config.mts`), então o pacote não depende do `tsconfig` em tempo
de execução.

## O que vai dentro do `.deb`

Bloco `build` do `package.json`:

| Chave            | Valor                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| `appId`          | `com.guardinha.keypass`                                                       |
| `target`         | `deb` para Linux (categoria Utility)                                          |
| `asar`           | ligado (o código vive no `app.asar`)                                          |
| `extraResources` | `build/scripts/guardinha-setup` (helper do PolicyKit)                         |
| `depends`        | GTK, libnotify, NSS, xdg-utils e afins do Electron                            |
| `afterInstall`   | `build/scripts/after-install.sh`                                              |
| `afterRemove`    | `build/scripts/after-remove.sh`                                               |
| `electronFuses`  | `runAsNode`, `NODE_OPTIONS` e inspetor desligados (detalhe em `seguranca.md`) |

### `after-install.sh` (postinst)

Além do padrão do electron-builder (link do executável, AppArmor, banco de
MIME), ele:

1. Renomeia layouts antigos (`/var/lib/guardinha` para `/var/lib/.guardinha`)
   preservando os dados.
2. Cria a raiz com `root:root 0711` e `.vault` com `0700` no dono de quem
   instalou (`SUDO_UID`/`PKEXEC_UID`).
3. Escreve a ação do PolicyKit em
   `/usr/share/polkit-1/actions/com.guardinha.keypass.policy`, que autoriza o
   `pkexec` a rodar o helper `guardinha-setup`.

### `guardinha-setup`

Executado como root pelo `pkexec`, só cria e renomeia diretórios fixos com
modos fixos: nenhum caminho vem do chamador. O dono vem de `PKEXEC_UID`.

### `after-remove.sh` (postrm)

Remove link, perfil do AppArmor e a ação do PolicyKit. **Os dados em
`/var/lib/.guardinha/` permanecem**; desinstalar não apaga o cofre.

## Integridade do build

- `npm run check` antes de commitar (é a barra do CONTRIBUTING).
- `after-install.sh`, `after-remove.sh` e `guardinha-setup` passam pelo
  shellcheck (`npm run lint:shell`).
- As dependências passam pelo OSV Scanner (`npm run security:audit`, filtro em
  `.osv-scanner.toml`).
- Fuses do Electron no bloco `build.electronFuses` do `package.json`:
  `runAsNode`, `enableNodeOptionsEnvironmentVariable` e
  `enableNodeCliInspectArguments` desligados; `enableCookieEncryption` e
  `onlyLoadAppFromAsar` ligados.

## Publicação (CI)

Fluxo completo em `CONTRIBUTING.md` (seção 10); resumo do
`.github/workflows/publish.yml`:

1. Push na `main` ou tag `v*` dispara o workflow **Publicar .deb**.
2. O job **resolver-versao** compara `package.json` com as Releases e decide se
   há o que publicar (push sem bump de versão vira execução verde e rápida).
3. O job **build-deb** compila, roda o `electron-builder`, cria a tag
   `vX.Y.Z` se não existir e publica a Release.
4. Na mesma Release sobem o `.deb` e o **repo APT flat assinado**
   (`Packages`, `Packages.gz`, `Release`, `Release.gpg`, `InRelease`,
   `public.key` e o alias `guardinha_amd64.deb` em `releases/latest/download/`),
   que é o que mantém o `sudo apt upgrade` vivo.

Secrets necessários: `GPG_PRIVATE_KEY` (e `GPG_PASSPHRASE`, se houver). As
actions estão fixadas por SHA e atualizadas pelo Dependabot.

## Outros workflows

| Arquivo          | Papel                                        |
| ---------------- | -------------------------------------------- |
| `codeql.yml`     | CodeQL em push/PR para `main` e semanalmente |
| `agradecer.yml`  | Comentário de agradecimento ao mesclar um PR |
| `dependabot.yml` | PRs semanais para dependências npm e actions |
