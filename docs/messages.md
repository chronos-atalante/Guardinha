# Mensagens e idiomas (i18n)

Todo texto fixo da interface (e das mensagens de erro do processo main) vive em
`src/messages/`, nunca espalhado pelo código. O app nasce em **português
(Brasil)** e também fala **inglês**; o idioma é escolhido na Sidebar e
persistido em `settings.json` (`AppSettings.language`).

## O contrato

- `src/messages/pt-BR.ts` é o **canônico**: exporta `ptBR` e
  `export type Messages = typeof ptBR`. Toda chave e assinatura nasce aqui.
- `src/messages/en.ts` exporta `en: Messages` — o TypeScript aponta qualquer
  chave ou parâmetro faltando (ou sobrando) na tradução.
- `src/messages/index.ts` é o barrel: `LANGUAGES` (`'pt-BR' | 'en'`),
  `LANGUAGE_LABELS` (nome nativo do idioma, que **não** se traduz),
  `messages()` e os bundles.

Regras das strings:

- Strings com parâmetro são **funções** (`lockout: (time: string) => ...`).
- Marcadores ricos, usados **só na UI**: `**negrito**` vira `<strong>` e
  `` `código` `` vira `<code>` — renderize com `richText()` (em
  `src/renderer/src/i18n.tsx`), que monta nós React sem `dangerouslySetInnerHTML`.
- Elipses são `…` (U+2026), não `...`.

## Como cada camada lê

| Camada   | Como obtém o idioma                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer | Contexto React em `src/renderer/src/i18n.tsx`: `MessagesProvider` (montado pelo `App`), hooks `useMessages()` / `useLanguage()` e `richText()`. Fora do provider o padrão é `pt-BR`. |
| Main     | `currentMessages()` (`src/main/i18n.ts`) lê `loadSettings().language` a cada chamada e devolve o bundle; os erros IPC saem já no idioma vigente.                                     |

`App` lê `settings.get()` na carga e troca o provider ao trocar o idioma no
`<select>` da Sidebar (`settings.set`).

## O que NÃO se traduz

- **Dados por dependência**: `DEPENDENCIES[].role/nome`
  (`src/renderer/src/attributions.ts`).
- **Nomes de marca**: `ZenaKey`, `Linux Mint`, `Electron`, `Tailwind CSS`…
  (título da janela, nomes de pacotes).
- **Logs** (`console.error`): diagnóstico, não UI.
- **Chaves internas**: nomes de canal IPC, ids de arquivo, regex.

## Adicionando uma string

1. Crie a chave em `src/messages/pt-BR.ts` (com parâmetro, se variar).
2. Traduza em `src/messages/en.ts` — o typecheck reclama se faltar.
3. Use via `useMessages()` (renderer) ou `currentMessages()` (main).
4. `npm run check` + `npm test` (o teste `tests/messages/parity.test.ts`
   confere paridade de chaves e aridade).

## Adicionando um idioma

1. Adicione o código ao tipo `Language` (`src/types/settings.ts`).
2. Novo bundle `src/messages/<código>.ts` tipado como `Messages` + registro em
   `BUNDLES`, `LANGUAGES` e `LANGUAGE_LABELS` (`src/messages/index.ts`).
3. A normalização em `src/main/settings.ts` (`normalizeLanguage`) passa a
   aceitar o novo valor.
4. Estenda `tests/messages/parity.test.ts` para o bundle novo.
