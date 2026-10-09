# Política de segurança

## Versões suportadas

| Versão | Suporte             |
| ------ | ------------------- |
| 1.1.x  | ✅ Correções ativas |

Versões anteriores ao 1.0.0 não recebem correções; atualize pelo `.deb` mais
recente da Release correspondente (`npm run dist` gera em `release/`).

## Como reportar uma vulnerabilidade

**Não abra issue pública.** Descreva a falha em sigilo para quem mantém o
projeto (ver `author` em `package.json`), incluindo se possível:

- o que acontece e o impacto estimado;
- passo a passo para reproduzir;
- versão do app (campo `version` em `package.json`) e do sistema.

Nos comprometemos a confirmar o recebimento, investigar e, confirmado o
problema, publicar a correção com crédito a quem reportou (salvo pedido em
contrário).

## Proteções já existentes

- **Login em camadas**: só PIN; a senha mestra só é oferecida após 3 falhas de
  PIN; a frase de recuperação (≥ 12 palavras, escrita pelo próprio usuário)
  serve só para redefinir o PIN; nunca loga. Tentativas erradas disparam
  trava exponencial (10 s → 24 h) persistida em disco.
- **Credencial previsível recusada**: a criação do cofre e a redefinição do
  PIN validam a força da credencial **dentro do processo main** (módulo puro
  `src/shared/strength.ts`; o renderer só repete o mesmo código para o medidor
  ao vivo, nunca é a fronteira): dígito repetido (`00000000`), sequência de
  ponta a ponta (`12345678`), mesmo bloco repetido (`12121212`) e frase com
  quatro palavras distintas ou menos são bloqueados. O resto, como data de
  nascimento, palavra comum e PIN fraco, é orientação no medidor da UI e não
  barra a criação.
- **Chave sempre protegida**: as chaves passam por Argon2id com custo por
  credencial, sendo **PIN de 8 dígitos com 256 MB, t=4, p=4** (é o segredo
  fraco, com 10^8 candidatas, então o mais caro) e **senha mestra / frase de
  recuperação com 128 MB, t=3, p=4**. Elas vivem só na memória do processo
  main, dentro do `VaultSessionManager` (Singleton, `src/main/session.ts`),
  que zera o Buffer no lock, no auto-lock de 5 minutos e no encerramento do
  app; nunca passam por IPC e nunca aparecem em log. Erros do cofre não ecoam
  senha, PIN ou frase.
- **AES-256-GCM por registro**: salt e IV de 128 bits gerados por hardware,
  chave por arquivo via HKDF-SHA512; `vault.zkv` (versão 3) guarda cada chave
  embrulhada com o custo do Argon2id daquele método, a trava exponencial e o
  manifesto cifrado. Cofres na versão 2 continuam legíveis e cada método é
  reembrulhado com o custo atual no desbloqueio em que a credencial dele é usada.
- **Integridade fail-closed**: o manifesto cifrado lista os registros; arquivo
  removido ou injetado de fora do app vira um único erro de adulteração, sem
  detalhes: nada é carregado.
- **Cofre fora de `~/`**: `/var/lib/.guardinha/` é `root:root 0711` sem
  listagem (navegar/excluir o topo exige sudo) e o cofre é 0700 com dono
  usuário, sobrevive à limpeza da pasta do usuário e não fica em caminhos
  triviais de backup sincronizado.
- **Senha de administrador fora do app**: a criação da estrutura usa
  PolicyKit (`pkexec` + helper `guardinha-setup` do pacote, ação
  `com.guardinha.keypass.setup-vault`); o diálogo é do sistema e a senha
  nunca passa pelo app nem por IPC.
- **Renderer isolado**: CSP estrita no `index.html`, preload sandboxed
  (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`), sem
  HTML dinâmico; o renderer não acessa disco, rede nem Node; só
  `ipcRenderer.invoke` com contrato tipado (`docs/api.md`).
- **Fronteiras validadas**: ids de registro na IPC precisam de UUID e passam
  por `assertSafeEntryId` (rejeita `/`, `\` e `\0`; defesa em profundidade
  inspirada no CVE-2026-21589); navegação externa só pelos canais
  `shell:open-domain` e o tratador de `window.open`, que recusam protocolo fora
  de `http:`/`https:`.
- **Janela e sessão contidas**: a navegação do renderer fica presa na página do
  app (`will-navigate` recusa salto para outra URL), `window.open` não cria
  janela dentro do app, toda permissão web da sessão é negada no renderer
  (a cópia de credenciais passa pelo canal `clipboard:copy` e usa o clipboard
  nativo no processo main, sem pedir permissão), DevTools está desligado no app
  empacotado e o conteúdo copiado expira sozinho do clipboard após 30 s (salvo
  cópia posterior do usuário).
- **IPC fechado por origem**: todo handler confere `event.senderFrame` contra a
  página oficial do app (scheme `guardinha://` em produção ou dev server do
  Vite), bloqueando a mensagem antes do domínio tocar.
- **Sem `file://` em produção**: o renderer é servido por `guardinha://`
  (handler em `protocol.handle` com path-traversal rejeitado), e o
  `grantFileProtocolExtraPrivileges` está desligado via fuse.
- **Fuses do Electron**: `runAsNode: false`, `NODE_OPTIONS` e inspetor de
  `--inspect` desligados, `enableCookieEncryption: true`,
  `onlyLoadAppFromAsar: true`
  no `electron-builder`.
- **Auditoria contínua**: `npm run security:audit` (OSV Scanner sobre o
  lockfile, filtro em `.osv-scanner.toml`) roda em todo `npm run check`;
  `npm run lint:shell` varre os scripts de empacotamento; o CodeQL roda no CI
  (push/PR para `main` e semanalmente).
- **Sem servidor intermediário**: o app não abre conexão de rede alguma: não
  há endpoint do Guardinha a atacar; credenciais nunca saem da máquina.
- **Confinamento AppArmor**: o `.deb` instala um perfil restritivo em
  `/etc/apparmor.d/guardinha` (origem `build/apparmor-profile`, declarado em
  `build.deb.appArmorProfile`) sobre o executável
  `/opt/Guardinha/guardinha`. Ele nega leitura de arquivos do usuário, nega
  escrita fora dos diretórios do app, do cofre e do `$XDG_CONFIG_HOME` do
  app, nega rede `inet`/`inet6` (só `unix` e `netlink`, já que o app é
  offline) e nega execução de qualquer binário fora da lista curta do pacote
  (`chrome-sandbox`, `chrome_crashpad_handler`) e dos dois helpers do sistema
  (`pkexec`, `xdg-open`). Validado em `enforce` com zero negações de operação
  legítima no ciclo de vida completo do app.

## Riscos aceitos (com justificativa)

- **Força bruta offline em `vault.zkv`**: quem já consiga ler o arquivo pode
  testar candidatas fora do app, e a trava exponencial (10 s → 24 h) só vale
  dentro dele: não há como o arquivo impor limite de tentativas por si só.
  Mitigado por Argon2id caro por tentativa: o PIN de 8 dígitos é o elo mais
  fraco e por isso custa 256 MB / t=4 (cerca de 5× os 64 MB / t=3 antigos),
  o que leva uma varredura completa de 10^8 candidatas de horas (da ordem de
  17 h numa RTX 4090 no custo antigo) para dias em GPU e semanas num desktop
  moderno; senha mestra (24 caracteres) e frase (12+ palavras) têm entropia
  própria e ficam em 128 MB / t=3. O PIN de 8 dígitos continua sendo o limite
  aceito desse cofre.
- **A trava exponencial protege contra o app, não contra o disco**: o campo
  `attempts` do `vault.zkv` mora num arquivo com dono usuário, então quem já
  tenha o arquivo pode zerá-lo e chutar à vontade. A trava serve para conter
  tentativas pela interface do app (e recusa a espera sem nem chegar a rodar o
  Argon2); a defesa real contra atacante com o arquivo e tempo ilimitado é o
  custo do Argon2id, medido em ~2,1 s por chute de PIN num desktop modesto.
  Nada a mudar no código: trava online mais KDF caro é o modelo correto, e a
  trava não é considerada barreira de segurança contra leitura do disco.
- **Chave em memória enquanto o cofre está aberto**: com o cofre destravado,
  qualquer código rodando como o mesmo usuário lê `/proc/<pid>/mem` e
  recupera a chave de 32 bytes. Inerente a aplicativo desktop com cofre local
  (não há TPM nem cofre de hardware no alvo). Mitigado por zerar a chave no
  lock manual e no auto-lock de 5 minutos, o que limita a janela de exposição;
  rodar como outro usuário já está fora do escopo (abaixo).
- **`/usr/bin/xdg-open` sai do confinamento**: para `shell.openExternal` (o
  botão que abre o domínio da credencial no navegador) funcionar, o perfil
  concede `ux` ao abridor do sistema: a cadeia inteira (shell, `gio`,
  `gio-launch-desktop` e o navegador) roda sem confinamento depois da execução.
  Sem isso o wrapper do navegador é negado e o recurso quebra. O que isso
  entrega a um atacante que já rode dentro do app é abrir um endereço ou um
  tipo de arquivo já registrado no sistema (o mesmo que o próprio app faz);
  não há como criar o handler pelo perfil, pois escrever em
  `~/.local/share/applications` continua negado. Aceito por ser o único caminho
  suportado para abrir URLs no Linux sem reescrever o mecanismo do sistema.
- **`GUARDINHA_VAULT_DIR` / `GUARDINHA_VAR_LIB`**: variáveis de ambiente
  redirecionam o cofre (usadas por testes e `npm run dev`). Quem controla o
  ambiente do processo do usuário já está no mesmo nível de ameaça que a chave
  em memória, sem ganho adicional para um atacante local.
- **Dependências sem fix upstream**: problemas em dependências sem versão
  corrigida publicada são documentados com data de revisão em
  `.osv-scanner.toml` e voltam a aparecer no `security:audit` quando a data
  passa, monitorados a cada `npm run check`.

## Fora de escopo

- Engenharia social, phishing, spam e ataques a serviços de terceiros
  (GitHub, npm, sites abertos pelo navegador).
- Falhas que exijam acesso físico ao PC já desbloqueado ou malware rodando
  como o próprio usuário (mesmo nível de ameaça da chave em memória).
