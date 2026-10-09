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

async function principal() {
  // Seguro final: aconteça o que acontecer, sai a tempo.
  setTimeout(() => process.exit(0), TEMPO_TOTAL_MS).unref();

  let evento;
  try {
    evento = JSON.parse(await lerEntrada());
  } catch {
    return; // entrada estranha: não é com a gente
  }
  if (!evento || typeof evento !== 'object' || !evento.hook_event_name) return;

  await enviar({
    ...enxugar(evento),
    // de onde veio: a sessão da aba Code do app Claude ou um terminal
    icozinho_origem: process.env.CLAUDE_CODE_ENTRYPOINT || 'terminal',
  });
}

principal().finally(() => process.exit(0));
