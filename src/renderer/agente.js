// O AGENTE — traduz os eventos do Claude Code em reação do Icozinho e no
// balãozinho em cima dele ("Editando pet.js", "Pronto", "Precisa de você").
//
//   UserPromptSubmit          pensando
//   PreToolUse                trabalhando, com o passo no balão
//   PermissionRequest e       precisa de você (na 0.2.0, responder no
//   Notification de espera    terminal; na 0.3.0, pelo balão)
//   Stop                      terminou: pulinho feliz
//   StopFailure               erro: fica tonto
//   SessionEnd                some

/** Sem notícia do Claude por esse tempo, o balão some e ele volta ao normal. */
const SILENCIO_MS = 60_000;
/** Quanto tempo o "Pronto" e os avisos curtos ficam no balão. */
const AVISO_MS = 5_000;

const ERROS = {
  rate_limit: 'Limite de uso atingido',
  overloaded: 'Servidores cheios, tentando de novo',
  authentication_failed: 'Login do Claude expirou',
  billing_error: 'Problema na assinatura',
  server_error: 'Erro no servidor',
  max_output_tokens: 'Resposta grande demais',
};

const balao = document.getElementById('balao');
const balaoProjeto = balao.querySelector('.projeto');
const balaoTexto = balao.querySelector('.texto');

const nomeDoArquivo = (caminho) => String(caminho || '').split(/[\\/]/).pop();
const cortar = (texto, max) => {
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

/**
 * @param {object} pet o que o pet sabe fazer
 * @param {(tipo: 'pensando'|'trabalhando'|'precisa'|'terminou'|'erro'|'ocioso') => void} pet.reagir
 */
export function ligarAgente(pet) {
  let ultimoEvento = 0;
  let esconderEm = 0;

  function mostrar(projeto, texto, { tipo = '', duracao = 0 } = {}) {
    balaoProjeto.textContent = projeto || '';
    balaoTexto.textContent = texto;
    balao.dataset.tipo = tipo;
    balao.classList.add('visivel');
    esconderEm = duracao ? performance.now() + duracao : 0;
  }
  function esconder() {
    balao.classList.remove('visivel');
    esconderEm = 0;
  }

  window.icozinho.aoEventoDoAgente((ev) => {
    ultimoEvento = performance.now();
    const projeto = nomeDoArquivo(ev.cwd);
    switch (ev.hook_event_name) {
      case 'SessionStart':
        mostrar(projeto, 'Sessão começou', { duracao: 3000 });
        break;
      case 'UserPromptSubmit':
        pet.reagir('pensando');
        mostrar(projeto, 'Pensando…', { tipo: 'pensando' });
        break;
      case 'PreToolUse':
        if (ev.tool_name === 'AskUserQuestion') break; // vira "precisa de você"
        pet.reagir('trabalhando');
        mostrar(projeto, descreverPasso(ev.tool_name, ev.tool_input), { tipo: 'trabalhando' });
        break;
      case 'PostToolUse':
        pet.reagir('trabalhando'); // passou do pedido (se havia um): de volta ao trabalho
        break;
      case 'PostToolUseFailure':
        pet.reagir('trabalhando');
        if (!ev.is_interrupt) mostrar(projeto, `Falhou: ${descreverPasso(ev.tool_name, ev.tool_input)}`, { tipo: 'aviso' });
        break;
      case 'PermissionRequest':
        pet.reagir('precisa');
        mostrar(projeto, `Quer permissão: ${descreverPasso(ev.tool_name, ev.tool_input)}`, { tipo: 'precisa' });
        break;
      case 'Notification':
        if (['permission_prompt', 'agent_needs_input', 'elicitation_dialog', 'idle_prompt'].includes(ev.notification_type)) {
          pet.reagir('precisa');
          mostrar(projeto, cortar(ev.message, 60) || 'Esperando você', { tipo: 'precisa' });
        }
        break;
      case 'Stop': {
        pet.reagir('terminou');
        const resumo = cortar(String(ev.last_assistant_message || '').split(/(?<=[.!?])\s/)[0], 60);
        mostrar(projeto, resumo ? `Pronto · ${resumo}` : 'Pronto!', { tipo: 'terminou', duracao: AVISO_MS });
        break;
      }
      case 'StopFailure':
        pet.reagir('erro');
        mostrar(projeto, ERROS[ev.error] || 'Algo deu errado', { tipo: 'erro', duracao: AVISO_MS * 2 });
        break;
      case 'SessionEnd':
        pet.reagir('ocioso');
        esconder();
        break;
      default:
        break;
    }
  });

  /** Chamado a cada quadro: some quando passa o tempo ou o Claude some. */
  return function atualizarAgente(agora) {
    if (esconderEm && agora > esconderEm) esconder();
    if (ultimoEvento && agora - ultimoEvento > SILENCIO_MS && balao.classList.contains('visivel')) {
      esconder();
      pet.reagir('ocioso');
    }
  };
}

/** Mantém o balão em cima da gema (x e topo da gema, em px da janela). */
export function seguirGema(x, topo) {
  const largura = balao.offsetWidth || 0;
  const esquerda = Math.min(Math.max(x - largura / 2, 8), window.innerWidth - largura - 8);
  balao.style.transform = `translate(${esquerda}px, ${topo - balao.offsetHeight - 10}px)`;
}
