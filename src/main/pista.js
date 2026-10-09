// A PISTA — a faixa transparente, logo acima da barra de tarefas, onde o
// Icozinho vive. Cobre todos os monitores na horizontal, para ele poder
// passear de uma tela para a outra.
const { screen } = require('electron');

/** Altura da faixa acima do chão, em px: espaço para pular e ser arrastado. */
const ALTURA_PISTA = 260;

/**
 * O chão de um monitor, em px de tela: o topo da barra de tarefas quando ela
 * está visível embaixo; senão (oculta ou em outra borda), o rodapé da tela.
 */
function chaoDoMonitor({ bounds, workArea }) {
  const barraEmbaixo = workArea.y === bounds.y && workArea.height < bounds.height;
  return barraEmbaixo ? workArea.y + workArea.height : bounds.y + bounds.height;
}

/**
 * Retângulo da janela: a largura do desktop inteiro e a altura que cobre da
 * pista mais alta até o chão mais baixo (monitores de alturas diferentes ou
 * com a barra oculta têm chãos em alturas diferentes).
 */
function retanguloDaPista() {
  const monitores = screen.getAllDisplays();
  const x = Math.min(...monitores.map((m) => m.bounds.x));
  const direita = Math.max(...monitores.map((m) => m.bounds.x + m.bounds.width));
  const chaos = monitores.map(chaoDoMonitor);
  const y = Math.min(...chaos) - ALTURA_PISTA;
  return { x, y, width: direita - x, height: Math.max(...chaos) - y };
}

/**
 * O que o pet precisa saber para andar: cada monitor como um trecho
 * horizontal com o próprio chão, já em coordenadas da janela (px a partir do
 * canto de cima à esquerda dela).
 */
function trechosDoChao() {
  const janela = retanguloDaPista();
  return screen.getAllDisplays().map((m) => ({
    inicio: m.bounds.x - janela.x,
    fim: m.bounds.x + m.bounds.width - janela.x,
    chao: chaoDoMonitor(m) - janela.y,
  }));
}

module.exports = { retanguloDaPista, trechosDoChao };
