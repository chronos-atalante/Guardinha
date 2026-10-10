# Registro de mudanças

Todos os lançamentos seguem [versionamento semântico](https://semver.org/lang/pt-BR/)
(`MAJOR.MINOR.PATCH`) e o formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
em português do Brasil.

## [1.4.1]

### Adicionado

- **Cryptographic Erase**: botão de autodestruição na barra lateral que
  sobrescreve e apaga o cofre inteiro. Apagar o `vault.zkv` é o que destrói o
  cofre, porque ele é o único lugar onde existe a chave embrulhada; sem a
  chave, cada `.zke` vira ruído matemático. A chave da RAM é zerada **antes**
  de qualquer I/O (`panicDestroy`, em `src/main/vault.ts`).
- **PIN de coação** (`src/main/vault.ts`): um segundo PIN que abre um cofre
  vazio enquanto aciona a mesma autodestruição, para uso sob coação física. É
  verificado antes da trava exponencial (quem está sob coação não espera 24 h),
  não conta tentativa (para não denunciar a existência do segundo caminho) e
  paga o mesmo Argon2id de um PIN comum (para não ser medido pelo atacante). A
  sessão de coação não guarda chave alguma. Configurável em Configurações.
- **Autodestruição por tentativas da senha mestra**: limite configurável que
  dispara o Cryptographic Erase ao ser cruzado. **Desligada por padrão**, com
  piso 50, porque apagar o cofre por contagem é irreversível e a frase de
  recuperação não salva nessa situação. Falha de PIN e de frase não contam
  para esse limite.
- **Sobrescrita antes do `unlink`** (`src/main/shred.ts`): todo arquivo
  apagado pelo app passa por sobrescrita em blocos de 64 KiB alternando bytes
  aleatórios e zeros, com `fsync` antes de fechar e `fsync` do diretório pai.
  O arquivo é aberto com `O_NOFOLLOW`, então symlink não é seguido.
- **Varredura de temporários órfãos**: um `.tmp` deixado por um crash não é
  coberto pelo manifesto; agora eles são sobrescritos e apagados na
  inicialização, antes do primeiro `vault:status` responder.

### Alterado

- **Container do cofre na versão 4**: cabeçalho de 45 para 53 bytes, com
  `attemptsMaster` e `nukeLimit` logo depois da máscara de flags, e a flag do
  método de pânico. Cofres nas versões 2 e 3 continuam legíveis (com os campos
  novos valendo zero) e sobem de versão no próximo desbloqueio; o tamanho do
  cabeçalho passou a ser função da versão, e não uma constante só.
- **Persistência reorganizada por domínio**: `layout.ts` (caminhos, sem `fs`),
  `structure.ts` (pastas e permissões), `entries-store.ts` (os arquivos
  `.zke`/`.enc`) e `erase.ts` (a orquestração da destruição). O `storage.ts`
  ficou só com o `vault.zkv` e as migrações, dentro do teto de linhas do
  repositório.
- **Configurações** deixa de ser uma tela de aviso e passa a ter as duas
  proteções de pânico, atrás do cofre desbloqueado.
- Suíte de testes com 23 arquivos e 213 testes (antes 19 e 144).

### Corrigido

- **Tela travada quando a sessão do cofre some no meio de uma operação**: a
  chave pode ser zerada entre o status que o renderer recebeu e a chamada de
  dados seguinte, seja pelo auto-lock disparando com a tela montada, seja pelo
  restart do processo main em `npm run dev` (que recria o `VaultSessionManager`
  vazio e deixa o renderer com a tela antiga). O renderer ficava chamando
  `entries:list` contra um cofre que não existia mais, com um erro no console
  que ninguém entendia. Agora as operações que exigem a chave avisam o renderer
  pelo mesmo canal do auto-lock, e ele volta para a autenticação. A resposta
  continua sendo erro de propósito: devolver lista vazia faria o app parecer um
  cofre vazio, que é a pior leitura possível num app de credenciais
  (`withSessionNotice`, em `src/main/index.ts`).
- **Ruído de VA-API na partida**: o Chromium imprimia
  `libva error: iHD_drv_video.so init failed` ao subir em máquina com o driver
  de vídeo do Intel quebrado. Desligada apenas a decodificação acelerada de
  vídeo (`--disable-accelerated-video-decode`), que o app não usa: ele não tem
  `<video>`, WebCodecs nem captura de canvas, e a composição de tela continua
  na GPU. Desligar a GPU inteira resolveria a mensagem também, mas trocaria a
  aceleração da interface por software em todas as máquinas.

### Corrigido

- **Publicação sob gate de qualidade**: o workflow que gera e publica o `.deb`
  ganhou o job **Verificar qualidade** (`npm run check`, com OSV Scanner e
  shellcheck, mais `npm test`), espelhando o repositório do Chronos Biblioteca.
  O job de publicação passou a depender dele (`needs: [resolver-versao,
qualidade]`), então falha de tipo, lint, formato, auditoria ou teste
  interrompe a Release. Antes, esse tipo de erro só apareceria no `.deb` que o
  usuário instala.

### Segurança

- **O container não ressuscita depois de um erase**: `writeVaultContainer`
  recusa escrever enquanto o processo marcar o cofre como destruído, para que
  um `writeAuthState`, um `initManifest` ou um `VaultContainerData` ainda em
  memória não recriem um `vault.zkv` sem chave e transformem "cofre destruído"
  em "cofre adulterado". Só `createVault` libera a guarda.
- **Autenticação**: a senha mestra tem agora contador próprio
  (`attemptsMaster`), separado do contador geral, para que o limite estrito não
  seja acionado por erro de digitação de PIN.
- Novo estado de sessão "decoy", sem chave, para o PIN de pânico: a lista de
  credenciais vem vazia e nenhum `.zke` pode ser decifrado a partir dele.

### Documentação

- `SECURITY.md`, `docs/cofre.md`, `docs/seguranca.md`, `docs/api.md`,
  `docs/telas.md`, `docs/testes.md` e `AGENTS.md` descrevem a nova estratégia
  de destruição, o PIN de pânico e o limite por tentativas, incluindo os
  riscos aceitos: o PIN de pânico não passa pela trava e não conta tentativa, e
  a autodestruição por contagem nasce desligada.
- Justificativa registrada de por que a sobrescrita **não é garantia em SSD** e
  de por que o Cryptographic Erase é a estratégia primária lá, e de por que o
  app não roda `fstrim` (o perfil AppArmor nega, e TRIM é do sistema).

## [1.3.1] - 2026-10-08

### Segurança

- **AppArmor em enforce real**: o perfil decorativo do electron-builder foi
  substituído por `build/apparmor-profile` (gerado no build e instalado pelo
  `postinst`); o app sobe confinado de verdade e o `SECURITY.md` passou a
  listar os riscos aceitos (a trava exponencial protege contra o app, não
  contra o disco; a chave fica em memória enquanto o cofre está aberto).
- **Clipboard limpo em 30 s**: copiar usuário ou senha agora passa pelo
  `SecureClipboardProxy` no processo main (`src/main/clipboard.ts`); o
  renderer não usa mais `navigator.clipboard` e a cópia some da área de
  transferência 30 s depois, salvo o usuário copiar outra coisa antes.
- **Auto-lock de 5 minutos**: sem operação no cofre a chave sai da memória
  sozinha (`ActivityMonitor`, padrão Observer, em `src/main/activity.ts`) e o
  renderer recebe o evento `vault:auto-locked` (canal novo, `docs/api.md`),
  além do polling de 15 s que continua como rede de segurança.
- Vetores do relatório de análise reexecutados e cobertos pela suíte:
  permissões, adulteração de byte, injeção/remoção de arquivo e trava sem
  Argon2id na espera (`tests/main/window.test.ts`,
  `tests/main/facade.test.ts`, `tests/main/vault.test.ts`,
  `tests/main/unlock.test.ts`); 19 arquivos e 144 testes no total.

### Alterado

- Chave do cofre com um único dono: `VaultSessionManager` (Singleton,
  `src/main/session.ts`) guarda e zera a chave no lock, no auto-lock e no
  encerramento do app; nenhum outro módulo mantém cópia.
- Persistência atrás da fachada `VaultStorageFacade` (`src/main/facade.ts`):
  `vault.ts` e `entries.ts` pedem operações de alto nível e não tocam mais
  `fs`, AES-256-GCM nem o manifesto direto.
- Desbloqueio em cadeia de manipuladores (`src/main/unlock.ts`, Chain of
  Responsibility): trava exponencial barata corta antes da validação de
  formato, que corta antes do Argon2id; PIN malformado não paga mais 256 MB
  de derivação e quem espera a trava não gasta tentativa nova.
- Embrulho e desembrulho da chave por tipo de credencial
  (`src/main/unwrapping.ts`, Factory Method) e medidor de força por Strategy
  (`src/shared/strategy.ts`), no lugar dos `evaluate*` avulsos.
- Contagem regressiva da trava unificada em `src/shared/format.ts` (estava
  repetida no main e no renderer).
- Custo do Argon2id revalidado por benchmark nesta máquina: ~2,1 s por chute
  de PIN com a máquina quieta e ~4 a ~16 s sob carga do desktop; o processo
  main fica bloqueado só durante a derivação, e o renderer (processo
  separado) segue responsivo. Testes de Argon2id real ganharam teto de 120 s
  para não virar falso positivo sob carga.

## [1.2.1] - 2026-10-08

### Adicionado

- Aba **Configurações** na sidebar, logo abaixo de Atribuições: por ora mostra
  apenas o aviso de que as configurações serão implementadas em uma versão
  futura (idioma e bloqueio do cofre continuam na barra lateral).
- **Checagem de força** compartilhada (`src/shared/strength.ts`, usada por
  renderer e main): medidor ao vivo com nota de 0 a 4 e motivos em senha
  mestra, PIN, frase de recuperação, senha da credencial salva e saída do
  gerador, além de dica própria para cada tipo de credencial.
- Documentação técnica nova em `docs/`: índice em `docs/README.md` e guias de
  visão geral, arquitetura, cofre, credenciais, telas, build, testes e mapa de
  segurança; `docs/api.md` e `docs/messages.md` passaram a apontar a checagem
  de força e o `README.md` ganhou a seção Documentação.

### Alterado

- Sidebar reordenada e renomeada: **Início (Senhas)**, **Gerador de Senhas**,
  **Atribuições** e **Configurações**; o item "Configuração & Gerador" virou
  "Gerador de Senhas", também no título da tela.
- Textos dos `.md` revisados: pontuação do português do Brasil e remoção de
  travessões em `README.md`, `SECURITY.md`, `AGENTS.md` e `CHANGELOG.md`.

### Segurança

- `vault.zkv` passa à **versão 3**: cada método de desbloqueio guarda o próprio
  custo do Argon2id: **PIN de 8 dígitos com 256 MB / t=4 / p=4** (o segredo
  fraco, o mais caro) e **senha mestra / frase de recuperação com 128 MB /
  t=3 / p=4** (antes 64 MB / t=3 para todos). Cofres na versão 2 continuam
  legíveis e cada método é reembrulhado com o custo atual no desbloqueio em que
  a credencial dele é usada (migração incremental: só quem tem a credencial
  consegue reembrulhar).
- Parâmetros KDF fora de uma faixa segura agora são recusados na leitura e na
  gravação do container (fail-closed), para um arquivo adulterado não conseguir
  exigir memória ou CPU ilimitadas do app.
- Custo maior por tentativa: no hardware de referência (i7 antigo) o
  desbloqueio com PIN passou de ~0,4 s para ~2 s e a senha mestra / frase de
  ~0,4 s para ~0,8 s; criar o cofre também fica mais lento.
- Criação do cofre e redefinição do PIN **recusam credencial previsível**,
  com a regra rodando também no processo main (não se confia no renderer):
  dígito repetido (`00000000`), sequência de ponta a ponta (`12345678`),
  mesmo bloco repetido (`12121212`), frase com quatro palavras distintas ou
  menos; data de nascimento, palavra comum e PIN fraco são **só avisados** no
  medidor, nunca recusados (`errors.trivialMaster`/`trivialPin`/`trivialPhrase`).

## [1.1.0] - 2026-10-07

### Segurança

- janela: navegação presa na página do app (`will-navigate` recusa qualquer
  URL fora da página carregada) e `window.open` nunca cria janela: só repassa
  `https:` para o navegador do sistema (`setWindowOpenHandler`).
- sessão: toda permissão web do renderer (mídia, geolocalização, notificações…)
  é negada; só o clipboard passa, para copiar usuário/senha.
- área de transferência: copiar usuário, senha ou senha gerada limpa o
  clipboard 30 s depois, salvo o usuário já ter copiado outra coisa antes
  (`src/renderer/src/clipboard.ts`).
- produção: DevTools desligado no app empacotado (`devTools: !app.isPackaged`).
- IPC pelo frame oficial: todo handler chegou com `assertAppFrame(event)`, que
  confere `event.senderFrame` contra a página do scheme `guardinha://` (ou o
  Vite dev server), bloqueando qualquer frame de fora antes do domínio.
- renderer entregue via scheme `guardinha://` em produção
  (`registerAppProtocol` serve `out/renderer`), em vez de `file://`; CSP com
  `object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action
'self'`.
- `electronFuses` no electron-builder: `runAsNode: false`,
  `enableNodeOptionsEnvironmentVariable: false`,
  `enableNodeCliInspectArguments: false`, `enableCookieEncryption: true`,
  `onlyLoadAppFromAsar: true` e
  `grantFileProtocolExtraPrivileges: false`.

## [1.0.3] - 2026-10-07

### Alterado

- Seletor de idioma na Sidebar voltou a ser um campo retangular com o menu
  embutido: o menu abre abaixo do campo, o item ativo aparece em verde com
  check, e o campo fecha no clique fora, no `Escape` ou após a escolha (com
  navegação por setas, Home e End).

## [1.0.2] - 2026-10-07

### Alterado

- Slider do gerador voltou à sensibilidade normal do mouse: o arraste
  acompanha o cursor (o teclado continua com setas e Page Up/Page Down).
- Seletor de idioma na Sidebar virou duas pílulas (pt/en) no lugar do
  `<select>`, no mesmo estilo dos retângulos de status, categoria e tipo do
  chronos-biblioteca.
- Pontuação em português sem travessões: textos da interface, comentários e
  documentação usam vírgula, dois-pontos e ponto e vírgula no lugar do
  travessão tipográfico.

## [1.0.1] - 2026-10-07

### Alterado

- Ferramenta de build atualizada: vite 8 (rolldown) e electron-vite
  6.0.0-beta.6, com build mais rápido e bundle do renderer menor, sem mudança
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
  PIN; nunca é forma de login.
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
  `sandbox: true`), sem `innerHTML` dinâmico e sem acesso a disco ou rede,
  tudo via IPC tipado (`docs/api.md`).
- Chave do cofre só na memória do processo main; zerada no lock e no
  auto-lock; nenhuma senha, PIN ou frase em log ou eco de erro.
- Fronteiras validadas: ids de registro com anti path-traversal
  (`assertSafeEntryId`, defesa em profundidade inspirada no CVE-2026-21589) e
  `openExternal` exclusivamente para `http:`/`https:`.
