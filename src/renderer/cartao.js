// O CARTÃO — quando o Claude Code precisa de você, em vez do balão aparece
// um cartão clicável em cima da gema:
//   permissão   o que ele quer fazer, com Permitir, Negar e No terminal
//   pergunta    as perguntas de múltipla escolha, uma por vez, com as opções
//               como botões (marcar várias quando a pergunta permite)
// Pedidos de sessões diferentes entram numa fila e aparecem um de cada vez.
import { descreverPasso } from './agente.js';

const cartao = document.getElementById('cartao');
const fila = [];

const nomeDoProjeto = (cwd) => String(cwd || '').split(/[\\/]/).pop();

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(texto, classe, aoClicar) {
  const b = el('button', `botao ${classe}`, texto);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    aoClicar();
  });
  return b;
}

/** O detalhe que ajuda a decidir: o comando, o arquivo, o endereço. */
function detalheDaPermissao(evento) {
  const entrada = evento.tool_input || {};
  return entrada.command || entrada.file_path || entrada.url || entrada.pattern || entrada.description || '';
}

function decidir(pedido, decisao, respostas) {
  window.icozinho.decidir(pedido.id, decisao, respostas);
  removerDaFila(pedido.id);
}

function montarPermissao(pedido) {
  const { evento } = pedido;
  // Comando: o título só diz o que é, e o comando inteiro vai na caixa.
  const ehComando = evento.tool_name === 'Bash' || evento.tool_name === 'PowerShell';
  cartao.append(
    el('span', 'projeto', `${nomeDoProjeto(evento.cwd)} · quer permissão`),
    el('strong', 'titulo', ehComando ? 'Rodar um comando' : descreverPasso(evento.tool_name, evento.tool_input))
  );
  const detalhe = detalheDaPermissao(evento);
  if (detalhe) cartao.append(el('code', 'detalhe', String(detalhe).slice(0, 240)));
  const acoes = el('div', 'acoes');
  acoes.append(
    botao('Permitir', 'primario', () => decidir(pedido, 'permitir')),
    botao('Negar', 'perigo', () => decidir(pedido, 'negar')),
    botao('No terminal', 'discreto', () => decidir(pedido, 'terminal'))
  );
  cartao.append(acoes);
}

function montarPergunta(pedido) {
  const perguntas = (pedido.evento.tool_input && pedido.evento.tool_input.questions) || [];
  if (perguntas.length === 0) return decidir(pedido, 'terminal');
  const respostas = {};
  let atual = 0;

  function mostrarPergunta() {
    cartao.replaceChildren();
    const p = perguntas[atual];
    const contador = perguntas.length > 1 ? ` · ${atual + 1}/${perguntas.length}` : '';
    cartao.append(
      el('span', 'projeto', `${nomeDoProjeto(pedido.evento.cwd)} · ${p.header || 'pergunta'}${contador}`),
      el('strong', 'titulo', p.question)
    );

    const marcadas = new Set();
    const opcoes = el('div', 'opcoes');
    const avancar = () => {
      atual += 1;
      if (atual < perguntas.length) mostrarPergunta();
      else decidir(pedido, 'responder', respostas);
    };
    for (const opcao of p.options || []) {
      const b = botao(opcao.label, 'opcao', () => {
        if (!p.multiSelect) {
          respostas[p.question] = opcao.label;
          return avancar();
        }
        if (marcadas.has(opcao.label)) marcadas.delete(opcao.label);
        else marcadas.add(opcao.label);
        b.classList.toggle('marcada', marcadas.has(opcao.label));
        enviar.disabled = marcadas.size === 0;
      });
      if (opcao.description) b.title = opcao.description;
      opcoes.append(b);
    }
    cartao.append(opcoes);

    const acoes = el('div', 'acoes');
    const enviar = botao(atual + 1 < perguntas.length ? 'Próxima' : 'Enviar', 'primario', () => {
      // na ordem em que as opções aparecem, não na ordem dos cliques
      respostas[p.question] = (p.options || []).map((o) => o.label).filter((l) => marcadas.has(l));
      avancar();
    });
    enviar.disabled = true;
    if (p.multiSelect) acoes.append(enviar);
    acoes.append(botao('No terminal', 'discreto', () => decidir(pedido, 'terminal')));
    cartao.append(acoes);
  }

  mostrarPergunta();
}

function mostrarPrimeiro() {
  cartao.replaceChildren();
  const pedido = fila[0];
  cartao.classList.toggle('visivel', Boolean(pedido));
  document.body.classList.toggle('com-cartao', Boolean(pedido)); // o balão dá lugar ao cartão
  if (!pedido) return;
  if (pedido.tipo === 'permissao') montarPermissao(pedido);
  else montarPergunta(pedido);
}

function removerDaFila(id) {
  const i = fila.findIndex((p) => p.id === id);
  if (i < 0) return;
  fila.splice(i, 1);
  if (i === 0) mostrarPrimeiro();
}

/** @param {() => void} aoChegar chamado a cada pedido novo (o pet reage) */
export function ligarCartao(aoChegar) {
  window.icozinho.aoPedido((pedido) => {
    fila.push(pedido);
    if (fila.length === 1) mostrarPrimeiro();
    aoChegar();
  });
  window.icozinho.aoPedidoEncerrado(removerDaFila);
}

export const temPedido = () => fila.length > 0;

/** Mantém o cartão em cima da gema, sem sair da tela. */
export function seguirGemaComCartao(x, topo) {
  if (!fila.length) return;
  const largura = cartao.offsetWidth;
  const altura = cartao.offsetHeight;
  const esquerda = Math.min(Math.max(x - largura / 2, 8), window.innerWidth - largura - 8);
  const cima = Math.max(topo - altura - 12, 6);
  cartao.style.transform = `translate(${esquerda}px, ${cima}px)`;
}
