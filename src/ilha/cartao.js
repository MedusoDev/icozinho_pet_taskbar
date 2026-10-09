// O CARTÃO — quando o Claude Code precisa de você, um cartão no painel:
//   permissão   o que ele quer fazer, com Permitir, Negar e No terminal
//   pergunta    as perguntas de múltipla escolha, uma por vez, com as opções
//               como botões (marcar várias quando a pergunta permite) e
//               "Outro…" para responder escrevendo
import { descreverPasso, nomeDoArquivo } from '../compartilhado/passos.js';

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

function montarPermissao(cartao, pedido, decidir) {
  const { evento } = pedido;
  // Comando: o título só diz o que é, e o comando inteiro vai na caixa.
  const ehComando = evento.tool_name === 'Bash' || evento.tool_name === 'PowerShell';
  // Da conversa: quem pede é o próprio Icozinho, e não há terminal para
  // onde devolver a pergunta.
  const quem = pedido.conversa ? 'Icozinho' : nomeDoArquivo(evento.cwd);
  cartao.append(
    el('span', 'projeto', `${quem} · quer permissão`),
    el('strong', 'titulo', ehComando ? 'Rodar um comando' : descreverPasso(evento.tool_name, evento.tool_input))
  );
  const detalhe = detalheDaPermissao(evento);
  if (detalhe) cartao.append(el('code', 'detalhe', String(detalhe).slice(0, 600)));
  const acoes = el('div', 'acoes');
  acoes.append(
    botao('Permitir', 'primario', () => decidir('permitir')),
    botao('Negar', 'perigo', () => decidir('negar'))
  );
  if (!pedido.conversa) acoes.append(botao('No terminal', 'discreto', () => decidir('terminal')));
  cartao.append(acoes);
}

function montarPergunta(cartao, pedido, decidir) {
  const perguntas = (pedido.evento.tool_input && pedido.evento.tool_input.questions) || [];
  if (perguntas.length === 0) return decidir('terminal');
  const respostas = {};
  const livres = [];
  let atual = 0;

  function mostrarPergunta() {
    cartao.replaceChildren();
    const p = perguntas[atual];
    const contador = perguntas.length > 1 ? ` · ${atual + 1}/${perguntas.length}` : '';
    cartao.append(
      el('span', 'projeto', `${nomeDoArquivo(pedido.evento.cwd)} · ${p.header || 'pergunta'}${contador}`),
      el('strong', 'titulo', p.question)
    );

    const avancar = () => {
      atual += 1;
      if (atual < perguntas.length) mostrarPergunta();
      else decidir('responder', respostas, livres);
    };

    const marcadas = new Set();
    const opcoes = el('div', 'opcoes');
    const enviar = botao(atual + 1 < perguntas.length ? 'Próxima' : 'Enviar', 'primario', () => {
      // na ordem em que as opções aparecem, não na ordem dos cliques
      respostas[p.question] = (p.options || []).map((o) => o.label).filter((l) => marcadas.has(l));
      avancar();
    });
    enviar.disabled = true;

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

    // "Outro…": abre um campo para responder escrevendo
    const outro = botao('Outro…', 'opcao discreta', () => {
      outro.remove();
      const campo = el('input', 'campo');
      campo.placeholder = 'Escreva a sua resposta';
      campo.maxLength = 1000;
      const ok = botao('OK', 'primario', () => {
        if (!campo.value.trim()) return campo.focus();
        respostas[p.question] = campo.value.trim();
        livres.push(p.question);
        avancar();
      });
      campo.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
      const linha = el('div', 'linha-outro');
      linha.append(campo, ok);
      opcoes.after(linha);
      campo.focus();
    });
    opcoes.append(outro);
    cartao.append(opcoes);

    const acoes = el('div', 'acoes');
    if (p.multiSelect) acoes.append(enviar);
    acoes.append(botao('No terminal', 'discreto', () => decidir('terminal')));
    cartao.append(acoes);
  }

  mostrarPergunta();
}

/**
 * Monta o cartão de um pedido.
 * @param {(decisao: string, respostas?: object, livres?: string[]) => void} decidir
 */
export function montarCartao(pedido, decidir) {
  const cartao = el('div', 'cartao');
  if (pedido.tipo === 'permissao') montarPermissao(cartao, pedido, decidir);
  else montarPergunta(cartao, pedido, decidir);
  return cartao;
}
