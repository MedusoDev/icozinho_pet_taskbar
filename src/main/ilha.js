// A DOCA — a casinha do Icozinho grudada na borda da tela, escondida como a
// barra de tarefas com "ocultar automaticamente".
//
// Três modos, decididos pela própria doca (renderer):
//   escondida  só um fio de luz na borda, com a cor do estado do Claude
//   aba        o mouse encostou na borda: a aba com a gema desliza para fora
//   aberta     o painel inteiro (sessões, conversa e ajustes)
//
// O lado (direita, esquerda ou topo) vem dos ajustes. O clique atravessa a
// doca onde não há nada; o teclado só é dela quando você clica para abrir
// (abrir sozinha, num pedido, não rouba o seu foco).
const { BrowserWindow, screen } = require('electron');
const path = require('path');

/** Largura × altura de cada modo, por lado. */
const TAMANHOS = {
  direita: { escondida: [10, 150], aba: [78, 100], aberta: [470, 490] },
  esquerda: { escondida: [10, 150], aba: [78, 100], aberta: [470, 490] },
  topo: { escondida: [180, 10], aba: [400, 64], aberta: [470, 470] },
};

let janela = null;
let modo = 'escondida';
let lado = 'direita';
let comFoco = false;

/**
 * O monitor da ponta: o mais à direita para a doca da direita, o mais à
 * esquerda para a da esquerda (assim a borda é borda de verdade, e o mouse
 * para nela). O topo fica no principal.
 */
function monitorDoLado() {
  const todos = screen.getAllDisplays();
  if (lado === 'direita') return todos.reduce((a, b) => (b.bounds.x + b.bounds.width > a.bounds.x + a.bounds.width ? b : a));
  if (lado === 'esquerda') return todos.reduce((a, b) => (b.bounds.x < a.bounds.x ? b : a));
  return screen.getPrimaryDisplay();
}

function retangulo(m) {
  const { workArea: a } = monitorDoLado();
  const [width, height] = TAMANHOS[lado][m];
  const meioY = Math.round(a.y + (a.height - height) / 2);
  if (lado === 'direita') return { x: a.x + a.width - width, y: meioY, width, height };
  if (lado === 'esquerda') return { x: a.x, y: meioY, width, height };
  return { x: Math.round(a.x + (a.width - width) / 2), y: a.y, width, height };
}

function criarIlha({ ladoInicial = 'direita', aoPerderFoco } = {}) {
  lado = TAMANHOS[ladoInicial] ? ladoInicial : 'direita';
  janela = new BrowserWindow({
    ...retangulo('escondida'),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'ponte_ilha.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  janela.setAlwaysOnTop(true, 'screen-saver');
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Escondida, o clique atravessa o fio; o movimento do mouse continua
  // chegando, e é assim que a doca percebe você encostando na borda.
  janela.setIgnoreMouseEvents(true, { forward: true });
  janela.loadFile(path.join(__dirname, '..', 'ilha', 'index.html'));
  janela.once('ready-to-show', () => janela.showInactive());

  janela.on('focus', () => (comFoco = true));
  janela.on('blur', () => {
    // Você clicou fora depois de usar a doca: ela recolhe.
    if (comFoco && aoPerderFoco) aoPerderFoco();
    comFoco = false;
  });
  janela.on('closed', () => (janela = null));
  return janela;
}

/**
 * Troca o tamanho conforme o modo. `focar` só quando foi você que clicou
 * para abrir: é o que libera o teclado para a conversa e o "Outro…".
 */
function definirModo(novo, { focar = false } = {}) {
  if (!janela || !TAMANHOS[lado][novo]) return;
  modo = novo;
  janela.setBounds(retangulo(novo));
  if (novo === 'aberta') {
    janela.setIgnoreMouseEvents(false);
    if (focar) janela.focus();
  } else {
    janela.setIgnoreMouseEvents(true, { forward: true });
  }
}

/** Na aba, o renderer pede o mouse quando está em cima dela. */
function capturarMouse(capturar) {
  if (!janela || modo === 'aberta') return;
  janela.setIgnoreMouseEvents(!capturar, { forward: true });
}

/** Muda a doca de lado (ajustes) e avisa o renderer para trocar o desenho. */
function definirLado(novo) {
  if (!TAMANHOS[novo]) return;
  lado = novo;
  enviar('lado', lado);
  if (janela) janela.setBounds(retangulo(modo));
}

function enviar(canal, dados) {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, dados);
}

/** Monitor mudou: reposiciona na borda. */
const reposicionar = () => janela && janela.setBounds(retangulo(modo));

module.exports = { criarIlha, definirModo, definirLado, capturarMouse, enviar, reposicionar, ladoAtual: () => lado };
