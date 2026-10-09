// OS GANCHOS — liga e desliga o Icozinho do Claude Code, escrevendo os hooks
// em ~/.claude/settings.json.
//
// Procedimento, sempre:
//   1. cópia de segurança do settings.json antes de qualquer escrita
//   2. só ADICIONA as entradas do Icozinho; o resto do arquivo fica como está
//   3. desligar remove só o que é do Icozinho (reconhecido pelo nome do script)
const { app } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARCA = 'icozinho-gancho.js';
const arquivoDoClaude = () => path.join(os.homedir(), '.claude', 'settings.json');

/** Os eventos que o Icozinho acompanha, com o tempo máximo de cada um (s). */
const EVENTOS = {
  SessionStart: 5,
  UserPromptSubmit: 5,
  PreToolUse: 5,
  PostToolUse: 5,
  PostToolUseFailure: 5,
  PermissionRequest: 120, // espera você permitir ou negar pelo Icozinho
  Notification: 5,
  Stop: 5,
  StopFailure: 5,
  SessionEnd: 5,
};
/** As perguntas de múltipla escolha têm um gancho só delas, que espera a resposta. */
const TEMPO_PERGUNTA = 135;
const MARCA_PERGUNTA = '--pergunta';

/**
 * O retransmissor precisa morar fora do pacote do app (o Node não lê de
 * dentro do .asar). A cada abertura ele é copiado para a pasta de dados, e é
 * esse caminho que vai no settings.json.
 */
function prepararRetransmissor() {
  const destino = path.join(app.getPath('userData'), 'gancho', MARCA);
  const origem = path.join(__dirname, '..', 'gancho', MARCA);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, fs.readFileSync(origem));
  return destino;
}

/** Caminho completo do node; sem ele no PATH, o nome solto ainda é tentado. */
function caminhoDoNode() {
  try {
    const comando = process.platform === 'win32' ? 'where' : 'which';
    const saida = execFileSync(comando, ['node'], { encoding: 'utf8', windowsHide: true });
    return saida.split(/\r?\n/).find((l) => l.trim()) || 'node';
  } catch {
    return 'node';
  }
}

function lerConfiguracao() {
  try {
    return JSON.parse(fs.readFileSync(arquivoDoClaude(), 'utf8'));
  } catch (erro) {
    if (erro.code === 'ENOENT') return {};
    throw new Error('O settings.json do Claude Code não é um JSON válido; não vou mexer nele.');
  }
}

function copiaDeSeguranca() {
  if (!fs.existsSync(arquivoDoClaude())) return null;
  const agora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const carimbo = `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}`;
  const copia = `${arquivoDoClaude()}.bak-icozinho-${carimbo}`;
  fs.copyFileSync(arquivoDoClaude(), copia);
  return copia;
}

const ehDoIcozinho = (gancho) =>
  Boolean(gancho) &&
  [gancho.command, ...(Array.isArray(gancho.args) ? gancho.args : [])].some(
    (parte) => typeof parte === 'string' && parte.includes(MARCA)
  );

/** Tira do objeto de hooks tudo que é do Icozinho, sem tocar no resto. */
function semIcozinho(hooks = {}) {
  const limpo = {};
  for (const [evento, grupos] of Object.entries(hooks)) {
    if (!Array.isArray(grupos)) {
      limpo[evento] = grupos;
      continue;
    }
    const restantes = grupos
      .map((g) => (Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !ehDoIcozinho(h)) } : g))
      .filter((g) => !Array.isArray(g.hooks) || g.hooks.length > 0);
    if (restantes.length > 0) limpo[evento] = restantes;
  }
  return limpo;
}

/**
 * 'atual', 'desatualizado' (ligado por uma versão anterior, sem o gancho das
 * perguntas ou com o tempo curto na permissão) ou null (desligado).
 */
function estado() {
  let hooks;
  try {
    hooks = lerConfiguracao().hooks || {};
  } catch {
    return null;
  }
  const doIcozinho = (evento) =>
    (Array.isArray(hooks[evento]) ? hooks[evento] : []).flatMap((g) =>
      Array.isArray(g.hooks) ? g.hooks.filter(ehDoIcozinho).map((h) => ({ ...h, matcher: g.matcher })) : []
    );
  const algum = Object.keys(hooks).some((evento) => doIcozinho(evento).length > 0);
  if (!algum) return null;
  const temPergunta = doIcozinho('PreToolUse').some((h) => (h.args || []).includes(MARCA_PERGUNTA));
  const permissaoEspera = doIcozinho('PermissionRequest').some((h) => (h.timeout || 0) >= EVENTOS.PermissionRequest);
  return temPergunta && permissaoEspera ? 'atual' : 'desatualizado';
}

/** As entradas que o Icozinho adiciona, para mostrar antes de escrever. */
function entradasDoIcozinho(retransmissor) {
  const node = caminhoDoNode();
  const entradas = {};
  for (const [evento, tempo] of Object.entries(EVENTOS)) {
    entradas[evento] = [{ hooks: [{ type: 'command', command: node, args: [retransmissor], timeout: tempo }] }];
  }
  entradas.PreToolUse.push({
    matcher: 'AskUserQuestion',
    hooks: [{ type: 'command', command: node, args: [retransmissor, MARCA_PERGUNTA], timeout: TEMPO_PERGUNTA }],
  });
  return entradas;
}

/** Liga: devolve o caminho da cópia de segurança (ou null se não havia arquivo). */
function instalar(retransmissor) {
  const configuracao = lerConfiguracao();
  const copia = copiaDeSeguranca();
  const hooks = semIcozinho(configuracao.hooks); // reinstalar não duplica
  for (const [evento, grupos] of Object.entries(entradasDoIcozinho(retransmissor))) {
    hooks[evento] = [...(hooks[evento] || []), ...grupos];
  }
  fs.mkdirSync(path.dirname(arquivoDoClaude()), { recursive: true });
  fs.writeFileSync(arquivoDoClaude(), JSON.stringify({ ...configuracao, hooks }, null, 2) + '\n');
  return copia;
}

/** Desliga: tira só o que é do Icozinho. */
function desinstalar() {
  const configuracao = lerConfiguracao();
  const copia = copiaDeSeguranca();
  const hooks = semIcozinho(configuracao.hooks);
  const novo = { ...configuracao, hooks };
  if (Object.keys(hooks).length === 0) delete novo.hooks;
  fs.writeFileSync(arquivoDoClaude(), JSON.stringify(novo, null, 2) + '\n');
  return copia;
}

module.exports = {
  arquivoDoClaude,
  prepararRetransmissor,
  entradasDoIcozinho,
  estado,
  instalar,
  desinstalar,
};
