// A CONVERSA — a aba de chat da doca. Quem responde é o Claude Code em modo
// de comando, com a sua assinatura (ver src/main/conversa.js). Quando ele
// precisa de permissão para rodar algo, o cartão aparece aqui mesmo, no meio
// da conversa.
import { montarCartao } from './cartao.js';

const lista = document.getElementById('mensagens');
const campo = document.getElementById('campo-conversa');
const botaoEnviar = document.getElementById('enviar-conversa');
const botaoNova = document.getElementById('nova-conversa');

let respondendo = null; // o balão da resposta que está chegando

function balao(quem, texto) {
  const b = document.createElement('div');
  b.className = `mensagem ${quem}`;
  b.textContent = texto;
  lista.append(b);
  lista.scrollTop = lista.scrollHeight;
  return b;
}

function definirRespondendo(sim) {
  botaoEnviar.textContent = sim ? 'Parar' : 'Enviar';
  botaoEnviar.classList.toggle('perigo', sim);
}

function enviar() {
  if (respondendo) {
    window.ilha.pararConversa();
    respondendo.classList.remove('digitando');
    respondendo = null;
    definirRespondendo(false);
    return;
  }
  const texto = campo.value.trim();
  if (!texto) return;
  campo.value = '';
  balao('eu', texto);
  respondendo = balao('icozinho', '');
  respondendo.classList.add('digitando');
  definirRespondendo(true);
  window.ilha.conversar(texto);
}

export function ligarConversa() {
  botaoEnviar.addEventListener('click', enviar);
  campo.addEventListener('keydown', (e) => {
    // Enter envia; Shift+Enter quebra a linha
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  });
  botaoNova.addEventListener('click', () => {
    window.ilha.novaConversa();
    respondendo = null;
    definirRespondendo(false);
    lista.replaceChildren();
    balao('sistema', 'Conversa nova. Pode falar!');
  });

  window.ilha.aoConversa((ev) => {
    if (!respondendo) return; // parou de esperar
    if (ev.tipo === 'pedaco') {
      respondendo.textContent += ev.texto;
      lista.scrollTop = lista.scrollHeight;
    } else {
      if (ev.tipo === 'erro') {
        respondendo.classList.add('erro');
        respondendo.textContent = ev.texto;
      }
      respondendo.classList.remove('digitando');
      respondendo = null;
      definirRespondendo(false);
    }
  });

  balao('sistema', 'Oi! Eu respondo com a sua assinatura do Claude. Pergunta o que quiser.');
}

const cartoes = new Map(); // id do pedido -> cartão no meio das mensagens

/** Mostra os pedidos de permissão da conversa e tira os já resolvidos. */
export function mostrarPedidosDaConversa(pedidos) {
  const ids = new Set(pedidos.map((p) => p.id));
  for (const [id, el] of cartoes) {
    if (!ids.has(id)) {
      el.remove();
      cartoes.delete(id);
    }
  }
  for (const pedido of pedidos) {
    if (cartoes.has(pedido.id)) continue;
    const cartao = montarCartao(pedido, (decisao) => {
      window.ilha.decidir(pedido.id, decisao);
      // fica o registro do que você decidiu, e a resposta continua embaixo
      const comando = (pedido.evento.tool_input && pedido.evento.tool_input.command) || pedido.evento.tool_name;
      balao('sistema', `${decisao === 'permitir' ? '✓ Permitido' : '✕ Negado'}: ${String(comando).slice(0, 80)}`);
      if (respondendo) lista.append(respondendo);
    });
    cartoes.set(pedido.id, cartao);
    lista.append(cartao);
  }
  lista.scrollTop = lista.scrollHeight;
}

/** Quando a aba aparece, o campo já fica pronto para escrever. */
export const focarConversa = () => campo.focus();
