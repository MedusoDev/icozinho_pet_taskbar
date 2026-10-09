// A PONTE DA ILHA — o que o painel do topo pode pedir ao processo principal.
const { contextBridge, ipcRenderer } = require('electron');

const ouvir = (canal) => (callback) => ipcRenderer.on(canal, (_e, dados) => callback(dados));

contextBridge.exposeInMainWorld('ilha', {
  /** Sessões, pedidos e ajustes, sempre que algo muda. */
  aoEstado: ouvir('estado'),
  /** Cada evento do Claude Code, para os sons (pronto, erro). */
  aoEvento: ouvir('evento'),
  /** Pedaços e fim da resposta da conversa. */
  aoConversa: ouvir('conversa'),
  /** Clicou fora depois de usar: hora de recolher. */
  aoPerderFoco: ouvir('perdeu-foco'),
  /** Pediram para abrir (cutucar o pet, bandeja). */
  aoPedirAbrir: ouvir('pedir-abrir'),
  /** Em que borda a doca está: 'direita', 'esquerda' ou 'topo'. */
  aoLado: ouvir('lado'),

  /** 'escondida', 'aba' ou 'aberta'; focar só quando foi você que clicou. */
  definirModo: (modo, focar = false) => ipcRenderer.send('ilha-modo', { modo, focar }),
  capturarMouse: (capturar) => ipcRenderer.send('ilha-capturar', capturar),

  /** A sua decisão num pedido: 'permitir', 'negar', 'responder' ou 'terminal'. */
  decidir: (id, decisao, respostas, livres) => ipcRenderer.send('decidir', { id, decisao, respostas, livres }),

  /** Ajustes: 'petNaBarra', 'iniciarComWindows', 'som', 'ladoDaDoca'. */
  ajustar: (chave, valor) => ipcRenderer.send('ajustar', { chave, valor }),
  ligarClaude: () => ipcRenderer.send('ligar-claude'),
  desligarClaude: () => ipcRenderer.send('desligar-claude'),

  conversar: (texto) => ipcRenderer.send('conversa-enviar', texto),
  pararConversa: () => ipcRenderer.send('conversa-parar'),
  novaConversa: () => ipcRenderer.send('conversa-nova'),
});
