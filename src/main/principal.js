// O processo principal: a janela transparente sobre a barra de tarefas, a
// bandeja e a ponte com o pet. O comportamento em si vive no renderer.
const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const { retanguloDaPista, trechosDoChao } = require('./pista');
const { criarBandeja } = require('./bandeja');
const { abrirCanal } = require('./canal');
const ganchos = require('./ganchos');
const preferencias = require('./preferencias');

/** De quanto em quanto tempo o pet recebe a posição do mouse na tela toda. */
const INTERVALO_CURSOR_MS = 80;

let janela = null;
let bandeja = null;
let prefs = null;
let leituraCursor = null;

// Um Icozinho só: abrir de novo traz o que já está rodando.
if (!app.requestSingleInstanceLock()) app.quit();

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

/** Monitor plugado, removido ou com a barra mudada: refaz a pista. */
function reposicionar() {
  if (!janela) return;
  janela.setBounds(retanguloDaPista());
  janela.webContents.send('chao', trechosDoChao());
}

function alternarVisivel() {
  if (!janela) return;
  prefs.visivel = !janela.isVisible();
  if (prefs.visivel) janela.showInactive();
  else janela.hide();
  janela.webContents.send('visivel', prefs.visivel);
  preferencias.salvar(prefs);
}

function definirInicio(ligado) {
  prefs.iniciarComWindows = ligado;
  app.setLoginItemSettings({ openAtLogin: ligado });
  preferencias.salvar(prefs);
}

ipcMain.on('capturar-mouse', (_evento, capturar) => {
  if (janela) janela.setIgnoreMouseEvents(!capturar, { forward: true });
});

/* ── Claude Code ──────────────────────────────────────────────────── */

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
}

/*
 * Pedidos esperando você: permissões e perguntas. Cada um segura a conexão
 * do retransmissor aberta até você decidir no balão. Se a conexão cair (o
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

const avisarPet = (canalIpc, dados) => {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canalIpc, dados);
};

function encerrarPedido(id, resposta) {
  const pedido = pedidos.get(id);
  if (!pedido) return;
  pedidos.delete(id);
  if (resposta && !pedido.conexao.destroyed) pedido.conexao.end(JSON.stringify(resposta) + '\n');
  else pedido.conexao.destroy();
  avisarPet('pedido-encerrado', id);
}

/** Cada evento do Claude Code vai para o pet reagir; pedidos ficam esperando. */
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

  if (!evento.icozinho_espera) {
    conexao.end();
    avisarPet('agente', evento);
    return;
  }

  const id = proximoPedido++;
  pedidos.set(id, { conexao, sessao: evento.session_id });
  conexao.on('close', () => {
    if (pedidos.has(id)) {
      pedidos.delete(id);
      avisarPet('pedido-encerrado', id);
    }
  });
  avisarPet('agente', evento); // o pet também reage: "precisa de você"
  avisarPet('pedido', { id, tipo: evento.icozinho_espera, evento });
}

// O balão manda a decisão: permitir, negar, responder ou "no terminal".
ipcMain.on('decidir', (_e, { id, decisao, respostas }) => {
  if (!pedidos.has(id)) return;
  if (decisao === 'terminal') return encerrarPedido(id); // sem decisão: o terminal pergunta
  encerrarPedido(id, { decisao, respostas });
});

app.whenReady().then(() => {
  prefs = preferencias.ler();
  app.setLoginItemSettings({ openAtLogin: prefs.iniciarComWindows });
  criarJanela();
  retransmissor = ganchos.prepararRetransmissor();
  abrirCanal(aoEventoDoClaude);
  bandeja = criarBandeja({
    estaVisivel: () => Boolean(janela && janela.isVisible()),
    alternarVisivel,
    iniciaComWindows: () => prefs.iniciarComWindows,
    definirInicio,
    ligadoAoClaude: () => ganchos.estado(),
    ligarClaude,
    desligarClaude,
    sair: () => app.quit(),
  });

  screen.on('display-added', reposicionar);
  screen.on('display-removed', reposicionar);
  screen.on('display-metrics-changed', reposicionar);
});

app.on('second-instance', () => {
  if (janela && !janela.isVisible()) alternarVisivel();
});

// Fechar a janela não encerra: o Icozinho só sai pela bandeja.
app.on('window-all-closed', (evento) => evento.preventDefault());
