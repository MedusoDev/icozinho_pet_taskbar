// A PONTE — o pouco que o pet pode pedir ao processo principal e ouvir dele.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('icozinho', {
  /** true: a janela captura o mouse (cursor em cima da gema). */
  capturarMouse: (capturar) => ipcRenderer.send('capturar-mouse', capturar),
  /** Trechos do chão, um por monitor, sempre que a pista muda. */
  aoMudarChao: (callback) => ipcRenderer.on('chao', (_e, trechos) => callback(trechos)),
  /** Posição do mouse na tela inteira, em px da janela. */
  aoMoverCursor: (callback) => ipcRenderer.on('cursor', (_e, ponto) => callback(ponto)),
  /** Escondido ou mostrado pela bandeja. */
  aoMudarVisivel: (callback) => ipcRenderer.on('visivel', (_e, visivel) => callback(visivel)),
  /** Um evento do Claude Code (hook), já enxuto pelo retransmissor. */
  aoEventoDoAgente: (callback) => ipcRenderer.on('agente', (_e, evento) => callback(evento)),
  /** Quantas permissões e perguntas estão esperando você (o cartão fica na ilha). */
  aoPendentes: (callback) => ipcRenderer.on('pendentes', (_e, n) => callback(n)),
  /** Abre o painel da ilha (cutucar o pet com pedido esperando). */
  abrirIlha: () => ipcRenderer.send('abrir-ilha'),
});
