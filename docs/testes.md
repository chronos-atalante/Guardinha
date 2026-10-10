# Testes

Suíte em Vitest, com o renderer em jsdom e o main em Node. São 23 arquivos e
213 testes; a duração gira em torno de dois minutos e meio porque o Argon2id
roda de verdade (perfis de 128 e 256 MiB) nos testes de cofre.

## Como rodar

```bash
npm test               # execução única (o que o CI espera)
npm run test:watch     # modo watch
npm run test:coverage  # cobertura em coverage/ (limiar de 50%)
```

O `npm run check` **não** roda os testes; ele cobre tipos, lint, formato,
auditoria de dependências e shellcheck. Rode os dois antes de concluir.

## Arquivos

| Arquivo                                | O que cobre                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/main/auth.test.ts`              | Escala da trava (10 s até 24 h), validações de formato e os contadores por método (`attemptsMaster` só conta senha mestra)                       |
| `tests/main/container.test.ts`         | Formato do `vault.zkv` e `.zke`: roundtrip v4, leitura de v3 e v2, header de 53 bytes, `nukeLimit`, flag desconhecida                            |
| `tests/main/crypto.test.ts`            | Argon2id, perfis de custo, AES-256-GCM, gerador e frase                                                                                          |
| `tests/main/storage.test.ts`           | Migrações (JSON legado, XDG, layout oculto), permissões e uuid seguro                                                                            |
| `tests/main/facade.test.ts`            | Fachada de persistência: roundtrip de credencial, forma inválida e arquivo injetado                                                              |
| `tests/main/shred.test.ts`             | `shredFile`/`shredDirectory`: arquivo some, conteúdo sobrescrito, symlink não é seguido, pasta e caminho inexistente não quebram                 |
| `tests/main/erase.test.ts`             | Cryptographic Erase: apaga container, entradas e `.tmp`, não segue symlink, é idempotente, container não ressuscita, `panicDestroy` zera a chave |
| `tests/main/panic.test.ts`             | PIN de coação (apaga e devolve cofre vazio, não conta tentativa, funciona sob trava), limite estrito da senha mestra                             |
| `tests/main/session.test.ts`           | Singleton da sessão: chave, zeragem de memória, sessão decoy e repasse do auto-lock ao monitor                                                   |
| `tests/main/activity.test.ts`          | `ActivityMonitor` (Observer): emite no idle, rearma, cancela assinatura e `stop`                                                                 |
| `tests/main/unwrapping.test.ts`        | Factory de desembrulho: roundtrip por tipo, custo por método e GCM recusando credencial errada                                                   |
| `tests/main/unlock.test.ts`            | Cadeia de desbloqueio: libera chave, conta tentativa, formato barato e trava antes do Argon2id                                                   |
| `tests/main/clipboard.test.ts`         | `SecureClipboardProxy`: limpeza em 30 s, cópia posterior, reprogramação e `dispose`                                                              |
| `tests/main/vault.test.ts`             | Ciclo de vida completo: criar, falhar, travar, editar, redefinir, manifesto e subida de custo                                                    |
| `tests/main/privilege.test.ts`         | `pkexec` só com o helper do pacote e nunca em teste/dev                                                                                          |
| `tests/main/create-permission.test.ts` | Criação sem permissão responde `vaultAuthCancelled`                                                                                              |
| `tests/main/window.test.ts`            | Navegação presa, `window.open`, permissões da sessão, canais IPC e push de auto-lock                                                             |
| `tests/messages/parity.test.ts`        | Paridade de chaves e aridade entre pt-BR e en                                                                                                    |
| `tests/renderer/App.test.tsx`          | Telas: desbloqueio, aba mestra após 3 falhas, lista, gerador, criação e a confirmação do botão de autodestruição                                 |
| `tests/renderer/Settings.test.tsx`     | Configurações: PIN de pânico pelo canal, autodestruição por tentativas e seus erros                                                              |
| `tests/renderer/clipboard.test.ts`     | Delegação da cópia para o main pelo canal `clipboard:copy`                                                                                       |
| `tests/shared/strength.test.ts`        | Regras de nota e de bloqueio da checagem de força                                                                                                |
| `tests/shared/strategy.test.ts`        | `strengthFor` (Strategy): régua por tipo e paridade com as funções puras                                                                         |

Apoios: `tests/mocks/electron.ts` (stub do `electron` aplicado por alias),
`tests/mocks/api.ts` (contrato completo de `window.api` para os testes de
renderer; o que o arquivo não exercita rejeita, para um canal chamado por
engano aparecer como falha), `tests/setup-env.ts` (cria um `HOME` temporário
por processo e aponta o cofre para lá) e `tests/setup.ts` (limpa o DOM e
restaura timers e mocks a cada teste).

## Convenções

- Correção de bug vem com teste que reproduz o problema antes da correção.
- Teste novo de domínio fica perto dos pares (`tests/main/`, `tests/renderer/`,
  `tests/shared/`).
- Arquivo de teste abaixo de ~500 linhas: extraia helpers quando passar.
- Temporizadores: use `vi.useFakeTimers()` para a trava exponencial e
  `vi.useRealTimers()` no fim do teste (o `setup.ts` já restaura, mas o teste
  que muda o relógio deve devolver).
- Argon2id real: testes que criam cofre (`createVault`, `makeContainer`)
  derivam 128 e 256 MB; herdam o teto global de 120 s do `vitest.config.mts`
  e não devem baixá-lo, sob pena de flake sob carga do desktop.
- Cofre e arquivos sempre em diretório temporário: nunca escreva em
  `/var/lib` em teste (o `setup-env.ts` já isola; `create-permission` e
  `privilege` cobrem o caminho sem permissão).
- Teste que exercita o erase precisa chamar `clearDestroyedFlag()` antes de
  semear um cofre novo: a guarda que impede o container de ressuscitar é
  intencional e vai recusar a escrita enquanto durar o processo de teste.
- Teste com vários cenários de cofre **não** cria um cofre por cenário
  (`createVault` custa três derivações Argon2id, uns 45 s). Crie uma vez,
  fotografe o `vault.zkv` e restaure a foto antes de cada cenário; é o que
  `tests/main/panic.test.ts` faz.

## Cobertura

`vitest.config.mts` mede `src/**/*.{ts,tsx}` com o provedor v8, relatório em
texto e HTML, e limiar de 50% para linhas, instruções, funções e ramos. Arquivos
de tipo puro e HTML ficam de fora (`global.d.ts`, `index.html`).
