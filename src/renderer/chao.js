// O CHÃO — cada monitor é um trecho horizontal com a própria altura de chão
// (a barra de tarefas). Tudo aqui é em px da janela, com y crescendo para
// cima a partir da base dela, que é como a cena 3D enxerga.

let trechos = [];
let alturaJanela = 1;

/**
 * @param {{ inicio: number, fim: number, chao: number }[]} novos trechos vindos
 *   do processo principal (chao em px a partir do topo da janela)
 * @param {number} altura altura da janela em px
 */
export function definirChao(novos, altura) {
  alturaJanela = altura;
  trechos = novos.map((t) => ({ ...t, y: altura - t.chao }));
}

/** O trecho (monitor) onde está o x, ou o mais próximo dele. */
export function trechoEm(x) {
  if (trechos.length === 0) return { inicio: 0, fim: window.innerWidth, y: 0 };
  return (
    trechos.find((t) => x >= t.inicio && x < t.fim) ??
    trechos.reduce((perto, t) =>
      Math.abs((t.inicio + t.fim) / 2 - x) < Math.abs((perto.inicio + perto.fim) / 2 - x) ? t : perto
    )
  );
}

/** Altura do chão no x. */
export const chaoEm = (x) => trechoEm(x).y;

/** De ponta a ponta do desktop: até onde dá para andar. */
export function limites() {
  if (trechos.length === 0) return { inicio: 0, fim: window.innerWidth };
  return {
    inicio: Math.min(...trechos.map((t) => t.inicio)),
    fim: Math.max(...trechos.map((t) => t.fim)),
  };
}

/** Converte y de tela (do topo, como o mouse) para y da cena (da base). */
export const yDaCena = (yTela) => alturaJanela - yTela;
