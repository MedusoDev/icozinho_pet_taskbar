// A DOCA — escondida na borda da tela, como a barra de tarefas com "ocultar
// automaticamente".
//
//   escondida  só o fio de luz na borda, na cor do que o Claude está fazendo
//   aba        o mouse encostou na borda: a aba com a gema desliza para fora
//   aberta     o painel: Sessões (com os pedidos), Conversa e Ajustes
//
// Abre com um clique na aba (e aí ganha o teclado), ou sozinha quando chega
// um pedido (sem roubar o seu foco). Recolhe com Esc, no ▴, clicando fora
// depois de usar, ou quando o pedido que a abriu foi resolvido.
import { montarCartao } from './cartao.js';
import { tocar } from './sons.js';
import { cortar, descreverPasso, ERROS } from '../compartilhado/passos.js';

const $ = (id) => document.getElementById(id);
const aba = $('aba');

let estado = { sessoes: [], pedidos: [], ajustes: {} };
let modo = 'escondida';
let abertaPeloPedido = false;
let mouseEmCima = false;
let soltouEm = 0;
let ultimoPronto = 0;
let abaAtual = 'sessoes';
const cartoes = new Map(); // id do pedido -> elemento (sobrevive às atualizações)
const pedidosVistos = new Set();

const ROTULOS = {
  pensando: 'pensando',
  trabalhando: 'trabalhando',
  precisa: 'precisa de você',
  pronto: 'pronto',
  erro: 'erro',
  ocioso: 'parada',
};

/* ── modos ────────────────────────────────────────────────────────── */

function mudarModo(novo, focar = false) {
  if (novo === modo && !focar) return;
  modo = novo;
  document.body.dataset.modo = novo;
  window.ilha.definirModo(novo, focar);
  if (novo !== 'aberta') window.ilha.capturarMouse(false);
}

// Como a barra de tarefas escondida: a aba só sai com o mouse na borda.
const deveMostrarAba = () => mouseEmCima || Date.now() - soltouEm < 1200;

function reavaliar() {
  if (modo !== 'aberta') mudarModo(deveMostrarAba() ? 'aba' : 'escondida');
}

function abrir({ focar = false, aba } = {}) {
  abertaPeloPedido = !focar && modo !== 'aberta';
  mudarModo('aberta', focar);
  if (aba) mostrarAba(aba);
}

function recolher() {
  abertaPeloPedido = false;
  mouseEmCima = false;
  mudarModo('escondida');
}

function mostrarAba(nome) {
  abaAtual = nome;
  for (const b of document.querySelectorAll('[data-aba]')) b.classList.toggle('ativa', b.dataset.aba === nome);
  for (const s of document.querySelectorAll('.aba-conteudo')) s.classList.toggle('ativa', s.id === `aba-${nome}`);
}

/* ── o fio e a aba ────────────────────────────────────────────────── */

/** A cor do fio: o que de mais importante está acontecendo agora. */
function atividade() {
  if (estado.pedidos.length > 0) return 'precisa';
  const s = estado.sessoes[0];
  if (!s) return '';
  if (s.estado === 'precisa') return 'precisa';
  if (s.estado === 'pensando' || s.estado === 'trabalhando') return 'trabalhando';
  if (s.estado === 'erro') return 'erro';
  if (s.estado === 'pronto' && Date.now() - ultimoPronto < 8000) return 'pronto';
  return '';
}

function marcarAtividade() {
  const atual = atividade();
  for (const c of ['precisa', 'trabalhando', 'pronto', 'erro']) {
    document.body.classList.toggle(`atividade-${c}`, c === atual);
  }
}

function textoDaAba() {
  const ponto = $('aba-ponto');
  $('aba-contador').textContent = estado.pedidos.length > 0 ? String(estado.pedidos.length) : '';

  if (estado.pedidos.length > 0) {
    const ev = estado.pedidos[0].evento;
    ponto.className = 'ponto precisa';
    const projeto = String(ev.cwd || '').split(/[\\/]/).pop();
    return `${projeto} precisa de você`;
  }
  const s = estado.sessoes[0];
  if (!s) {
    ponto.className = 'ponto';
    return 'Icozinho';
  }
  ponto.className = `ponto ${s.estado}`;
  if (s.estado === 'trabalhando') return `${s.projeto} · ${descreverPasso(s.ferramenta, s.entrada || {})}`;
  if (s.estado === 'pensando') return `${s.projeto} · Pensando…`;
  if (s.estado === 'pronto') return `${s.projeto} · Pronto ✓`;
  if (s.estado === 'erro') return `${s.projeto} · ${ERROS[s.texto] || 'Algo deu errado'}`;
  return `${s.projeto} · ${ROTULOS[s.estado] || ''}`;
}

/* ── sessões e pedidos ────────────────────────────────────────────── */

function quando(ms) {
  const seg = Math.round((Date.now() - ms) / 1000);
  if (seg < 45) return 'agora';
  const min = Math.round(seg / 60);
  return min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
}

function linhaDaSessao(s) {
  if (s.estado === 'trabalhando' || s.estado === 'precisa') {
    return s.ferramenta ? descreverPasso(s.ferramenta, s.entrada || {}) : cortar(s.texto, 80);
  }
  if (s.estado === 'erro') return ERROS[s.texto] || 'Algo deu errado';
  return cortar(s.texto, 90) || ROTULOS[s.estado];
}

function desenharSessoes() {
  const lista = $('lista-sessoes');
  lista.replaceChildren();
  if (estado.sessoes.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'vazio';
    vazio.textContent = estado.ajustes.claude
      ? 'Nenhuma sessão do Claude Code agora.'
      : 'Ligue o Icozinho ao Claude Code para ver as sessões aqui.';
    if (!estado.ajustes.claude) {
      const b = document.createElement('button');
      b.className = 'botao primario';
      b.type = 'button';
      b.textContent = 'Ligar ao Claude Code…';
      b.addEventListener('click', () => window.ilha.ligarClaude());
      vazio.append(document.createElement('br'), b);
    }
    lista.append(vazio);
    return;
  }
  for (const s of estado.sessoes) {
    const item = document.createElement('div');
    item.className = 'sessao';
    const ponto = document.createElement('span');
    ponto.className = `ponto ${s.estado}`;
    const nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = s.projeto;
    const origem = document.createElement('span');
    origem.className = 'origem';
    origem.textContent = s.origem;
    nome.append(origem);
    const quandoEl = document.createElement('span');
    quandoEl.className = 'quando';
    quandoEl.textContent = `${ROTULOS[s.estado]} · ${quando(s.atualizado)}`;
    const passo = document.createElement('span');
    passo.className = 'passo';
    passo.textContent = linhaDaSessao(s);
    item.append(ponto, nome, quandoEl, passo);
    lista.append(item);
  }
}

function desenharPedidos() {
  // Os da conversa aparecem na aba Conversa; aqui ficam os das sessões.
  const area = $('pedidos');
  const dasSessoes = estado.pedidos.filter((p) => !p.conversa);
  const ids = new Set(dasSessoes.map((p) => p.id));
  for (const [id, el] of cartoes) {
    if (!ids.has(id)) {
      el.remove();
      cartoes.delete(id);
    }
  }
  for (const pedido of dasSessoes) {
    if (cartoes.has(pedido.id)) continue;
    const cartao = montarCartao(pedido, (decisao, respostas, livres) =>
      window.ilha.decidir(pedido.id, decisao, respostas, livres)
    );
    cartoes.set(pedido.id, cartao);
    area.append(cartao);
  }
}

/* ── ajustes ──────────────────────────────────────────────────────── */

function desenharAjustes() {
  const a = estado.ajustes;
  for (const input of document.querySelectorAll('[data-ajuste]')) input.checked = Boolean(a[input.dataset.ajuste]);
  $('botao-som').classList.toggle('desligado', !a.som);
  // 📌: solto ele passeia na barra; preso, fica só aqui na doca
  const prender = $('botao-prender');
  prender.title = a.petNaBarra ? 'Prender o Icozinho na doca' : 'Soltar o Icozinho na barra de tarefas';
  prender.classList.toggle('desligado', a.petNaBarra);
  for (const b of document.querySelectorAll('.lados [data-lado]')) b.classList.toggle('ativo', b.dataset.lado === a.ladoDaDoca);

  const textos = { atual: 'Ligado ✓', desatualizado: 'Ligado por uma versão anterior' };
  $('claude-estado').textContent = textos[a.claude] || 'Desligado';
  const botoes = $('claude-botoes');
  botoes.replaceChildren();
  const novoBotao = (texto, classe, acao) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `botao ${classe}`;
    b.textContent = texto;
    b.addEventListener('click', acao);
    botoes.append(b);
  };
  if (!a.claude) novoBotao('Ligar…', 'primario', () => window.ilha.ligarClaude());
  if (a.claude === 'desatualizado') novoBotao('Atualizar…', 'primario', () => window.ilha.ligarClaude());
  if (a.claude) novoBotao('Desligar', 'discreto', () => window.ilha.desligarClaude());
}

/* ── estado vindo do processo principal ───────────────────────────── */

window.ilha.aoEstado((novo) => {
  estado = novo;
  // Pedido novo: som, e a ilha abre sozinha na aba de sessões.
  const novos = novo.pedidos.filter((p) => !pedidosVistos.has(p.id));
  for (const p of novos) pedidosVistos.add(p.id);
  if (novos.length > 0) {
    if (novo.ajustes.som) tocar('pedido');
    // a aba de onde o pedido veio: a da conversa ou a das sessões
    const aba = novos.some((p) => !p.conversa) ? 'sessoes' : 'conversa';
    if (modo !== 'aberta') abrir({ aba });
    else if (abaAtual !== aba) mostrarAba(aba);
  }
  // O pedido que abriu a ilha foi resolvido: ela volta a ser pílula.
  if (novo.pedidos.length === 0 && abertaPeloPedido) recolher();

  const texto = textoDaAba();
  $('aba-texto').textContent = texto;
  aba.title = texto; // nas laterais a aba é estreita: o status completo vai na dica
  marcarAtividade();
  desenharPedidos();
  desenharSessoes();
  desenharAjustes();
  reavaliar();
});

window.ilha.aoEvento((ev) => {
  if (ev.hook_event_name === 'Stop') {
    ultimoPronto = Date.now();
    if (estado.ajustes.som) tocar('pronto');
    marcarAtividade();
    setTimeout(marcarAtividade, 8100); // o fio verde do "Pronto" apaga depois
  } else if (ev.hook_event_name === 'StopFailure' && estado.ajustes.som) {
    tocar('erro');
  }
});

window.ilha.aoPedirAbrir(({ focar } = {}) => abrir({ focar, aba: estado.pedidos.length ? 'sessoes' : undefined }));
window.ilha.aoPerderFoco(() => {
  if (estado.pedidos.length === 0) recolher();
});

/* ── mouse e teclado ──────────────────────────────────────────────── */

// Escondida, a janela é só o fio: qualquer movimento nela é o mouse
// encostando na borda. Com a aba de fora, conta só em cima da aba. Nos dois
// casos o clique atravessa o resto.
window.addEventListener('mousemove', (e) => {
  if (modo === 'aberta') return;
  let dentro = true;
  if (modo === 'aba') {
    const r = aba.getBoundingClientRect();
    dentro = e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 6;
  }
  if (dentro !== mouseEmCima) {
    mouseEmCima = dentro;
    if (!dentro) soltouEm = Date.now();
    window.ilha.capturarMouse(dentro);
    reavaliar();
    if (!dentro) setTimeout(reavaliar, 1300);
  }
});
document.addEventListener('mouseleave', () => {
  if (modo === 'aberta' || !mouseEmCima) return;
  mouseEmCima = false;
  soltouEm = Date.now();
  window.ilha.capturarMouse(false);
  setTimeout(reavaliar, 1300);
});

aba.addEventListener('click', () => abrir({ focar: true, aba: estado.pedidos.length ? 'sessoes' : abaAtual }));
$('botao-prender').addEventListener('click', () => window.ilha.ajustar('petNaBarra', !estado.ajustes.petNaBarra));
for (const b of document.querySelectorAll('.lados [data-lado]')) {
  b.addEventListener('click', () => window.ilha.ajustar('ladoDaDoca', b.dataset.lado));
}
window.ilha.aoLado((lado) => {
  document.body.dataset.lado = lado;
});
$('botao-recolher').addEventListener('click', recolher);
$('botao-som').addEventListener('click', () => window.ilha.ajustar('som', !estado.ajustes.som));
for (const b of document.querySelectorAll('[data-aba]')) b.addEventListener('click', () => mostrarAba(b.dataset.aba));
for (const input of document.querySelectorAll('[data-ajuste]')) {
  input.addEventListener('change', () => window.ilha.ajustar(input.dataset.ajuste, input.checked));
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modo === 'aberta') recolher();
});

// "há 3 min" envelhece sozinho
setInterval(() => modo === 'aberta' && desenharSessoes(), 30_000);
