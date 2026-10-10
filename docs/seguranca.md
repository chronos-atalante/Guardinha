# Mapa de segurança

O `SECURITY.md` da raiz é o texto normativo: proteções já existentes, riscos
aceitos, fora de escopo e como reportar uma falha. Aqui fica o **mapa**, para
quem precisa mexer no código saber onde cada medida mora e o que ela protege.

## Onde cada medida vive

| Medida                                                   | Arquivo principal                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Recusa de credencial previsível na criação e no reset    | `src/shared/strength.ts`, `src/shared/strategy.ts`, `src/main/vault.ts`    |
| Argon2id com custo por método (256 MiB para o PIN)       | `src/main/crypto.ts`, `src/main/unwrapping.ts`                             |
| Formato do `vault.zkv` e faixa de leitura do KDF         | `src/main/container.ts`                                                    |
| Chave só em memória, lock e auto-lock de 5 min           | `src/main/session.ts` (`VaultSessionManager`), `src/main/activity.ts`      |
| Cadeia de desbloqueio (trava, formato, KDF, integridade) | `src/main/unlock.ts`, `src/main/vault.ts`                                  |
| Trava exponencial (10 s até 24 h) persistida no cofre    | `src/main/auth.ts`, `src/main/storage.ts`                                  |
| AES-256-GCM por registro e HKDF-SHA512 por arquivo       | `src/main/crypto.ts`                                                       |
| Fachada única de persistência (fs, cifra, manifesto)     | `src/main/facade.ts`                                                       |
| Manifesto cifrado e falha fechada na adulteração         | `src/main/container.ts`, `src/main/storage.ts`                             |
| Credenciais validadas antes de gravar                    | `src/main/entries.ts`, `src/main/auth.ts`                                  |
| Id de arquivo seguro (path traversal, CVE-2026-21589)    | `src/main/storage.ts` (`assertSafeEntryId`)                                |
| Sobrescrita antes do `unlink` (`O_NOFOLLOW`, fsync)      | `src/main/shred.ts`                                                        |
| Cryptographic Erase (apagar a chave embrulhada)          | `src/main/erase.ts`, `src/main/erasure-state.ts`                           |
| Guarda de "erase não recria container"                   | `src/main/erasure-state.ts`, `src/main/storage.ts` (`writeVaultContainer`) |
| PIN de coação e sessão decoy                             | `src/main/vault.ts`, `src/main/unwrapping.ts`, `src/main/session.ts`       |
| Limite estrito da senha mestra                           | `src/main/auth.ts`, `src/main/vault.ts`, `src/main/container.ts`           |
| Temporários órfãos varridos na inicialização             | `src/main/entries-store.ts`, `src/main/index.ts`                           |
| Raiz `/var/lib/.guardinha` com `root:root 0711`          | `build/scripts/after-install.sh`                                           |
| Senha de administrador fora do app (PolicyKit)           | `src/main/privilege.ts`, `build/scripts/guardinha-setup`                   |
| Confinamento AppArmor do processo instalado              | `build/apparmor-profile`, `build/scripts/after-install.sh`                 |
| Declaração do perfil no empacotamento                    | `package.json` (bloco `build.deb.appArmorProfile`)                         |
| Guarda de origem em todo canal IPC                       | `src/main/index.ts` (`assertAppFrame`)                                     |
| Navegação presa, `window.open`, permissões web negadas   | `src/main/index.ts`                                                        |
| Renderer servido por `guardinha://`                      | `src/main/index.ts` (`registerAppProtocol`)                                |
| Fuses do Electron                                        | `package.json` (bloco `build.electronFuses`)                               |
| CSP e preload com `contextIsolation`/`sandbox`           | `src/renderer/index.html`, `src/preload/index.ts`                          |
| Limpeza do clipboard em 30 s no processo main            | `src/main/clipboard.ts` (`SecureClipboardProxy`)                           |
| Erros do cofre sem eco de senha, PIN ou frase            | `src/main/vault.ts`, `src/main/entries.ts`, `src/messages/`                |
| Auditoria de dependências e de scripts                   | `.osv-scanner.toml`, `npm run lint:shell`, `.github/workflows/codeql.yml`  |

## Fluxo de confiança

```
Página do app → assertAppFrame → regra de domínio → fachada → arquivo cifrado
                     ^                                     ^
                     |                                     |
             só o frame oficial                   validações e manifesto
```

Nenhuma entrada do renderer passa direto para o disco: o id precisa ser UUID
conhecido, o domínio aberto no navegador precisa começar por `http`/`https` e
a chave do cofre é exigida pelas funções de domínio (`requireSessionKey`).
`vault.ts` e `entries.ts` não tocam `fs` nem cifra: passam pela
`VaultStorageFacade` (`src/main/facade.ts`). O desbloqueio passa pela cadeia
`unlock.ts` (trava exponencial antes do Argon2id; PIN malformado não paga a
derivação) e o desembrulho da chave sai do mapa `unwrapping.ts`.

## Onde cada arquivo toca o disco

O acesso ao disco é concentrado, e a divisão é por domínio, não por arquivo:

| Arquivo                     | O que ele toca                                           |
| --------------------------- | -------------------------------------------------------- |
| `src/main/layout.ts`        | Nada: só resolve caminhos, sem `fs` e sem Electron       |
| `src/main/structure.ts`     | Pastas do cofre, permissões, migração de layout          |
| `src/main/storage.ts`       | O `vault.zkv` e as migrações dos formatos anteriores     |
| `src/main/entries-store.ts` | Os arquivos `.zke`/`.enc` de cada credencial             |
| `src/main/shred.ts`         | Sobrescrita e remoção; recebe sempre caminho já validado |
| `src/main/erase.ts`         | Orquestra o erase, compondo os dois últimos              |
| `src/main/settings.ts`      | O `settings.json` (que só tem idioma, sem segredo)       |

`shred.ts` é a única exceção declarada à regra de "só `storage.ts` toca `fs`":
ele é uma primitiva de baixo nível que recebe um caminho já validado por quem
o compôs e não conhece o cofre. É essa separação que impede o `storage.ts` de
estourar o teto de linhas e mantém a decisão de "apagar o cofre" num arquivo só.

## O que não enfraquecer

- `assertAppFrame` em todo canal novo; sem ele o domínio fica aberto a frame
  de fora. Isso vale **ainda mais** para os canais de autodestruição.
- CSP do `index.html` e os fuses do `electron-builder`.
- Validação de força no `main`: o medidor do renderer é só aviso.
- Parâmetros do Argon2id dentro de `KDF_LIMITS` (escrita e leitura).
- Manifesto antes de listar, salvar ou remover credencial.
- Clipboard só pelo canal `clipboard:copy` (`SecureClipboardProxy` no main);
  voltar a pedir permissão de clipboard no renderer é abrir de novo a permissão
  que a política da sessão nega.
- A chave do cofre só existe dentro do `VaultSessionManager` (Singleton):
  nenhuma cópia em variável de módulo ou em Buffer que escape do `adopt`/`wipe`.
  A sessão decoy do PIN de coação **não** guarda chave alguma.
- **A ordem do `panicDestroy`**: `wipe()` da sessão antes de qualquer I/O. Se o
  disco falhar, a memória já está limpa, que é o lado que o atacante com o
  mesmo usuário alcança mais fácil.
- **`writeVaultContainer` continua recusando depois de um erase**
  (`erasure-state.ts`). Sem essa guarda, um `writeAuthState` (que é
  read-modify-write) ou um `initManifest` disparado por engano recriam o
  `vault.zkv` pela metade, sem chave, e o usuário vê "cofre adulterado" onde o
  certo é "cofre destruído". Só `createVault` libera.
- **O `O_NOFOLLOW` do `shredFile`**: sem ele, um symlink no lugar do arquivo
  faria a sobrescrita happen no alvo, que é exatamente o oposto do que se quer.
- **O PIN de pânico não conta tentativa**: se contasse, o aumento do contador
  denunciaria a existência de um segundo caminho justamente para quem está
  testando o app sob coação.
- `build/apparmor-profile` não pode voltar a `flags=(unconfined)`: o perfil só
  vale alguma coisa se for restritivo, e cada regra nova ali precisa de teste
  em `enforce` (negação legítima em `/var/log/kern.log` é sinal de que faltou
  regra, não de que a regra deva ser removida).
- Nenhum `console` com senha, PIN ou frase; nenhum log de payload IPC.

Qualquer mudança nesses pontos muda também o `SECURITY.md` e costuma pedir
teste novo em `tests/main/`.
