# O cofre

O cofre é o conjunto de arquivos onde vivem as chaves embrulhadas e as
credenciais cifradas. Ele fica em `/var/lib/.guardinha/`, fora de `~/`, para
sobreviver à limpeza da pasta do usuário e não cair em caminho trivial de
backup sincronizado.

## Caminhos e permissões

| Caminho                                    | Dono / modo      | Conteúdo                                        |
| ------------------------------------------ | ---------------- | ----------------------------------------------- |
| `/var/lib/.guardinha/`                     | `root:root 0711` | Raiz sem listagem: navegar ou apagar exige sudo |
| `/var/lib/.guardinha/.vault/`              | usuário, `0700`  | Diretório do cofre                              |
| `.vault/vault.zkv`                         | do usuário       | Container: chaves embrulhadas, trava, manifesto |
| `.vault/.entries/<uuid>.zke`               | do usuário       | Uma credencial salva, cifrada por arquivo       |
| `$XDG_CONFIG_HOME/guardinha/settings.json` | do usuário       | Preferências (idioma)                           |

O `npm run dev` não usa `/var/lib`: ele aponta o cofre para `.dev-vault/` na
raiz do projeto por meio de `GUARDINHA_VAULT_DIR`.

### Quem cria a pasta

1. O `postinst` do `.deb` (`build/scripts/after-install.sh`) cria a raiz com
   `root:root 0711` e `.vault` com `0700` no dono de quem instalou.
2. Se faltar permissão no primeiro uso, o app chama `pkexec` com o helper
   `guardinha-setup` (ação PolicyKit `com.guardinha.keypass.setup-vault`). A
   senha é digitada no diálogo do sistema e nunca passa pelo app.
3. Com `GUARDINHA_VAULT_DIR` ou `GUARDINHA_VAR_LIB` definidas (testes e dev),
   o `pkexec` não é disparado.

## Formato do `vault.zkv`

Arquivo binário com magic `ZKVAULT1`, escrito e lido apenas em
`src/main/container.ts`. Toda leitura é fail-closed: forma inválida,
truncamento, parâmetro fora da faixa, flag desconhecida ou byte a mais no fim
devolvem `null` (tratado como adulterado), nunca conteúdo em claro.

Cabeçalho de **53 bytes** na versão 4 (valores em big endian):

| Offset | Tamanho | Campo                                          |
| ------ | ------- | ---------------------------------------------- |
| 0      | 8       | Magic `ZKVAULT1`                               |
| 8      | 4       | Versão (`4` atual; `3` e `2` ainda legíveis)   |
| 12     | 8       | `createdAt` (epoch em ms)                      |
| 20     | 4       | `memoryKiB` do KDF global (informativo em v3+) |
| 24     | 4       | `iterations` do KDF global                     |
| 28     | 4       | `parallelism` do KDF global                    |
| 32     | 4       | Tentativas da trava exponencial                |
| 36     | 8       | `lockUntil` (epoch em ms; `0` = sem trava)     |
| 44     | 1       | Máscara de flags do que vem a seguir           |
| 45     | 4       | `attemptsMaster` (só senha mestra; v4)         |
| 49     | 4       | `nukeLimit` (0 = desligado; v4)                |

O cabeçalho tem tamanho **função da versão**: um arquivo v3 tem 45 bytes e os
dois campos novos simplesmente não existem nele, então a leitura devolve `0`
para os dois (autodestruição por contagem nasce desligada num cofre antigo) e
o cursor dos blobs começa em 45 em vez de 53. É por isso que o tamanho não pode
ser uma constante só no código.

Depois do cabeçalho vêm os blocos indicados pelas flags, nesta ordem: chave
embrulhada da senha mestra, do PIN, da frase de recuperação, do **PIN de
coação** e o manifesto. Cada bloco traz
`salt(16) + iv(16) + tag(16) + tamanho(4) + texto cifrado`; em **v3 e v4**
cada método também traz os próprios 12 bytes de parâmetros Argon2id antes do
salt.

## Custo do Argon2id por método

O custo é escolhido na criação e fica gravado no arquivo, por método
(`src/main/crypto.ts`):

| Método                  | Perfil            | Por quê                                           |
| ----------------------- | ----------------- | ------------------------------------------------- |
| PIN (8 dígitos)         | 256 MiB, t=4, p=4 | 10^8 candidatas: é o elo fraco, então o mais caro |
| Senha mestra (24 chars) | 128 MiB, t=3, p=4 | Segredo longo: a entropia já ajuda                |
| Frase (12+ palavras)    | 128 MiB, t=3, p=4 | Segredo longo, escrito pelo usuário               |

A leitura só aceita parâmetros dentro de uma faixa fixa (memória de 16 MiB a
1 GiB, 1 a 8 iterações e 1 a 8 threads). Fora disso o arquivo é tratado como
adulterado: a faixa existe para um `vault.zkv` adulterado não conseguir exigir
memória ou CPU ilimitadas, não como garantia mínima de segurança.

Cofres gravados na versão 2 (KDF único no cabeçalho) continuam legíveis e cada
método é reembrulhado com o perfil atual **no desbloqueio em que a própria
credencial dele é usada**. Só quem já tem a credencial consegue fazer isso. A
versão 3 (cabeçalho de 45 bytes, sem os campos de pânico) segue a mesma regra.

## Destruição do cofre

O cofre inteiro morre quando os **blobs de chave embrulhada** morrem, porque
eles vivem no `vault.zkv`. Depois disso os `.zke` viram ruído matemático
irrecuperável. É essa a ideia do Cryptographic Erase: não é preciso sobrescrever
gigabytes, é preciso apagar a chave.

`eraseVault` (`src/main/erase.ts`) apaga, nesta ordem e sem desvios:

1. `vault.zkv` e o `vault.zkv.tmp` (o `.tmp` **contém os mesmos blobs de
   chave**; um órfão de crash seria uma cópia completa do embrulho);
2. todo arquivo de `.entries/` (`.zke`, `.zke.tmp`, `.enc`);
3. a pasta `.entries` em si.

Nunca `vaultDir()` nem `.guardinha/`: a raiz é do sistema (`root:root 0711`,
criada no `postinst`) e o app não é dona dela. Antes de tudo roda
`migrateHiddenLayout()`, senão um cofre com o layout antigo fica com `entries/`
de pé e os nomes dos arquivos aparecem em disco.

Cada arquivo passa por `shredFile` (`src/main/shred.ts`): sobrescrita em blocos
de 64 KiB alternando bytes aleatórios e zeros, terminada em zeros, com
`fsync` antes de fechar, `unlink` e `fsync` do diretório pai. O arquivo é
aberto com `O_NOFOLLOW` e `lstat` recusa symlink e diretório. Falha de shred
**não** impede a autodestruição: quem apaga o arquivo e o diretório conta o
que caiu e o que resistiu, e segue.

Depois do erase, `writeVaultContainer` recusa escrever (`erasure-state.ts`):
sem essa guarda, um `writeAuthState`, um `initManifest` ou um
`VaultContainerData` ainda em memória recriariam um `vault.zkv` pela metade, sem
chave, e o usuário veria "cofre adulterado" onde o certo é "cofre destruído".
Só `createVault` libera a guarda, porque só o usuário cria um cofre novo.

### PIN de coação

O método `panic` do container embrulha uma chave **decoy** de 32 bytes
aleatórios (`decoyKey`, em `unwrapping.ts`), sem relação com a chave real.
Desembrulhar esse método só prova que quem digitou conhece o PIN de pânico; a
chave que sai nunca descriptografou um `.zke`.

Quando o desbloqueio recebe um PIN e o container tem o método `panic`, o app
tenta desembrulhá-lo **antes** de qualquer outra coisa e **sem respeitar a trava
exponencial** (quem está sob coação não tem como esperar 24 h). Se der certo:
a chave da sessão é zerada, o erase roda, e a sessão passa a ser uma sessão
decoy, sem chave nenhuma, em que a lista é vazia e o cofre aparece como
existindo. Se der errado, o fluxo segue como se nada tivesse sido tentado e
**nenhuma tentativa é contada**, para não gerar lockout nem denunciar o
segundo caminho.

O custo do Argon2id do método `panic` é o mesmo do PIN (256 MiB, t=4, p=4):
um desbloqueio por ele custa exatamente o mesmo que um legítimo.

### Autodestruição por tentativas

`attemptsMaster` conta só as falhas da **senha mestra**; falha de PIN e falha
de frase de recuperação não somam nele. Ao cruzar `nukeLimit`, o app chama
`panicDestroy` e o cofre é destruído. `nukeLimit = 0` significa desligado, que
é o padrão, e o piso para ligar é 50. Ver a justificativa em `SECURITY.md`.

### SSD e wear leveling

O Cryptographic Erase é a estratégia primária em SSD porque invalida o acesso
pela chave, não importa para qual bloco físico o controlador moveu a escrita. A
sobrescrita (`shred`) **não é garantia** em SSD: com wear leveling e
over-provisioning a escrita pode ir para outro bloco e o original sobrar no
espaço gerenciado pelo controlador. Sem a chave, o `.zke` é ruído de qualquer
jeito, e é isso que fecha o caso.

O app **não** roda `fstrim`, `fallocate` nem `sfill`: o perfil AppArmor
autoriza escrita apenas dentro de `.vault/**` e nega rede, então essas chamadas
seriam negadas em `enforce`. TRIM é responsabilidade do sistema
(`fstrim.timer` do systemd no Mint), e o Cryptographic Erase não depende dele.

## Credencial salva (`<uuid>.zke`)

Arquivo binário com magic `ZENTRY01`: cabeçalho de 8 bytes (magic) e, em
seguida, `salt(16) + iv(16) + tag(16) + tamanho(4) + JSON cifrado`. A chave de
arquivo é derivada da chave do cofre com HKDF-SHA512 (`deriveEntryKey`), e o
JSON guarda `id`, `title`, `username`, `password`, `domain`, `notes`,
`createdAt` e `updatedAt`.

## Manifesto de integridade

O `vault.zkv` guarda também uma lista cifrada dos ids de credencial
(`manifest`). Ao listar, o main compara manifesto e diretório: arquivo removido
ou injetado de fora do app vira um único erro de adulteração, sem detalhes, e
nada é carregado (`src/main/storage.ts`, `verifyManifest`).

## Trava exponencial e auto-lock

- Falhas de desbloqueio somam no campo `attempts` do próprio `vault.zkv`
  (atualizado junto com `lockUntil`), então a trava sobrevive a reinício.
- Atrasos, em ordem: 10 s, 30 s, 1 min, 1 h e depois sempre 24 h
  (`src/main/auth.ts`).
- Sucesso zera as tentativas; o contador também pode ser zerado por teste ou
  pela redefinição de PIN.
- Sem atividade por 5 minutos a chave é zerada e o cofre bloqueia
  (`IDLE_LOCK_MS` em `src/main/vault.ts`). O renderer só percebe na próxima
  consulta de status (a cada 15 s).

## Migrações automáticas

Roda em toda leitura (`migrateLegacyVault`), na ordem, e só com os dados no
lugar:

| Origem                              | Destino                | Observação                                     |
| ----------------------------------- | ---------------------- | ---------------------------------------------- |
| `$XDG_DATA_HOME/guardinha/vault`    | `/var/lib/.guardinha/` | Cofre binário intermediário                    |
| `~/.guardinha-vault/` (JSON legado) | `/var/lib/.guardinha/` | `envelope.json`, `entries/`, `auth-state.json` |
| `.vault/entries/`                   | `.vault/.entries/`     | Layout oculto (rename barato)                  |
| Container `vault.zkv` versão 2      | versão 3 ou 4          | Reembrulho por método no desbloqueio           |
| Container `vault.zkv` versão 3      | versão 4               | Cabeçalho de 45 para 53 bytes                  |
| `.entries/<uuid>.enc` (JSON)        | `.entries/<uuid>.zke`  | Convertido na primeira leitura                 |

Sem permissão de escrita, a migração falha com o erro de pasta indisponível e
nada é movido; o app não apaga a origem enquanto o destino não estiver certo.

## Variáveis de ambiente

| Variável              | Efeito                                                  |
| --------------------- | ------------------------------------------------------- |
| `GUARDINHA_VAULT_DIR` | Caminho completo do diretório do cofre (testes)         |
| `GUARDINHA_VAR_LIB`   | Troca só a base `/var/lib`                              |
| `XDG_CONFIG_HOME`     | Onde fica `guardinha/settings.json` (senão `~/.config`) |
| `XDG_DATA_HOME`       | Onde procura o cofre binário intermediário para migrar  |

Com qualquer uma das duas do cofre, a criação nunca chama `pkexec`. Os
detalhes de ameaça assumida estão em `SECURITY.md`.
