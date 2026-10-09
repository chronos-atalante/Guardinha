# API interna (`window.api`)

Contrato único entre renderer e main. Definido em `src/types/api.ts`
(`ElectronApi`), montado em `src/preload/index.ts` e registrado no
`contextBridge` como `window.api`. Cada método vira um canal
`ipcRenderer.invoke` / `ipcMain.handle` homônimo em `src/main/index.ts`.

> Erros do processo main chegam ao renderer como `Error` rejeitado, com a
> mensagem **já localizada** no idioma corrente (`currentMessages()`).

Guarda de origem: todo handler IPC chama `assertAppFrame(event)` antes da
lógica de domínio, exigindo `event.senderFrame` apontando para a página
oficial do app (scheme `guardinha://` em produção ou dev server do Vite em
dev); uma mensagem de emissor desconhecido é bloqueada com erro.

Entradas são validadas no main, nunca só na tela: comprimento da senha mestra
(24), do PIN (8 dígitos) e da frase (12+ palavras), forma de usuário/domínio,
UUID de credencial e, na criação e na redefinição de PIN, a força da
credencial (`credenciais.md`).

## `window.api.vault`

| Método            | Canal            | Payload → retorno                | Descrição                                                                                                                 |
| ----------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `status()`        | `vault:status`   | `→ VaultStatus`                  | `exists`, `locked`, `attempts`, `lockUntil`, `lockRemainingMs`.                                                           |
| `create(input)`   | `vault:create`   | `CreateVaultInput → VaultResult` | Cria o cofre em `/var/lib/.guardinha/.vault/` com frase **escrita pelo usuário** (≥ 12 palavras); valida formato e força. |
| `unlock(input)`   | `vault:unlock`   | `UnlockInput → VaultResult`      | Desbloqueia com `kind`: `master` \| `pin`; a **senha mestra só aparece após 3 falhas** de PIN.                            |
| `resetPin(input)` | `vault:resetPin` | `ResetPinInput → VaultResult`    | Único uso da frase de recuperação: valida a frase e instala um novo PIN (abre o cofre).                                   |
| `lock()`          | `vault:lock`     | `→ VaultStatus`                  | Zera a chave em memória e bloqueia.                                                                                       |

## `window.api.openDomain`

| Método               | Canal               | Payload → retorno | Descrição                                                                                   |
| -------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `openDomain(domain)` | `shell:open-domain` | `string → void`   | Abre o domínio da credencial no navegador padrão (`shell.openExternal`; só `http`/`https`). |

## `window.api.clipboard`

| Método        | Canal            | Payload → retorno | Descrição                                                                                                                  |
| ------------- | ---------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `copy(value)` | `clipboard:copy` | `string → void`   | Copia no clipboard nativo e limpa sozinho 30 s depois (`SecureClipboardProxy`, no main; salvo cópia posterior do usuário). |

A cópia mora no processo main: o renderer não pede permissão de clipboard ao
sistema e o temporizador sobrevive a uma recarga da página. O canal só aceita
texto (o handler recusa outro tipo de payload).

## `window.api.entries`

| Método        | Canal            | Payload → retorno                | Descrição                                                   |
| ------------- | ---------------- | -------------------------------- | ----------------------------------------------------------- |
| `list()`      | `entries:list`   | `→ Credential[]`                 | Decifra todos os arquivos (precisa desbloqueado).           |
| `save(entry)` | `entries:save`   | `CredentialInput → Credential[]` | Cria (sem `id`) ou atualiza; valida título/usuário/domínio. |
| `remove(id)`  | `entries:delete` | `string → Credential[]`          | Apaga o arquivo cifrado.                                    |

## `window.api.generator`

| Método              | Canal                | Payload → retorno           | Descrição                                                                                      |
| ------------------- | -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `generate(options)` | `generator:generate` | `GeneratorOptions → string` | Senha de 0 a 72 caracteres, com maiúsculas, números, símbolos e entropia pessoal (5 palavras). |

## `window.api.settings`

| Método          | Canal          | Payload → retorno           | Descrição                                                        |
| --------------- | -------------- | --------------------------- | ---------------------------------------------------------------- |
| `get()`         | `settings:get` | `→ AppSettings`             | `language` (`'pt-BR' \| `'en'`), default `pt-BR`.                |
| `set(settings)` | `settings:set` | `AppSettings → AppSettings` | Normaliza e grava em `$XDG_CONFIG_HOME/guardinha/settings.json`. |

## Tipos (`src/types/`)

- `VaultStatus`: `{ exists, locked, attempts, lockUntil, lockRemainingMs }`
- `CreateVaultInput`: `{ masterPassword, pin, recoveryPhrase }` (senha de 24 chars; PIN de 8 dígitos; frase ≥ 12 palavras escrita pelo usuário)
- `UnlockInput`: `{ credential, kind: 'master' | 'pin' }`
- `ResetPinInput`: `{ phrase, newPin }` (frase de recuperação + novo PIN)
- `Credential` / `CredentialInput`: registro da credencial (senha cifrada por arquivo)
- `GeneratorOptions`: `{ length, useUpper, useNumbers, useSymbols, customEntropyWords }`
- `AppSettings`: `{ language }`
