// O CANAL — por onde o retransmissor (src/gancho) entrega os eventos do
// Claude Code. Um named pipe no Windows (um socket no resto), aberto só para
// o usuário atual, que aceita uma linha de JSON por conexão.
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');

/** Maior mensagem aceita; o retransmissor já manda bem menos que isso. */
const TAMANHO_MAXIMO = 1024 * 1024;

/** O mesmo endereço que o retransmissor calcula (manter os dois iguais). */
function enderecoDoCanal() {
  const usuario = (os.userInfo().username || 'eu').replace(/[^A-Za-z0-9_-]/g, '_');
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\icozinho-${usuario}`
    : path.join(os.tmpdir(), `icozinho-${usuario}.sock`);
}

/**
 * Abre o canal. Cada evento chega em `aoReceber(evento, conexao)`; a conexão
 * vem junto para quem precisar responder nela (aprovações, na 0.3.0).
 * Devolve uma função que fecha o canal.
 */
function abrirCanal(aoReceber) {
  const endereco = enderecoDoCanal();
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(endereco); // socket velho de uma execução que caiu
    } catch {}
  }

  const servidor = net.createServer((conexao) => {
    let texto = '';
    conexao.setEncoding('utf8');
    conexao.on('data', (pedaco) => {
      texto += pedaco;
      if (texto.length > TAMANHO_MAXIMO) return conexao.destroy();
      const fim = texto.indexOf('\n');
      if (fim < 0) return;
      const linha = texto.slice(0, fim);
      texto = '';
      try {
        aoReceber(JSON.parse(linha), conexao);
      } catch {
        conexao.destroy();
      }
    });
    conexao.on('error', () => {});
  });

  servidor.on('error', (erro) => {
    // Outro Icozinho já tem o canal (não deveria: a instância é única).
    console.error('[icozinho] canal indisponível:', erro.message);
  });
  servidor.listen(endereco);
  return () => servidor.close();
}

module.exports = { abrirCanal };
