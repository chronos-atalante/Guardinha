# Testes

Suíte em Vitest, com o renderer em jsdom e o main em Node. São 15 arquivos e
115 testes; a duração gira em torno de um minuto porque o Argon2id roda de
verdade (perfis de 128 e 256 MiB) nos testes de cofre.

## Como rodar

```bash
npm test               # execução única (o que o CI espera)
npm run test:watch     # modo watch
npm run test:coverage  # cobertura em coverage/ (limiar de 50%)
```

O `npm run check` **não** roda os testes; ele cobre tipos, lint, formato,
auditoria de dependências e shellcheck. Rode os dois antes de concluir.

## Arquivos

| Arquivo                                | O que cobre                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tests/main/auth.test.ts`              | Escala da trava (10 s até 24 h) e validações de formato                                       |
| `tests/main/container.test.ts`         | Formato do `vault.zkv` e `.zke`: roundtrip, v2, v3, faixa do KDF, lixo e truncamento          |
| `tests/main/crypto.test.ts`            | Argon2id, perfis de custo, AES-256-GCM, gerador e frase                                       |
| `tests/main/storage.test.ts`           | Migrações (JSON legado, XDG, layout oculto), permissões e uuid seguro                         |
| `tests/main/facade.test.ts`            | Fachada de persistência: roundtrip de credencial, forma inválida e arquivo injetado           |
| `tests/main/session.test.ts`           | Singleton da sessão: chave, zeragem de memória, auto-lock de 5 min e rearma                   |
| `tests/main/clipboard.test.ts`         | `SecureClipboardProxy`: limpeza em 30 s, cópia posterior, reprogramação e `dispose`           |
| `tests/main/vault.test.ts`             | Ciclo de vida completo: criar, falhar, travar, editar, redefinir, manifesto e subida de custo |
| `tests/main/privilege.test.ts`         | `pkexec` só com o helper do pacote e nunca em teste/dev                                       |
| `tests/main/create-permission.test.ts` | Criação sem permissão responde `vaultAuthCancelled`                                           |
| `tests/main/window.test.ts`            | Navegação presa, `window.open`, permissões da sessão e canais IPC                             |
| `tests/messages/parity.test.ts`        | Paridade de chaves e aridade entre pt-BR e en                                                 |
| `tests/renderer/App.test.tsx`          | Telas: desbloqueio, aba mestra após 3 falhas, lista, gerador, configurações e criação         |
| `tests/renderer/clipboard.test.ts`     | Delegação da cópia para o main pelo canal `clipboard:copy`                                    |
| `tests/shared/strength.test.ts`        | Regras de nota e de bloqueio da checagem de força                                             |

Apoios: `tests/mocks/electron.ts` (stub do `electron` aplicado por alias),
`tests/setup-env.ts` (cria um `HOME` temporário por processo e aponta o cofre
para lá) e `tests/setup.ts` (limpa o DOM e restaura timers e mocks a cada
teste).

## Convenções

- Correção de bug vem com teste que reproduz o problema antes da correção.
- Teste novo de domínio fica perto dos pares (`tests/main/`, `tests/renderer/`,
  `tests/shared/`).
- Arquivo de teste abaixo de ~500 linhas: extraia helpers quando passar.
- Temporizadores: use `vi.useFakeTimers()` para a trava exponencial e
  `vi.useRealTimers()` no fim do teste (o `setup.ts` já restaura, mas o teste
  que muda o relógio deve devolver).
- Cofre e arquivos sempre em diretório temporário: nunca escreva em
  `/var/lib` em teste (o `setup-env.ts` já isola; `create-permission` e
  `privilege` cobrem o caminho sem permissão).

## Cobertura

`vitest.config.mts` mede `src/**/*.{ts,tsx}` com o provedor v8, relatório em
texto e HTML, e limiar de 50% para linhas, instruções, funções e ramos. Arquivos
de tipo puro e HTML ficam de fora (`global.d.ts`, `index.html`).
