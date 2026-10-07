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
- **Chave sempre protegida**: as chaves passam por Argon2id com 64 MB de
  memória (t=3, p=4; custo alto de propósito) e vivem só na memória do
  processo main: zeradas no lock e no auto-lock de 5 minutos, nunca por IPC,
  nunca em log. Erros do cofre não ecoam senha, PIN ou frase.
- **AES-256-GCM por registro**: salt e IV de 128 bits gerados por hardware,
  chave por arquivo via HKDF-SHA512; `vault.zkv` (versão 2) guarda chaves
  embrulhadas, trava exponencial e manifesto cifrado.
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
  menos o clipboard (necessário para copiar credenciais), DevTools está
  desligado no app empacotado e o conteúdo copiado expira sozinho do clipboard
  após 30 s (salvo cópia posterior do usuário).
- **Auditoria contínua**: `npm run security:audit` (OSV Scanner sobre o
  lockfile, filtro em `.osv-scanner.toml`) roda em todo `npm run check`;
  `npm run lint:shell` varre os scripts de empacotamento; o CodeQL roda no CI
  (push/PR para `main` e semanalmente).
- **Sem servidor intermediário**: o app não abre conexão de rede alguma: não
  há endpoint do Guardinha a atacar; credenciais nunca saem da máquina.

## Riscos aceitos (com justificativa)

- **Força bruta offline em `vault.zkv`**: quem já consiga ler o arquivo pode
  testar candidatas fora do app. Mitigado por Argon2id caro (64 MB por
  tentativa) e pela trava exponencial dentro do app; não há como o arquivo
  impor limite de tentativas por si só.
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
