// EFEITOS — o que aparece em volta da gema, em HTML por cima da cena:
// corações no carinho, zzz dormindo, estrelinhas quando fica tonto.
// Recebem a posição da gema em px da janela (y do topo, como o CSS).

const camada = document.getElementById('efeitos');

function particula(texto, classe, x, y) {
  const el = document.createElement('span');
  el.className = `particula ${classe}`;
  el.textContent = texto;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  camada.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  return el;
}

const CORES_CORACAO = ['#c084fc', '#fbbf24', '#f472b6'];
let coracoes = 0;

/** Um coraçãozinho subindo de perto da gema. */
export function coracao(x, y) {
  const el = particula('♥', 'coracao', x + (Math.random() * 30 - 15), y);
  coracoes += 1;
  el.style.color = CORES_CORACAO[coracoes % CORES_CORACAO.length];
}

/** Estrelinhas girando em volta: ficou tonto. */
export function estrelas(x, y) {
  for (let i = 0; i < 3; i++) {
    const el = document.createElement('span');
    el.className = 'particula estrela';
    el.textContent = '✦';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.animationDelay = `${i * -0.4}s`;
    camada.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}

const zzz = document.getElementById('zzz');

/** Mostra ou esconde o zzz, acompanhando a gema. */
export function sono(dormindo, x, y) {
  zzz.classList.toggle('visivel', dormindo);
  if (dormindo) {
    zzz.style.left = `${x + 18}px`;
    zzz.style.top = `${y - 30}px`;
  }
}
