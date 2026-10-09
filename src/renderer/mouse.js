// O MOUSE — a janela cobre a faixa toda, mas só captura o mouse quando ele
// está em cima da gema; no resto, o clique atravessa para o que está atrás.
// Daqui saem os três gestos: cutucar (clique), arrastar e o carinho (passar
// o mouse em vai-e-vem por cima).
import { yDaCena } from './chao.js';

/** Quantas viradas de direção, em pouco tempo, contam como carinho. */
const VIRADAS_DO_CARINHO = 3;
const JANELA_DO_CARINHO_MS = 1200;
/** Quanto o mouse precisa andar apertado para virar arrasto, e não clique. */
const LIMIAR_ARRASTO_PX = 5;

/**
 * @param {{ x: number, y: number }} pet posição atual da gema (px da cena)
 * @param {number} raio raio da gema em px
 * @param {object} acoes o que o pet faz em cada gesto
 */
export function ligarMouse(pet, raio, acoes) {
  let capturando = false;
  let apertado = null;
  let arrastando = false;
  let ultimo = null;
  const velocidade = { x: 0, y: 0 };
  let ultimoX = null;
  let direcao = 0;
  let viradas = [];

  const emCima = (e) => {
    const dx = e.clientX - pet.x;
    const dy = yDaCena(e.clientY) - pet.y;
    return dx * dx + dy * dy < (raio * 1.25) ** 2;
  };

  function capturar(sim) {
    if (sim === capturando) return;
    capturando = sim;
    window.icozinho.capturarMouse(sim);
  }

  window.addEventListener('mousemove', (e) => {
    const agora = performance.now();
    capturar(arrastando || Boolean(apertado) || emCima(e));

    if (apertado && !arrastando && Math.hypot(e.clientX - apertado.x, e.clientY - apertado.y) > LIMIAR_ARRASTO_PX) {
      arrastando = true;
      acoes.comecarArrasto();
    }

    if (arrastando) {
      const y = yDaCena(e.clientY);
      if (ultimo) {
        const dt = Math.max((agora - ultimo.t) / 1000, 0.008);
        // velocidade suavizada: é ela que vira o arremesso ao soltar
        velocidade.x = velocidade.x * 0.5 + ((e.clientX - ultimo.x) / dt) * 0.5;
        velocidade.y = velocidade.y * 0.5 + ((y - ultimo.y) / dt) * 0.5;
      }
      ultimo = { x: e.clientX, y, t: agora };
      acoes.arrastar(e.clientX, y);
      return;
    }

    // Carinho: vai-e-vem em cima dele. Só passar por cima não conta.
    if (!apertado && emCima(e)) {
      if (ultimoX !== null && Math.abs(e.clientX - ultimoX) > 2) {
        const nova = Math.sign(e.clientX - ultimoX);
        if (direcao !== 0 && nova !== direcao) viradas.push(agora);
        direcao = nova;
      }
      ultimoX = e.clientX;
      viradas = viradas.filter((t) => agora - t < JANELA_DO_CARINHO_MS);
      if (viradas.length >= VIRADAS_DO_CARINHO) acoes.carinho(agora);
    } else {
      ultimoX = null;
      direcao = 0;
    }
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !emCima(e)) return;
    apertado = { x: e.clientX, y: e.clientY };
    ultimo = null;
    velocidade.x = velocidade.y = 0;
  });

  function soltar() {
    if (arrastando) {
      const limite = 1600;
      acoes.soltar(
        Math.max(-limite, Math.min(limite, velocidade.x)),
        Math.max(-limite, Math.min(limite, velocidade.y))
      );
    } else if (apertado) {
      acoes.cutucar(performance.now());
    }
    apertado = null;
    arrastando = false;
  }
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) soltar();
  });
  // Saiu da faixa arrastando: solta ali mesmo, em vez de ficar grudado.
  document.addEventListener('mouseleave', () => {
    if (arrastando) soltar();
  });
}
