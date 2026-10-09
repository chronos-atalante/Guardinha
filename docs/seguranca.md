# Mapa de segurança

O `SECURITY.md` da raiz é o texto normativo: proteções já existentes, riscos
aceitos, fora de escopo e como reportar uma falha. Aqui fica o **mapa**, para
quem precisa mexer no código saber onde cada medida mora e o que ela protege.

## Onde cada medida vive

| Medida                                                 | Arquivo principal                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Recusa de credencial previsível na criação e no reset  | `src/shared/strength.ts`, `src/main/vault.ts`                             |
| Argon2id com custo por método (256 MiB para o PIN)     | `src/main/crypto.ts`                                                      |
| Formato do `vault.zkv` e faixa de leitura do KDF       | `src/main/container.ts`                                                   |
| Chave só em memória, lock e auto-lock de 5 min         | `src/main/session.ts` (`VaultSessionManager`), `src/main/vault.ts`        |
| Trava exponencial (10 s até 24 h) persistida no cofre  | `src/main/auth.ts`, `src/main/storage.ts`                                 |
| AES-256-GCM por registro e HKDF-SHA512 por arquivo     | `src/main/crypto.ts`                                                      |
| Fachada única de persistência (fs, cifra, manifesto)   | `src/main/facade.ts`                                                      |
| Manifesto cifrado e falha fechada na adulteração       | `src/main/container.ts`, `src/main/storage.ts`                            |
| Credenciais validadas antes de gravar                  | `src/main/entries.ts`, `src/main/auth.ts`                                 |
| Id de arquivo seguro (path traversal, CVE-2026-21589)  | `src/main/storage.ts` (`assertSafeEntryId`)                               |
| Raiz `/var/lib/.guardinha` com `root:root 0711`        | `build/scripts/after-install.sh`                                          |
| Senha de administrador fora do app (PolicyKit)         | `src/main/privilege.ts`, `build/scripts/guardinha-setup`                  |
| Confinamento AppArmor do processo instalado            | `build/apparmor-profile`, `build/scripts/after-install.sh`                |
| Declaração do perfil no empacotamento                  | `package.json` (bloco `build.deb.appArmorProfile`)                        |
| Guarda de origem em todo canal IPC                     | `src/main/index.ts` (`assertAppFrame`)                                    |
| Navegação presa, `window.open`, permissões web negadas | `src/main/index.ts`                                                       |
| Renderer servido por `guardinha://`                    | `src/main/index.ts` (`registerAppProtocol`)                               |
| Fuses do Electron                                      | `package.json` (bloco `build.electronFuses`)                              |
| CSP e preload com `contextIsolation`/`sandbox`         | `src/renderer/index.html`, `src/preload/index.ts`                         |
| Limpeza do clipboard em 30 s no processo main          | `src/main/clipboard.ts` (`SecureClipboardProxy`)                          |
| Erros do cofre sem eco de senha, PIN ou frase          | `src/main/vault.ts`, `src/main/entries.ts`, `src/messages/`               |
| Auditoria de dependências e de scripts                 | `.osv-scanner.toml`, `npm run lint:shell`, `.github/workflows/codeql.yml` |

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
`VaultStorageFacade` (`src/main/facade.ts`).

## O que não enfraquecer

- `assertAppFrame` em todo canal novo; sem ele o domínio fica aberto a frame
  de fora.
- CSP do `index.html` e os fuses do `electron-builder`.
- Validação de força no `main`: o medidor do renderer é só aviso.
- Parâmetros do Argon2id dentro de `KDF_LIMITS` (escrita e leitura).
- Manifesto antes de listar, salvar ou remover credencial.
- Clipboard só pelo canal `clipboard:copy` (`SecureClipboardProxy` no main);
  voltar a pedir permissão de clipboard no renderer é abrir de novo a permissão
  que a política da sessão nega.
- A chave do cofre só existe dentro do `VaultSessionManager` (Singleton):
  nenhuma cópia em variável de módulo ou em Buffer que escape do `adopt`/`wipe`.
- `build/apparmor-profile` não pode voltar a `flags=(unconfined)`: o perfil só
  vale alguma coisa se for restritivo, e cada regra nova ali precisa de teste
  em `enforce` (negação legítima em `/var/log/kern.log` é sinal de que faltou
  regra, não de que a regra deva ser removida).
- Nenhum `console` com senha, PIN ou frase; nenhum log de payload IPC.

Qualquer mudança nesses pontos muda também o `SECURITY.md` e costuma pedir
teste novo em `tests/main/`.
