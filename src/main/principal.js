// O processo principal: o pet sobre a barra de tarefas, a ilha no topo, a
// bandeja e a ponte com o Claude Code. O comportamento visual vive nos
// renderers (src/renderer é o pet, src/ilha é a ilha).
const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const { retanguloDaPista, trechosDoChao } = require('./pista');
const { criarBandeja } = require('./bandeja');
const { abrirCanal } = require('./canal');
const ganchos = require('./ganchos');
const ilha = require('./ilha');
const sessoes = require('./sessoes');
const preferencias = require('./preferencias');

/** De quanto em quanto tempo o pet recebe a posição do mouse na tela toda. */
const INTERVALO_CURSOR_MS = 80;

let janela = null; // o pet
let bandeja = null;
let prefs = null;
let leituraCursor = null;

// Um Icozinho só: abrir de novo traz a ilha.
if (!app.requestSingleInstanceLock()) app.quit();

/* ── o pet ────────────────────────────────────────────────────────── */

function criarJanela() {
  const area = retanguloDaPista();
  janela = new BrowserWindow({
    ...area,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'ponte.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // O Windows encolhe janelas não redimensionáveis para caber no primeiro
  // monitor ao criar. Reaplicar o retângulo depois estica para o desktop todo.
  janela.setBounds(area);
  janela.setAlwaysOnTop(true, 'screen-saver');
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Por padrão o clique atravessa o pet; o renderer liga a captura só quando
  // o mouse está em cima da gema.
  janela.setIgnoreMouseEvents(true, { forward: true });

  janela.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  janela.webContents.on('did-finish-load', () => {
    janela.webContents.send('chao', trechosDoChao());
    janela.webContents.send('pendentes', [...pedidos.values()].filter((p) => !p.conversa).length);
    if (prefs.visivel) janela.showInactive();
  });

  // O pet "vê" o mouse na tela inteira, não só dentro da faixa dele.
  leituraCursor = setInterval(() => {
    if (!janela || !janela.isVisible()) return;
    const ponto = screen.getCursorScreenPoint();
    const area = janela.getBounds();
    janela.webContents.send('cursor', { x: ponto.x - area.x, y: ponto.y - area.y });
  }, INTERVALO_CURSOR_MS);

  janela.on('closed', () => {
    clearInterval(leituraCursor);
    janela = null;
  });
}

const avisarPet = (canalIpc, dados) => {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canalIpc, dados);
};

/** Monitor plugado, removido ou com a barra mudada: refaz a pista e a ilha. */
function reposicionar() {
  ilha.reposicionar();
  if (!janela) return;
  janela.setBounds(retanguloDaPista());
  janela.webContents.send('chao', trechosDoChao());
}

/** Pet na barra de tarefas: ligado ele passeia, desligado fica só a ilha. */
function definirPetNaBarra(ligado) {
  if (!janela) return;
  prefs.visivel = ligado;
  if (ligado) janela.showInactive();
  else janela.hide();
  janela.webContents.send('visivel', ligado);
  preferencias.salvar(prefs);
  atualizarTudo();
}

function definirInicio(ligado) {
  prefs.iniciarComWindows = ligado;
  app.setLoginItemSettings({ openAtLogin: ligado });
  preferencias.salvar(prefs);
  atualizarTudo();
}

ipcMain.on('capturar-mouse', (_evento, capturar) => {
  if (janela) janela.setIgnoreMouseEvents(!capturar, { forward: true });
});
ipcMain.on('abrir-ilha', () => ilha.enviar('pedir-abrir', { focar: false }));

/* ── Claude Code: ligar e desligar ────────────────────────────────── */

let retransmissor = null;

/** Mostra exatamente o que vai entrar no settings.json e pede o OK. */
async function ligarClaude() {
  const entradas = JSON.stringify({ hooks: ganchos.entradasDoIcozinho(retransmissor) }, null, 2);
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Ligar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    title: 'Ligar o Icozinho ao Claude Code',
    message: 'O Icozinho vai acompanhar as sessões do Claude Code.',
    detail:
      `Vou adicionar estas entradas em ${ganchos.arquivoDoClaude()}, ` +
      'sem mexer no resto do arquivo, e guardar uma cópia de segurança antes:\n\n' +
      entradas +
      '\n\nSe o Icozinho estiver fechado, o Claude Code segue normalmente.',
  });
  if (response !== 0) return;
  try {
    const copia = ganchos.instalar(retransmissor);
    dialog.showMessageBox({
      type: 'info',
      title: 'Icozinho ligado',
      message: 'Pronto: as próximas sessões do Claude Code já aparecem no Icozinho.',
      detail: copia ? `Cópia de segurança: ${copia}` : 'Não havia settings.json; criei um novo.',
    });
  } catch (erro) {
    dialog.showErrorBox('Não deu para ligar', erro.message);
  }
  atualizarTudo();
}

async function desligarClaude() {
  try {
    const copia = ganchos.desinstalar();
    dialog.showMessageBox({
      type: 'info',
      title: 'Icozinho desligado',
      message: 'Tirei do settings.json só o que era do Icozinho.',
      detail: copia ? `Cópia de segurança: ${copia}` : '',
    });
  } catch (erro) {
    dialog.showErrorBox('Não deu para desligar', erro.message);
  }
  atualizarTudo();
}

/* ── Claude Code: eventos e pedidos ───────────────────────────────── */

/*
 * Pedidos esperando você: permissões e perguntas. Cada um segura a conexão
 * do retransmissor aberta até você decidir na ilha. Se a conexão cair (o
 * tempo acabou, ou você respondeu no terminal e o Claude seguiu), o pedido
 * some do Icozinho.
 */
const pedidos = new Map();
let proximoPedido = 1;

const EVENTOS_DE_AVANCO = ['PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'Stop', 'StopFailure', 'SessionEnd'];
const seguiuEmFrente = (evento) =>
  !evento.icozinho_espera &&
  (EVENTOS_DE_AVANCO.includes(evento.hook_event_name) ||
    (evento.hook_event_name === 'PreToolUse' && evento.tool_name !== 'AskUserQuestion'));

/** O que a ilha mostra: sessões, pedidos e ajustes. */
function estadoParaIlha() {
  return {
    sessoes: sessoes.lista(),
    pedidos: [...pedidos.entries()].map(([id, p]) => ({ id, tipo: p.tipo, evento: p.evento, conversa: p.conversa })),
    ajustes: {
      petNaBarra: Boolean(prefs.visivel),
      iniciarComWindows: Boolean(prefs.iniciarComWindows),
      som: prefs.som !== false,
      ladoDaDoca: prefs.ladoDaDoca || 'direita',
      claude: ganchos.estado(),
    },
  };
}

/** Avisa a ilha, o pet e a bandeja de que algo mudou. */
function atualizarTudo() {
  ilha.enviar('estado', estadoParaIlha());
  // O pet só chama atenção para as sessões; os pedidos da conversa você vê
  // ali mesmo, na aba onde está conversando.
  avisarPet('pendentes', [...pedidos.values()].filter((p) => !p.conversa).length);
  if (bandeja) bandeja.atualizar();
}

function encerrarPedido(id, resposta) {
  const pedido = pedidos.get(id);
  if (!pedido) return;
  pedidos.delete(id);
  if (resposta && !pedido.conexao.destroyed) pedido.conexao.end(JSON.stringify(resposta) + '\n');
  else pedido.conexao.destroy();
  atualizarTudo();
}

/** Cada evento do Claude Code: o pet reage, a ilha atualiza, pedidos esperam. */
function aoEventoDoClaude(evento, conexao) {
  // Se a mesma sessão andou para a frente, o pedido que estava esperando já
  // foi respondido no terminal. Só contam eventos que provam isso: o aviso
  // "esperando permissão" e o gancho geral da própria pergunta chegam junto
  // com o pedido e não podem derrubá-lo.
  if (seguiuEmFrente(evento)) {
    for (const [id, pedido] of pedidos) {
      if (pedido.sessao === evento.session_id) encerrarPedido(id);
    }
  }

  // A conversa da doca não é uma sessão de trabalho: não entra na lista nem
  // faz o pet reagir; só o pedido de permissão dela segue para a aba Conversa.
  if (!evento.icozinho_conversa) {
    sessoes.registrar(evento);
    avisarPet('agente', evento);
    ilha.enviar('evento', evento);
  }

  if (!evento.icozinho_espera) {
    conexao.end();
    atualizarTudo();
    return;
  }

  const id = proximoPedido++;
  pedidos.set(id, {
    conexao,
    sessao: evento.session_id,
    tipo: evento.icozinho_espera,
    evento,
    conversa: Boolean(evento.icozinho_conversa),
  });
  conexao.on('close', () => {
    if (pedidos.delete(id)) atualizarTudo();
  });
  atualizarTudo();
}

// A ilha manda a decisão: permitir, negar, responder ou "no terminal".
ipcMain.on('decidir', (_e, { id, decisao, respostas, livres }) => {
  if (!pedidos.has(id)) return;
  if (decisao === 'terminal') return encerrarPedido(id); // sem decisão: o terminal pergunta
  encerrarPedido(id, { decisao, respostas, livres });
});

/* ── a ilha ───────────────────────────────────────────────────────── */

ipcMain.on('ilha-modo', (_e, { modo, focar }) => ilha.definirModo(modo, { focar }));
ipcMain.on('ilha-capturar', (_e, capturar) => ilha.capturarMouse(capturar));
ipcMain.on('ajustar', (_e, { chave, valor }) => {
  if (chave === 'petNaBarra') definirPetNaBarra(Boolean(valor));
  else if (chave === 'iniciarComWindows') definirInicio(Boolean(valor));
  else if (chave === 'som') {
    prefs.som = Boolean(valor);
    preferencias.salvar(prefs);
    atualizarTudo();
  } else if (chave === 'ladoDaDoca' && ['direita', 'esquerda', 'topo'].includes(valor)) {
    prefs.ladoDaDoca = valor;
    preferencias.salvar(prefs);
    ilha.definirLado(valor);
    atualizarTudo();
  }
});
ipcMain.on('ligar-claude', () => ligarClaude());
ipcMain.on('desligar-claude', () => desligarClaude());



/* ── começo e fim ─────────────────────────────────────────────────── */

app.whenReady().then(() => {
  prefs = preferencias.ler();
  app.setLoginItemSettings({ openAtLogin: prefs.iniciarComWindows });
  criarJanela();
  const janelaIlha = ilha.criarIlha({
    ladoInicial: prefs.ladoDaDoca,
    aoPerderFoco: () => ilha.enviar('perdeu-foco'),
  });
  janelaIlha.webContents.on('did-finish-load', () => {
    ilha.enviar('lado', ilha.ladoAtual());
    atualizarTudo();
  });
  retransmissor = ganchos.prepararRetransmissor();
  abrirCanal(aoEventoDoClaude);
  bandeja = criarBandeja({
    abrirIlha: () => ilha.enviar('pedir-abrir', { focar: true }),
    petNaBarra: () => Boolean(prefs.visivel),
    definirPetNaBarra,
    iniciaComWindows: () => prefs.iniciarComWindows,
    definirInicio,
    ligadoAoClaude: () => ganchos.estado(),
    ligarClaude,
    desligarClaude,
    sair: () => app.quit(),
  });

  // As sessões "esquecem" sozinhas com o tempo: a lista se atualiza a cada minuto.
  setInterval(() => ilha.enviar('estado', estadoParaIlha()), 60_000);

  screen.on('display-added', reposicionar);
  screen.on('display-removed', reposicionar);
  screen.on('display-metrics-changed', reposicionar);
});

app.on('second-instance', () => ilha.enviar('pedir-abrir', { focar: true }));

// Fechar uma janela não encerra: o Icozinho só sai pela bandeja.
app.on('window-all-closed', (evento) => evento.preventDefault());
