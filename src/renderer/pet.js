// O ICOZINHO — a cena, o estado e o relógio de cada quadro.
//
// Modos:
//   passeando  rola até um ponto da pista, em qualquer monitor
//   parado     descansa um pouco; se o mouse chega perto, fica olhando
//   arrastado  segue o mouse
//   caindo     no ar: pulinho, cutucada, arremesso ou queda de um monitor
//              para outro mais baixo; quica ao chegar no chão
//   dormindo   depois de muito tempo sem ninguém por perto
import * as THREE from 'three';
import { criarGema } from './gema.js';
import { chaoEm, definirChao, limites, trechoEm, yDaCena } from './chao.js';
import { coracao, estrelas, sono } from './efeitos.js';
import { ligarMouse } from './mouse.js';
import { ligarAgente, seguirGema } from './agente.js';
import { ligarCartao, seguirGemaComCartao, temPedido } from './cartao.js';

const RAIO = 26;              // px na tela
const VELOCIDADE = 55;        // px/s passeando
const GRAVIDADE = 1500;       // px/s²
const TEDIO_TIQUE_S = 40;     // sem ninguém mexer: começa a dar pulinhos
const TEDIO_SONO_S = 180;     // e depois dorme
const PERTO_CURIOSO = 240;    // px: o mouse chegou perto, ele para e olha
const PERTO_ACORDA = 160;     // px: chegar perto assim acorda

/* ── cena ─────────────────────────────────────────────────────────── */

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('cena'),
  alpha: true,
  antialias: true,
  powerPreference: 'low-power',
});
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// Câmera ortográfica em pixels, com y crescendo para cima: a gema tem o
// mesmo tamanho e a mesma forma em qualquer ponto da faixa.
const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -500, 500);

function ajustarTamanho() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.right = window.innerWidth;
  camera.top = window.innerHeight;
  camera.updateProjectionMatrix();
}
ajustarTamanho();
window.addEventListener('resize', ajustarTamanho);

const gema = criarGema(renderer, scene, RAIO);

/* ── estado ───────────────────────────────────────────────────────── */

const pet = {
  x: window.innerWidth / 2,
  y: RAIO,
  vx: 0,
  vy: 0,
  modo: 'parado',
  alvoX: null,
  pausaAte: 0,
  rolagem: 0,
  giro: 0,
  giroVel: 0,
  desdobraExtra: 0,
  olharX: 0,
  olharY: 0,
  ultimoInput: performance.now(),
  proximoTique: 0,
  cutucadas: [],
  tontoAte: 0,
  felizAte: 0,
  proximoCoracao: 0,
  cursor: null,
  posicionado: false,
  // o que o Claude Code está fazendo: null, 'pensando', 'trabalhando', 'precisa'
  agente: null,
  proximoChamado: 0,
};

const agoraMs = () => performance.now();
const emRepouso = () => pet.modo === 'passeando' || pet.modo === 'parado';
const xDaTela = () => pet.x;
const yDaTela = () => window.innerHeight - pet.y;

function escolherAlvo() {
  // Quase sempre passeia no monitor onde está; às vezes atravessa para outro.
  const { inicio, fim } = Math.random() < 0.75 ? trechoEm(pet.x) : limites();
  pet.alvoX = inicio + RAIO * 2 + Math.random() * Math.max(0, fim - inicio - RAIO * 4);
  pet.modo = 'passeando';
}

function descansar(ms) {
  pet.modo = 'parado';
  pet.alvoX = null;
  pet.pausaAte = agoraMs() + ms;
}

function pular(vy, vx = 0) {
  pet.modo = 'caindo';
  pet.vy = vy;
  pet.vx = vx;
}

function dormir() {
  pet.modo = 'dormindo';
  pet.alvoX = null;
}

function acordar() {
  pet.desdobraExtra = 1;
  pet.giroVel += 6;
  pular(320); // acorda com susto
  sono(false);
}

function registrarInput() {
  pet.ultimoInput = agoraMs();
}

/* ── o que vem do processo principal ──────────────────────────────── */

window.icozinho.aoMudarChao((trechos) => {
  definirChao(trechos, window.innerHeight);
  if (!pet.posicionado) {
    // Nasce no meio do primeiro monitor, caindo do alto.
    const primeiro = trechos[0];
    pet.x = primeiro ? (primeiro.inicio + primeiro.fim) / 2 : window.innerWidth / 2;
    pet.y = window.innerHeight - RAIO;
    pet.posicionado = true;
    pular(0);
  } else if (emRepouso()) {
    pular(0); // a pista mudou: assenta de novo no chão
  }
});

window.icozinho.aoMoverCursor((p) => {
  const anterior = pet.cursor;
  pet.cursor = { x: p.x, y: yDaCena(p.y) };
  if (anterior && Math.hypot(p.x - anterior.x, pet.cursor.y - anterior.y) > 3) {
    registrarInput();
    const perto = Math.hypot(pet.cursor.x - pet.x, pet.cursor.y - pet.y) < PERTO_ACORDA;
    if (pet.modo === 'dormindo' && perto) acordar();
  }
});

let visivel = true;
window.icozinho.aoMudarVisivel((sim) => {
  visivel = sim;
  if (sim) requestAnimationFrame(quadro);
});

/* ── gestos do mouse ──────────────────────────────────────────────── */

ligarMouse(pet, RAIO, {
  cutucar(agora) {
    registrarInput();
    if (pet.modo === 'dormindo') return acordar();
    pet.giroVel += 9;
    pet.desdobraExtra = Math.max(pet.desdobraExtra, 0.8);
    pular(260, (Math.random() - 0.5) * 90);
    pet.cutucadas = [...pet.cutucadas.filter((t) => agora - t < 2500), agora];
    if (pet.cutucadas.length >= 3) {
      pet.cutucadas = [];
      ficarTonto(agora);
    }
  },
  comecarArrasto() {
    registrarInput();
    if (pet.modo === 'dormindo') sono(false);
    pet.modo = 'arrastado';
    pet.desdobraExtra = Math.max(pet.desdobraExtra, 0.5);
  },
  arrastar(x, y) {
    const { inicio, fim } = limites();
    pet.x = Math.min(Math.max(x, inicio + RAIO), fim - RAIO);
    pet.y = Math.min(Math.max(y, chaoEm(pet.x) + RAIO), window.innerHeight - RAIO);
  },
  soltar(vx, vy) {
    pular(vy, vx);
    pet.giroVel += Math.hypot(vx, vy) / 120;
  },
  carinho(agora) {
    registrarInput();
    if (pet.modo === 'dormindo') return;
    pet.felizAte = agora + 1500;
    if (emRepouso()) descansar(3000); // para para receber o carinho
  },
});

function ficarTonto(agora) {
  pet.tontoAte = agora + 2600;
  estrelas(xDaTela(), yDaTela() - RAIO - 6);
}

/* ── o Claude Code trabalhando ────────────────────────────────────── */

const atualizarAgente = ligarAgente({
  reagir(tipo) {
    const agora = agoraMs();
    registrarInput(); // com o Claude ativo, ele não dorme
    if (pet.modo === 'dormindo' && tipo !== 'ocioso') acordar();
    switch (tipo) {
      case 'pensando':
      case 'trabalhando':
        pet.agente = tipo;
        if (emRepouso()) descansar(20_000); // fica de olho, em vez de passear
        pet.giroVel = Math.max(pet.giroVel, tipo === 'trabalhando' ? 3 : 1.5);
        break;
      case 'precisa':
        if (pet.agente !== 'precisa' && emRepouso()) pular(260);
        pet.agente = 'precisa';
        pet.proximoChamado = agora + 2500;
        break;
      case 'terminou':
        pet.agente = null;
        pet.felizAte = agora + 1500; // pulinho feliz com corações
        if (pet.modo !== 'arrastado') pular(320);
        break;
      case 'erro':
        pet.agente = null;
        ficarTonto(agora);
        break;
      default:
        pet.agente = null;
    }
  },
});

// Permissão ou pergunta chegando: ele para onde está e chama você.
ligarCartao(() => {
  registrarInput();
  if (pet.modo === 'dormindo') acordar();
  if (pet.modo === 'passeando') descansar(5000);
  pet.agente = 'precisa';
});

/* ── um quadro ────────────────────────────────────────────────────── */

const relogio = new THREE.Clock();
let ultimoQuadro = 0;
let quiquesNaQueda = 0;

function atualizar(dt, t, agora) {
  const chao = chaoEm(pet.x) + RAIO;
  const tonto = agora < pet.tontoAte;
  const feliz = agora < pet.felizAte;

  // Curiosidade: mouse por perto, ele para e olha para ele.
  let olharX = 0, olharY = 0;
  if (pet.cursor && pet.modo !== 'dormindo' && !tonto) {
    const dx = pet.cursor.x - pet.x;
    const dy = pet.cursor.y - pet.y;
    if (Math.abs(dx) < PERTO_CURIOSO && dy < PERTO_CURIOSO + 120) {
      olharY = Math.max(-0.6, Math.min(0.6, dx / 300));
      olharX = Math.max(-0.4, Math.min(0.4, -dy / 300));
      if (pet.modo === 'passeando') descansar(2500);
      else if (pet.modo === 'parado') pet.pausaAte = Math.max(pet.pausaAte, agora + 1500);
    }
  }
  pet.olharX += (olharX - pet.olharX) * Math.min(1, dt * 4);
  pet.olharY += (olharY - pet.olharY) * Math.min(1, dt * 4);

  switch (pet.modo) {
    case 'passeando': {
      if (pet.alvoX === null) escolherAlvo();
      const dx = pet.alvoX - pet.x;
      const passo = Math.sign(dx) * Math.min(Math.abs(dx), VELOCIDADE * dt);
      pet.x += passo;
      pet.rolagem -= passo / RAIO; // rola de verdade, sem deslizar
      const novoChao = chaoEm(pet.x) + RAIO;
      if (novoChao < pet.y - 2) pular(0);              // o monitor ao lado é mais baixo: cai
      else pet.y += (novoChao - pet.y) * Math.min(1, dt * 10);
      if (Math.abs(dx) < 1) descansar(4000 + Math.random() * 6000);
      break;
    }
    case 'parado':
      pet.y += (chao - pet.y) * Math.min(1, dt * 10);
      if (agora > pet.pausaAte) escolherAlvo();
      break;
    case 'caindo': {
      pet.vy -= GRAVIDADE * dt;
      pet.x += pet.vx * dt;
      pet.y += pet.vy * dt;
      pet.vx *= Math.exp(-0.8 * dt);
      pet.rolagem -= (pet.vx * dt) / RAIO;
      const { inicio, fim } = limites();
      if (pet.x < inicio + RAIO || pet.x > fim - RAIO) {
        pet.x = Math.min(Math.max(pet.x, inicio + RAIO), fim - RAIO);
        pet.vx = -pet.vx * 0.5; // bate na borda e volta
      }
      const chaoAqui = chaoEm(pet.x) + RAIO;
      if (pet.y <= chaoAqui) {
        pet.y = chaoAqui;
        const impacto = -pet.vy;
        if (impacto > 900) ficarTonto(agora);
        if (impacto > 140 && quiquesNaQueda < 3) {
          pet.vy = impacto * 0.42; // quica como bolinha de gude
          quiquesNaQueda += 1;
        } else {
          quiquesNaQueda = 0;
          pet.vy = 0;
          pet.vx = 0;
          descansar(1500 + Math.random() * 2000);
        }
      }
      break;
    }
    case 'dormindo':
      pet.y += (chao - 5 - pet.y) * Math.min(1, dt * 2); // afunda um pouco
      break;
    default:
      break;
  }

  // Tédio: pulinhos, depois sono.
  const parado = (agora - pet.ultimoInput) / 1000;
  if (emRepouso()) {
    if (parado > TEDIO_SONO_S) dormir();
    else if (parado > TEDIO_TIQUE_S && agora > pet.proximoTique) {
      pet.proximoTique = agora + 8000 + Math.random() * 7000;
      pular(200);
    }
  }

  // Claude ativo: ele fica parado olhando; precisando de você, pula de tempos
  // em tempos para chamar atenção. Com o cartão aberto, não pula (você está
  // tentando clicar nele) e só volta a passear depois que você decidir.
  if (temPedido()) pet.agente = 'precisa';
  if (pet.agente && pet.modo === 'parado') pet.pausaAte = Math.max(pet.pausaAte, agora + 1000);
  if (pet.agente === 'trabalhando') pet.giroVel = Math.max(pet.giroVel, 2.2);
  if (pet.agente === 'precisa' && !temPedido() && emRepouso() && agora > pet.proximoChamado) {
    pet.proximoChamado = agora + 2500;
    pular(180);
  }

  // Carinho: corações e um giro contente.
  if (feliz && agora > pet.proximoCoracao) {
    pet.proximoCoracao = agora + 350;
    coracao(xDaTela(), yDaTela() - RAIO);
    pet.giroVel = Math.max(pet.giroVel, 2.5);
  }

  pet.giro += pet.giroVel * dt;
  pet.giroVel *= Math.exp(-2.2 * dt);
  pet.desdobraExtra *= Math.exp(-2.4 * dt);

  // ── a gema ──
  const dormindo = pet.modo === 'dormindo';
  const cambaleio = tonto ? Math.sin(t * 9) * 0.3 * ((pet.tontoAte - agora) / 2600) : 0;
  gema.grupo.position.set(pet.x, pet.y, 0);
  gema.corpo.rotation.set(
    0.3 + pet.olharX,
    pet.giro + pet.olharY + (dormindo ? 0 : t * 0.25),
    pet.rolagem + cambaleio
  );
  const respira = dormindo ? 1 + Math.sin(t * 1.3) * 0.015 : 1;
  gema.grupo.scale.setScalar((RAIO / 1.5) * respira);
  gema.atualizar(t, {
    desdobra: (dormindo ? 0.015 : 0.04 + Math.sin(t * 0.7) * 0.02) + pet.desdobraExtra,
    energia: dormindo
      ? 0.55 + Math.sin(t * 1.2) * 0.08
      : feliz
        ? 1.35
        : pet.agente === 'precisa'
          ? 1.25 + Math.sin(t * 5) * 0.2 // pisca chamando
          : pet.agente
            ? 1.15
            : 1,
  });
  sono(dormindo, xDaTela(), yDaTela() - RAIO);
  atualizarAgente(agora);
  seguirGema(xDaTela(), yDaTela() - RAIO);
  seguirGemaComCartao(xDaTela(), yDaTela() - RAIO);
}

function quadro() {
  if (!visivel) return; // escondido pela bandeja: nem desenha
  requestAnimationFrame(quadro);

  // Leveza: 15 quadros por segundo dormindo, 30 passeando, 60 só quando
  // está no ar, sendo arrastado, tonto ou recebendo carinho.
  const agora = agoraMs();
  const agitado = pet.modo === 'caindo' || pet.modo === 'arrastado' || agora < pet.felizAte || agora < pet.tontoAte;
  const fps = pet.modo === 'dormindo' ? 15 : agitado ? 60 : 30;
  if (agora - ultimoQuadro < 1000 / fps - 2) return;
  ultimoQuadro = agora;

  const dt = Math.min(relogio.getDelta(), 0.1);
  atualizar(dt, relogio.elapsedTime, agora);
  renderer.render(scene, camera);
}

requestAnimationFrame(quadro);
