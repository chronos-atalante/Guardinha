# Telas e componentes

O estado fica no topo (`App.tsx`) e as telas são controladas: o app escolhe uma
da Sidebar ou mostra o `AuthModal` quando não há cofre ou ele está bloqueado.
Todo texto vem do contexto de idioma (`useMessages()`), nunca embutido no JSX.

## Componentes (`src/renderer/src/`)

| Componente          | Papel                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `App.tsx`           | Carrega idioma e status, decide entre `AuthModal` ou as abas          |
| `Sidebar`           | Navegação, seletor de idioma, botão de bloqueio e status "local"      |
| `LanguageSelect`    | Troca o idioma e persiste em `settings.json`                          |
| `Home`              | Lista de credenciais com busca e ações                                |
| `EntryModal`        | Criar/editar credencial, com excluir quando é edição                  |
| `AuthModal`         | Criação do cofre, desbloqueio e redefinição de PIN                    |
| `Generator`         | Senha aleatória com comprimento, gostos e entropia pessoal            |
| `SensitivitySlider` | Slider acessível do comprimento no Gerador (arraste, teclado, `aria`) |
| `StrengthMeter`     | Barra de força com nível, motivos e dica                              |
| `Credits`           | Pós-créditos de cinema com as dependências em rolagem                 |
| `Settings`          | Tela de configurações (ainda com aviso de "chega futuramente")        |
| `Toast`             | Aviso curto de cópia e de sucesso                                     |
| `i18n.tsx`          | `MessagesProvider`, `useMessages()`, `useLanguage()`, `richText()`    |
| `clipboard.ts`      | Encerra a cópia no canal `clipboard:copy` (limpeza no main)           |
| `formatters.ts`     | Contagem de palavras, contagem regressiva e erro legível              |

## Abas da Sidebar

| Aba               | Componente  | Conteúdo                                              |
| ----------------- | ----------- | ----------------------------------------------------- |
| Início (Senhas)   | `Home`      | Busca, contagem, lista e botão de nova credencial     |
| Gerador de Senhas | `Generator` | Slider de comprimento, três chaves e entropia pessoal |
| Atribuições       | `Credits`   | Créditos em rolagem, com pausa no hover               |
| Configurações     | `Settings`  | Cartão de aviso (idioma continua na Sidebar)          |

O rodapé da Sidebar mostra que os dados estão locais. O botão de bloqueio chama
`vault.lock()` e volta para a aba Início.

## Fluxo de criação do cofre

Quando `status.exists` é falso, o `AuthModal` abre em modo de criação, em dois
passos:

1. **Credenciais**: senha mestra (24 caracteres), confirmação e PIN (8 dígitos),
   cada campo com medidor de força. A tela valida comprimento, confirmação e
   recusa credencial previsível antes de seguir.
2. **Frase de recuperação**: frase e confirmação, com contagem de palavras
   (mínimo de 12) e medidor. A frase é normalizada em minúsculas com espaços
   simples para a comparação.

Ao concluir, o cofre é criado já desbloqueado e o app entra na Home.

## Fluxo de desbloqueio

- **Aba PIN** (padrão): um campo numérico; o contador de trava aparece com
  contagem regressiva de segundo em segundo quando o cofre está em espera.
- **Aba senha mestra**: só aparece após **3 falhas** de PIN, com aviso âmbar.
  Se as falhas zerarem, a aba some sozinha.
- **Esqueci o PIN**: modo de redefinição, com a frase de recuperação, o PIN novo
  e a confirmação; é o único lugar onde a frase é usada.

## Home

- Busca instantânea por título, usuário ou domínio, com contagem de itens.
- Cada linha traz editar, copiar usuário, copiar senha e abrir o site no
  navegador do sistema (canal `shell:open-domain`, só `http`/`https`).
- Estados vazios distintos: sem credenciais, e sem resultado para a busca.
- Erro de adulteração vindo do main aparece no lugar da lista (fail-closed).

## EntryModal

Formulário com título, usuário, senha (com olho para mostrar e ocultar),
domínio e observações. A senha carrega o medidor de força informativo. Em modo
de edição aparece o botão de excluir, que pede confirmação dentro do próprio
modal.

## Generator

Slider de comprimento (0 a 72, padrão 24), chaves de maiúsculas, números e
símbolos e cinco campos de entropia pessoal. O botão gera no main, mostra a
senha com medidor e copia com limpeza em 30 s.

## Erros e avisos

Erro de operação vira texto na própria tela do `AuthModal` ou no modal afetado;
sucesso de cópia vira `Toast`. As mensagens chegam localizadas do processo main,
então o idioma escolhido na Sidebar vale também para os erros do cofre.
