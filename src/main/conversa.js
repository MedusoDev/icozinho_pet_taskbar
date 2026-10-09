// A CONVERSA — o chat da ilha. Usa o próprio Claude Code em modo de comando
// (`claude -p`), com o login da sua assinatura: sem chave de API.
//
// Cada mensagem roda um `claude -p` que continua a sessão anterior
// (`--resume`), e a resposta chega em pedacinhos (stream-json). A conversa
// roda numa pasta só dela, longe dos projetos, e o retransmissor ignora
// essas sessões (ICOZINHO_CONVERSA=1) para o Icozinho não se ver conversando.
const { app } = require('electron');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PERSONALIDADE = `Você é o Icozinho, um icosaedro de estimação que vive na barra de tarefas
do Windows do Gabriel (MedusoDev), dev full stack e mobile. Esta é uma
conversa rápida num painel pequeno: responda em português do Brasil, curto,
direto e com bom humor, como um amigo que entende de programação. Use
Markdown leve (listas e \`código\`) só quando ajudar. Você não tem acesso aos
projetos dele daqui; se ele pedir para mexer em código, sugira abrir uma
sessão do Claude Code no projeto.
`;

let sessaoId = null;
let processo = null;
/** O node e o retransmissor, para o gancho de permissão da conversa. */
let gancho = null;

/** Chamado na abertura, depois de o retransmissor ser copiado. */
function configurar({ node, retransmissor }) {
  gancho = { node, retransmissor };
}

const pastas = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
};

/**
 * Onde o app Claude guarda o Claude Code embutido. Instalado pela Microsoft
 * Store, o app vive num pacote e a pasta dele é "virtualizada": o caminho de
 * verdade fica em %LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming, e
 * só quem roda dentro do app enxerga o AppData\Roaming de sempre.
 */
function pastasDoAppClaude() {
  const bases = [path.join(app.getPath('appData'), 'Claude', 'claude-code')];
  const pacotes = path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'Packages');
  for (const pacote of pastas(pacotes)) {
    if (/^Claude_/i.test(path.basename(pacote))) {
      bases.push(path.join(pacote, 'LocalCache', 'Roaming', 'Claude', 'claude-code'));
    }
  }
  return bases;
}

/**
 * Onde está o `claude`: primeiro o do PATH (Claude Code instalado no
 * terminal); senão, o mais novo que o app Claude traz embutido.
 */
function localizarClaude() {
  try {
    const comando = process.platform === 'win32' ? 'where' : 'which';
    const saida = execFileSync(comando, ['claude'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const achado = saida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const exe = achado.find((l) => /\.exe$/i.test(l)) || achado[0];
    if (exe) return exe;
  } catch {}

  // claude-code\<versão>\<id>\claude.exe — fica com o mais novo
  const candidatos = [];
  for (const base of pastasDoAppClaude()) {
    for (const versao of pastas(base)) {
      for (const sub of pastas(versao)) {
        const exe = path.join(sub, process.platform === 'win32' ? 'claude.exe' : 'claude');
        try {
          candidatos.push({ exe, quando: fs.statSync(exe).mtimeMs });
        } catch {}
      }
    }
  }
  candidatos.sort((a, b) => b.quando - a.quando);
  return candidatos[0] ? candidatos[0].exe : null;
}

/**
 * A pasta da conversa, com a personalidade e um settings.json só dela: um
 * gancho de permissão que manda os pedidos para a doca. No modo de comando
 * o Claude Code não tem onde perguntar; sem esse gancho, tudo que precisa
 * de permissão seria negado calado. Vale só aqui dentro, não no resto do PC.
 */
function pastaDaConversa() {
  const pasta = path.join(app.getPath('userData'), 'conversa');
  fs.mkdirSync(path.join(pasta, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'personalidade.txt'), PERSONALIDADE);
  if (gancho) {
    const configuracao = {
      hooks: {
        PermissionRequest: [
          {
            hooks: [
              { type: 'command', command: gancho.node, args: [gancho.retransmissor, '--conversa'], timeout: 120 },
            ],
          },
        ],
      },
    };
    fs.writeFileSync(path.join(pasta, '.claude', 'settings.json'), `${JSON.stringify(configuracao, null, 2)}\n`);
  }
  return pasta;
}

/**
 * Envia uma mensagem. `aoEvento` recebe:
 *   { tipo: 'pedaco', texto }    um pedaço da resposta
 *   { tipo: 'fim' }              terminou
 *   { tipo: 'erro', texto }      não deu (sem claude, sem login, limite…)
 */
function enviar(texto, aoEvento) {
  cancelar();
  const exe = localizarClaude();
  if (!exe) {
    aoEvento({
      tipo: 'erro',
      texto: 'Não achei o Claude Code neste computador. Instale o app Claude (aba Code) ou o Claude Code no terminal.',
    });
    return;
  }

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--permission-mode', 'default',
    // caminho relativo à pasta da conversa: sem espaços para escapar
    '--append-system-prompt-file', 'personalidade.txt',
  ];
  if (sessaoId) args.push('--resume', sessaoId);

  const ehScript = /\.(cmd|bat)$/i.test(exe); // instalação via npm
  processo = spawn(exe, args, {
    cwd: pastaDaConversa(),
    env: { ...process.env, ICOZINHO_CONVERSA: '1' },
    windowsHide: true,
    shell: ehScript, // a mensagem vai pela entrada, nunca pela linha de comando
  });
  const atual = processo;

  let resto = '';
  let recebeuPedaco = false;
  let terminou = false;
  let erroTexto = '';

  atual.stdout.setEncoding('utf8');
  atual.stdout.on('data', (pedaco) => {
    resto += pedaco;
    let fim;
    while ((fim = resto.indexOf('\n')) >= 0) {
      const linha = resto.slice(0, fim).trim();
      resto = resto.slice(fim + 1);
      if (!linha) continue;
      let ev;
      try {
        ev = JSON.parse(linha);
      } catch {
        continue;
      }
      if (ev.session_id) sessaoId = ev.session_id;
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
        recebeuPedaco = true;
        aoEvento({ tipo: 'pedaco', texto: ev.event.delta.text });
      } else if (ev.type === 'assistant' && !recebeuPedaco) {
        // sem pedacinhos (versão antiga do Claude Code): a resposta inteira
        const textos = (ev.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text);
        if (textos.length) aoEvento({ tipo: 'pedaco', texto: textos.join('') });
      } else if (ev.type === 'result') {
        terminou = true;
        if (ev.is_error) aoEvento({ tipo: 'erro', texto: String(ev.result || 'O Claude não conseguiu responder.') });
        else aoEvento({ tipo: 'fim' });
      }
    }
  });
  atual.stderr.setEncoding('utf8');
  atual.stderr.on('data', (pedaco) => {
    erroTexto = (erroTexto + pedaco).slice(-600);
  });
  atual.on('error', (erro) => {
    if (!terminou && !atual.cancelado) aoEvento({ tipo: 'erro', texto: `Não deu para abrir o Claude Code: ${erro.message}` });
    terminou = true;
  });
  atual.on('close', (codigo) => {
    if (processo === atual) processo = null;
    if (!terminou && !atual.cancelado) {
      aoEvento({
        tipo: 'erro',
        texto: erroTexto.trim() || `O Claude Code saiu sem responder (código ${codigo}).`,
      });
    }
  });

  atual.stdin.end(texto);
}

/** Para a resposta em andamento, se houver. */
function cancelar() {
  if (processo) {
    processo.cancelado = true; // quem cancelou não quer ver erro
    processo.kill();
    processo = null;
  }
}

/** Começa do zero: a próxima mensagem abre uma sessão nova. */
function nova() {
  cancelar();
  sessaoId = null;
}

module.exports = { configurar, enviar, cancelar, nova };
