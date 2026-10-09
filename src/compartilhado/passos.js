// Como o Icozinho descreve o que o Claude Code está fazendo, em poucas
// palavras. Usado pelo balão do pet e pela ilha.

export const nomeDoArquivo = (caminho) => String(caminho || '').split(/[\\/]/).pop();

export const cortar = (texto, max) => {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  return limpo.length > max ? limpo.slice(0, max - 1) + '…' : limpo;
};

/** "Editando pet.js", "Rodando npm test"… o passo em poucas palavras. */
export function descreverPasso(ferramenta, entrada = {}) {
  switch (ferramenta) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editando ${nomeDoArquivo(entrada.file_path || entrada.notebook_path)}`;
    case 'Write':
      return `Escrevendo ${nomeDoArquivo(entrada.file_path)}`;
    case 'Read':
      return `Lendo ${nomeDoArquivo(entrada.file_path)}`;
    case 'Bash':
    case 'PowerShell':
      return `Rodando ${cortar(entrada.command, 34)}`;
    case 'Grep':
    case 'Glob':
      return `Procurando ${cortar(entrada.pattern, 28)}`;
    case 'WebFetch':
    case 'WebSearch':
      return 'Pesquisando na web';
    case 'Task':
    case 'Agent':
      return 'Chamando um ajudante';
    case 'TodoWrite':
      return 'Organizando as tarefas';
    case 'AskUserQuestion':
      return 'Tem uma pergunta para você';
    default:
      return ferramenta ? cortar(ferramenta.replace(/^mcp__[^_]+__/, ''), 30) : 'Trabalhando';
  }
}

export const ERROS = {
  rate_limit: 'Limite de uso atingido',
  overloaded: 'Servidores cheios, tentando de novo',
  authentication_failed: 'Login do Claude expirou',
  billing_error: 'Problema na assinatura',
  server_error: 'Erro no servidor',
  max_output_tokens: 'Resposta grande demais',
};
