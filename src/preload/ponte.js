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
  /** Uma permissão ou pergunta esperando você decidir. */
  aoPedido: (callback) => ipcRenderer.on('pedido', (_e, pedido) => callback(pedido)),
  /** O pedido foi resolvido (aqui, no terminal, ou o tempo acabou). */
  aoPedidoEncerrado: (callback) => ipcRenderer.on('pedido-encerrado', (_e, id) => callback(id)),
  /** A sua decisão: 'permitir', 'negar', 'responder' (com respostas) ou 'terminal'. */
  decidir: (id, decisao, respostas) => ipcRenderer.send('decidir', { id, decisao, respostas }),
});
