// O processo principal: a janela transparente sobre a barra de tarefas, a
// bandeja e a ponte com o pet. O comportamento em si vive no renderer.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { retanguloDaPista, trechosDoChao } = require('./pista');
const { criarBandeja } = require('./bandeja');
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

app.whenReady().then(() => {
  prefs = preferencias.ler();
  app.setLoginItemSettings({ openAtLogin: prefs.iniciarComWindows });
  criarJanela();
  bandeja = criarBandeja({
    estaVisivel: () => Boolean(janela && janela.isVisible()),
    alternarVisivel,
    iniciaComWindows: () => prefs.iniciarComWindows,
    definirInicio,
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
