/**
 * Mensagens em português (Brasil): canônico de todas as chaves e assinaturas.
 *
 * Cada idioma é um objeto com a mesma forma (`Messages = typeof ptBR`); o
 * TypeScript aponta qualquer chave ou parâmetro faltando no `en.ts`. Strings
 * com parâmetro são funções. Marcadores de formatação rica (só na UI):
 * `**negrito**` e `` `código` ``. Regras: `docs/messages.md`.
 */
export const ptBR = {
  common: {
    close: 'Fechar',
    cancel: 'Cancelar',
    save: 'Salvar',
    saving: 'Salvando…',
    loading: 'Carregando…',
    delete: 'Excluir',
    confirm: 'Confirmar',
    copy: 'Copiar',
    copied: 'Copiado!',
    back: 'Voltar',
    skip: 'Pular',
    next: 'Avançar',
    optional: '(opcional)',
    search: 'Buscar',
    clearSearch: 'Limpar busca',
  },

  app: {
    name: 'ZenaKey',
    subtitle: 'Cofre do Mint 22.X',
    statusLocal: '100% Local / Criptografado',
    nav: {
      home: 'Início (Senhas)',
      config: 'Configuração & Gerador',
      credits: 'Atribuições',
    },
    lock: 'Bloquear cofre',
    lockTitle: 'Bloqueia o cofre agora',
    languageLabel: 'Idioma',
    checkingVault: 'Verificando o cofre…',
    toastCopied: 'Copiado para a área de transferência.',
  },

  auth: {
    createTitle: 'Crie o seu cofre',
    createSubtitle:
      'A senha mestra tem exatamente **24 caracteres** e é a única chave do cofre. ' +
      'Nada sai daqui: tudo fica em `~/.zena-vault/`.',
    masterLabel: 'Senha mestra (24 caracteres)',
    masterPlaceholder: 'Ex.: 24 caracteres quaisquer',
    masterConfirmLabel: 'Repita a senha mestra',
    masterMismatch: 'As senhas não coincidem.',
    masterLength: (needed: number, actual: number): string =>
      `A senha mestra precisa ter exatamente ${needed} caracteres (você digitou ${actual}).`,
    pinTitle: 'PIN de 8 dígitos',
    pinSubtitle: 'É com ele que você abre o cofre no dia a dia.',
    pinLabel: 'PIN (8 dígitos)',
    pinPlaceholder: 'Ex.: 49201733',
    pinInvalid: 'O PIN precisa ter exatamente 8 dígitos.',
    pinMismatch: 'Os PINs não coincidem.',
    createAction: 'Criar cofre',
    creating: 'Criando cofre…',
    recoveryTitle: 'Frase de recuperação',
    recoverySubtitle:
      'Escreva **com as suas palavras** a frase que vai redefinir o PIN se você o esquecer. ' +
      'O app não gera nem guarda esse texto: você decide e anota fora do computador.',
    recoveryHint: 'Maiúsculas e espaços extras são ignorados.',
    recoveryLabel: 'Sua frase de recuperação',
    recoveryPlaceholder: 'Ex.: o cavalo comeu cenoura na feira',
    recoveryConfirmLabel: 'Repita a frase de recuperação',
    recoveryMismatch: 'As frases não coincidem.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `A frase precisa de pelo menos ${needed} palavras (você escreveu ${actual}).`,
    unlockTitle: 'Cofre bloqueado',
    unlockSubtitle: 'Informe o PIN para abrir o cofre.',
    tabPin: 'PIN',
    tabMaster: 'Senha mestra',
    masterAvailable: 'PIN incorreto 3 vezes: agora a senha mestra também pode abrir o cofre.',
    forgotPin: 'Esqueci o PIN',
    unlockAction: 'Desbloquear',
    unlocking: 'Verificando…',
    lockout: (time: string): string => `Muitas tentativas. Tente novamente em ${time}.`,
    resetTitle: 'Redefinir PIN',
    resetSubtitle:
      'Use a frase de recuperação que **você** definiu na criação do cofre para escolher um novo PIN.',
    newPinLabel: 'Novo PIN (8 dígitos)',
    newPinConfirmLabel: 'Repita o novo PIN',
    resetAction: 'Redefinir e abrir',
    resetting: 'Redefinindo…',
    backToPin: 'Voltar para o PIN',
  },

  home: {
    title: 'Senhas',
    searchPlaceholder: 'Buscar por título, usuário ou domínio…',
    loading: 'Abrindo o cofre…',
    emptyTitle: 'Nenhuma credencial ainda',
    emptyText: 'Adicione a sua primeira credencial para começar.',
    emptyFoundTitle: 'Nenhuma credencial encontrada',
    emptyFoundText: 'Tente outro termo de busca.',
    addFirst: 'Adicionar primeira credencial',
    newEntry: 'Nova credencial',
    entryCount: (n: number): string => `${n} credencial(is)`,
    copyUser: 'Copiar usuário',
    copyPass: 'Copiar senha',
    openSite: 'Abrir o site em um navegador',
    toastSaved: 'Credencial salva.',
    toastRemoved: 'Credencial removida.',
    modalNew: 'Nova credencial',
    modalEdit: 'Editar credencial',
    titleLabel: 'Título',
    titlePlaceholder: 'Ex.: GitHub',
    usernameLabel: 'Usuário',
    usernamePlaceholder: 'seu.usuario',
    passwordLabel: 'Senha',
    passwordPlaceholder: 'Senha gerada ou colada',
    showPassword: 'Mostrar senha',
    hidePassword: 'Ocultar senha',
    domainLabel: 'Domínio',
    domainPlaceholder: 'exemplo.com.br',
    notesLabel: 'Observações',
    notesPlaceholder: 'Notas opcionais…',
    titleRequired: 'Informe o título da credencial.',
    invalidUsername: 'Usuário inválido: use letras, números, `-` ou `_`.',
    invalidDomain: 'Domínio inválido (ex.: exemplo.com.br).',
    deleteConfirm: 'Excluir esta credencial? Esta ação não pode ser desfeita.',
    saveError: 'Não foi possível salvar a credencial.',
    removeError: 'Não foi possível remover a credencial.',
  },

  generator: {
    title: 'Configuração & Gerador de Senhas',
    subtitle: 'Ajuste o tamanho (0 a 72) e injete gostos pessoais para alta entropia.',
    lengthLabel: 'Tamanho da Senha',
    lengthValue: (n: number): string => `${n} caracteres`,
    upper: 'Maiúsculas',
    numbers: 'Números',
    symbols: 'Símbolos',
    entropyTitle: 'Injeção de Entropia Pessoal (5 itens/gostos aleatórios)',
    entropyPlaceholders: ['Objeto', 'Número', 'Carro', 'Móvel', 'Eletro'],
    generate: 'Gerar Senha Criptográfica',
    copyTitle: 'Copiar senha gerada',
    emptyLength: 'Escolha um tamanho maior que 0.',
    toastCopied: 'Senha copiada.',
  },

  attributions: {
    title: '— ATRIBUIÇÕES —',
    footer: '© 2026 - Proteção de Dados 100% Offline & Local',
    loopHint: 'Os créditos voltam ao início em loop.',
  },

  /** Erros emitidos pelo processo main (já localizados no momento da emissão). */
  errors: {
    vaultExists: 'O cofre já existe.',
    vaultMissing: 'Cofre não encontrado em ~/.zena-vault/.',
    vaultLocked: 'Cofre bloqueado: desbloqueie antes de acessar as credenciais.',
    wrongMaster: 'Senha mestra incorreta.',
    wrongPin: 'PIN incorreto.',
    wrongRecovery: 'Frase de recuperação incorreta.',
    invalidMasterLength: 'A senha mestra deve ter exatamente 24 caracteres.',
    invalidPin: 'O PIN deve ter exatamente 8 dígitos.',
    invalidRecovery: 'A frase de recuperação precisa de pelo menos 12 palavras.',
    invalidTitle: 'Informe o título da credencial.',
    invalidUsername: 'Usuário inválido.',
    invalidDomain: 'Domínio inválido.',
    invalidId: 'Identificador de credencial inválido.',
    entryNotFound: 'Credencial não encontrada.',
    invalidGenerator: 'Parâmetros inválidos para o gerador de senhas.',
    internal: 'Erro interno do cofre.',
  },
};

/** Forma canônica: todo idioma deve ter exatamente estas chaves e assinaturas. */
export type Messages = typeof ptBR;
