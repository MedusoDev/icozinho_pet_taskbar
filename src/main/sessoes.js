// AS SESSÕES — o que a ilha lista: cada sessão do Claude Code aberta, com o
// projeto, o estado e o último passo. Montado a partir dos eventos (hooks).

/** Sessão pronta ou parada há mais que isso sai da lista. */
const ESQUECER_MS = 30 * 60_000;

const sessoes = new Map();

const nomeDoProjeto = (cwd) => String(cwd || '').split(/[\\/]/).filter(Boolean).pop() || 'sessão';

/**
 * Atualiza a sessão do evento. Devolve true se a lista mudou.
 * Estados: 'pensando', 'trabalhando', 'precisa', 'pronto', 'erro', 'ocioso'.
 */
function registrar(ev) {
  const id = ev.session_id;
  if (!id) return false;
  if (ev.hook_event_name === 'SessionEnd') return sessoes.delete(id);

  const sessao = sessoes.get(id) || {
    id,
    projeto: nomeDoProjeto(ev.cwd),
    origem: ev.icozinho_origem === 'claude-desktop' ? 'app' : 'terminal',
    estado: 'ocioso',
    ferramenta: null,
    entrada: null,
    texto: '',
  };
  sessao.atualizado = Date.now();
  if (ev.cwd) sessao.projeto = nomeDoProjeto(ev.cwd);

  switch (ev.hook_event_name) {
    case 'UserPromptSubmit':
      sessao.estado = 'pensando';
      sessao.texto = String(ev.prompt || '').slice(0, 200);
      sessao.ferramenta = null;
      break;
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      if (ev.tool_name === 'AskUserQuestion' && ev.hook_event_name === 'PreToolUse') {
        sessao.estado = 'precisa';
      } else {
        sessao.estado = 'trabalhando';
      }
      sessao.ferramenta = ev.tool_name;
      sessao.entrada = ev.tool_input || null;
      break;
    case 'PermissionRequest':
      sessao.estado = 'precisa';
      sessao.ferramenta = ev.tool_name;
      sessao.entrada = ev.tool_input || null;
      break;
    case 'Notification':
      if (['permission_prompt', 'agent_needs_input', 'elicitation_dialog', 'idle_prompt'].includes(ev.notification_type)) {
        sessao.estado = 'precisa';
        sessao.texto = String(ev.message || '').slice(0, 200);
      }
      break;
    case 'Stop':
      sessao.estado = 'pronto';
      sessao.ferramenta = null;
      sessao.texto = String(ev.last_assistant_message || '').slice(0, 300);
      break;
    case 'StopFailure':
      sessao.estado = 'erro';
      sessao.texto = ev.error || '';
      break;
    default:
      break;
  }
  sessoes.set(id, sessao);
  return true;
}

/** A lista para a ilha, a mais recente primeiro, sem as esquecidas. */
function lista() {
  const agora = Date.now();
  for (const [id, s] of sessoes) {
    if (agora - s.atualizado > ESQUECER_MS) sessoes.delete(id);
  }
  return [...sessoes.values()].sort((a, b) => b.atualizado - a.atualizado);
}

module.exports = { registrar, lista };
