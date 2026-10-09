#!/usr/bin/env node
// O RETRANSMISSOR — o programinha que o Claude Code chama a cada evento
// (hook). Lê o JSON do evento na entrada, enxuga, e entrega ao Icozinho por
// um canal local (named pipe no Windows, socket no resto). Só isso.
//
// Regra de ouro: NUNCA travar o Claude Code. Se o Icozinho estiver fechado ou
// demorar, sai em silêncio (código 0, sem escrever nada) e o Claude Code
// segue como se ele nem existisse.
//
// Roda solto, fora do Electron: só módulos do próprio Node, sem dependências.
'use strict';

const net = require('net');
const os = require('os');
const path = require('path');

/** Para conectar no Icozinho. Passou disso, o Claude Code ganha. */
const TEMPO_CONEXAO_MS = 300;
/** O evento inteiro, do começo ao fim, quando ninguém espera resposta. */
const TEMPO_TOTAL_MS = 2000;
/**
 * Quanto um pedido fica esperando no Icozinho antes de o terminal assumir.
 * Ficam abaixo dos timeouts gravados no settings.json (120 s e 135 s).
 */
const ESPERA_PERMISSAO_MS = 110_000;
const ESPERA_PERGUNTA_MS = 125_000;
/** Campos que nunca aparecem no Icozinho e podem ser enormes. */
const CAMPOS_DESCARTADOS = ['tool_response', 'transcript_path'];
/** Maior texto repassado por campo; o balão mostra bem menos que isso. */
const TEXTO_MAXIMO = 2000;

function enderecoDoCanal() {
  const usuario = (os.userInfo().username || 'eu').replace(/[^A-Za-z0-9_-]/g, '_');
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\icozinho-${usuario}`
    : path.join(os.tmpdir(), `icozinho-${usuario}.sock`);
}

/** Corta textos longos e joga fora o que não interessa, em qualquer nível. */
function enxugar(valor, profundidade = 0) {
  if (typeof valor === 'string') return valor.length > TEXTO_MAXIMO ? valor.slice(0, TEXTO_MAXIMO) + '…' : valor;
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => enxugar(v, profundidade + 1));
  if (valor && typeof valor === 'object' && profundidade < 6) {
    const saida = {};
    for (const [chave, v] of Object.entries(valor)) {
      if (!CAMPOS_DESCARTADOS.includes(chave)) saida[chave] = enxugar(v, profundidade + 1);
    }
    return saida;
  }
  return valor;
}

function lerEntrada() {
  return new Promise((resolve) => {
    let texto = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (pedaco) => (texto += pedaco));
    process.stdin.on('end', () => resolve(texto));
    process.stdin.on('error', () => resolve(''));
  });
}

/** Manda uma linha de JSON e encerra. Erro ou demora: desiste calado. */
function enviar(mensagem) {
  return new Promise((resolve) => {
    const canal = net.connect(enderecoDoCanal());
    const desistir = setTimeout(() => {
      canal.destroy();
      resolve();
    }, TEMPO_CONEXAO_MS);
    canal.on('connect', () => {
      clearTimeout(desistir);
      canal.end(JSON.stringify(mensagem) + '\n', resolve);
    });
    canal.on('error', () => {
      clearTimeout(desistir);
      resolve();
    });
  });
}

/**
 * Manda o pedido e espera a decisão (uma linha de JSON de volta).
 * Desiste em silêncio se não conectar, se fecharem o canal ou se o tempo
 * acabar: aí resolve `null` e o terminal pergunta do jeito de sempre.
 */
function pedirDecisao(mensagem, esperaMs) {
  return new Promise((resolve) => {
    const canal = net.connect(enderecoDoCanal());
    let texto = '';
    let conectou = false;
    const terminar = (valor) => {
      clearTimeout(semConexao);
      clearTimeout(semResposta);
      canal.destroy();
      resolve(valor);
    };
    const semConexao = setTimeout(() => !conectou && terminar(null), TEMPO_CONEXAO_MS);
    const semResposta = setTimeout(() => terminar(null), esperaMs);
    canal.setEncoding('utf8');
    canal.on('connect', () => {
      conectou = true;
      canal.write(JSON.stringify(mensagem) + '\n');
    });
    canal.on('data', (pedaco) => {
      texto += pedaco;
      const fim = texto.indexOf('\n');
      if (fim < 0) return;
      try {
        terminar(JSON.parse(texto.slice(0, fim)));
      } catch {
        terminar(null);
      }
    });
    canal.on('error', () => terminar(null));
    canal.on('close', () => terminar(null));
  });
}

/**
 * As respostas só valem se baterem com as perguntas: cada pergunta
 * respondida, com rótulos que existem, e lista só onde a pergunta é de
 * múltipla escolha. Qualquer coisa fora disso: o terminal pergunta.
 */
function respostasValidas(perguntas, respostas) {
  if (!Array.isArray(perguntas) || !respostas || typeof respostas !== 'object') return false;
  if (perguntas.length === 0 || perguntas.length !== Object.keys(respostas).length) return false;
  return perguntas.every((p) => {
    const rotulos = (p.options || []).map((o) => o.label);
    const escolha = respostas[p.question];
    if (p.multiSelect) {
      return (
        Array.isArray(escolha) &&
        escolha.length > 0 &&
        new Set(escolha).size === escolha.length &&
        escolha.every((e) => rotulos.includes(e))
      );
    }
    return typeof escolha === 'string' && rotulos.includes(escolha);
  });
}

/** O JSON que o Claude Code espera na saída, ou null para não decidir nada. */
function saidaDaDecisao(tipo, decisao, evento) {
  if (!decisao || typeof decisao !== 'object') return null;
  if (tipo === 'permissao') {
    if (decisao.decisao === 'permitir') {
      return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
    }
    if (decisao.decisao === 'negar') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'deny', message: 'Negado pelo Icozinho' },
        },
      };
    }
    return null;
  }
  if (tipo === 'pergunta' && decisao.decisao === 'responder') {
    const entrada = evento.tool_input || {};
    if (!respostasValidas(entrada.questions, decisao.respostas)) return null;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { ...entrada, answers: decisao.respostas },
      },
    };
  }
  return null;
}

async function principal() {
  const modoPergunta = process.argv.includes('--pergunta');

  let evento;
  try {
    evento = JSON.parse(await lerEntrada());
  } catch {
    return; // entrada estranha: não é com a gente
  }
  if (!evento || typeof evento !== 'object' || !evento.hook_event_name) return;

  // Só dois casos esperam por você: um pedido de permissão e uma pergunta de
  // múltipla escolha (AskUserQuestion). O resto é só aviso, e não espera.
  const ehPergunta = evento.tool_name === 'AskUserQuestion';
  const tipo =
    evento.hook_event_name === 'PermissionRequest' && !ehPergunta
      ? 'permissao'
      : modoPergunta && evento.hook_event_name === 'PreToolUse' && ehPergunta
        ? 'pergunta'
        : null;

  const mensagem = {
    ...enxugar(evento),
    // de onde veio: a sessão da aba Code do app Claude ou um terminal
    icozinho_origem: process.env.CLAUDE_CODE_ENTRYPOINT || 'terminal',
  };

  if (!tipo) {
    if (modoPergunta) return; // o gancho geral já avisou este evento
    setTimeout(() => process.exit(0), TEMPO_TOTAL_MS).unref();
    await enviar(mensagem);
    return;
  }

  const espera = tipo === 'permissao' ? ESPERA_PERMISSAO_MS : ESPERA_PERGUNTA_MS;
  setTimeout(() => process.exit(0), espera + TEMPO_TOTAL_MS).unref();
  if (tipo === 'pergunta') mensagem.tool_input = evento.tool_input; // as perguntas inteiras
  const decisao = await pedirDecisao({ ...mensagem, icozinho_espera: tipo }, espera);
  const saida = saidaDaDecisao(tipo, decisao, evento);
  if (saida) process.stdout.write(JSON.stringify(saida));
}

if (require.main === module) {
  // Sai só depois de a saída ser entregue por inteiro ao Claude Code.
  principal().finally(() => process.stdout.write('', () => process.exit(0)));
}

module.exports = { respostasValidas, saidaDaDecisao };
