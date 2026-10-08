# Documentação do Guardinha

Índice da documentação técnica do app desktop (Electron + React + TypeScript,
100% offline, Linux Mint 22.X, distribuição em `.deb`). O `README.md` da raiz
continua sendo a porta de entrada. Aqui mora o detalhe.

| Arquivo          | Conteúdo                                                               |
| ---------------- | ---------------------------------------------------------------------- |
| `visao-geral.md` | O que o app é e o que ele não é, dependências e glossário              |
| `arquitetura.md` | Camadas, aliases `@zero/*`, fluxo de IPC e ciclo de vida da sessão     |
| `cofre.md`       | Onde o cofre mora, formato dos arquivos, custo do Argon2id e migrações |
| `credenciais.md` | Registros salvos, gerador de senhas e checagem de força                |
| `telas.md`       | Telas e componentes do renderer, com os fluxos de navegação            |
| `api.md`         | Contrato `window.api`, canal por canal                                 |
| `messages.md`    | i18n pt-BR/en, contrato das mensagens e como traduzir                  |
| `build.md`       | Build, geração do `.deb`, scripts de instalação, fuses e CI            |
| `testes.md`      | Suíte Vitest: o que cada arquivo cobre e como rodar                    |
| `seguranca.md`   | Mapa de cada medida de segurança para o arquivo que a implementa       |

Arquivos de governança da raiz: `LICENSE` (MIT), `CONTRIBUTING.md` (fluxo de
contribuição), `AGENTS.md` (regras duras de código), `SECURITY.md` (proteções,
riscos aceitos e como reportar falha), `CODE_OF_CONDUCT.md` e `CHANGELOG.md`
(histórico de mudanças).

Convenção dos textos: português do Brasil, com pontuação adequada (vírgulas,
dois-pontos, ponto e vírgula, parênteses e ponto final; sem travessões).
