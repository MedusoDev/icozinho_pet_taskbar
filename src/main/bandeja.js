// BANDEJA — o ícone perto do relógio: abrir a doca, soltar ou prender o pet
// na barra, iniciar com o Windows, ligar ao Claude Code e sair.
const { Menu, Tray, nativeImage } = require('electron');
const path = require('path');

/**
 * @param {object} acoes
 * @param {() => void} acoes.abrirIlha
 * @param {() => boolean} acoes.petNaBarra
 * @param {(ligado: boolean) => void} acoes.definirPetNaBarra
 * @param {() => boolean} acoes.iniciaComWindows
 * @param {(ligado: boolean) => void} acoes.definirInicio
 * @param {() => ('atual'|'desatualizado'|null)} acoes.ligadoAoClaude
 * @param {() => Promise<void>} acoes.ligarClaude
 * @param {() => Promise<void>} acoes.desligarClaude
 * @param {() => void} acoes.sair
 * @returns {{ atualizar: () => void }}
 */
function criarBandeja(acoes) {
  const icone = nativeImage
    .createFromPath(path.join(__dirname, '..', '..', 'assets', 'bandeja.png'))
    .resize({ width: 16, height: 16 });
  const bandeja = new Tray(icone);
  bandeja.setToolTip('Icozinho');

  /** Ligar, atualizar (ligado por uma versão anterior) ou desligar. */
  function itensDoClaude() {
    const estado = acoes.ligadoAoClaude();
    if (!estado) return [{ label: 'Ligar ao Claude Code…', click: acoes.ligarClaude }];
    const desligar = { label: 'Desligar do Claude Code', click: acoes.desligarClaude };
    if (estado === 'desatualizado') {
      return [{ label: 'Atualizar ligação ao Claude Code…', click: acoes.ligarClaude }, desligar];
    }
    return [desligar];
  }

  const montarMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Abrir o Icozinho', click: acoes.abrirIlha },
      { type: 'separator' },
      {
        label: 'Pet solto na barra de tarefas',
        type: 'checkbox',
        checked: acoes.petNaBarra(),
        click: (item) => acoes.definirPetNaBarra(item.checked),
      },
      {
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        checked: acoes.iniciaComWindows(),
        click: (item) => acoes.definirInicio(item.checked),
      },
      { type: 'separator' },
      ...itensDoClaude(),
      { type: 'separator' },
      { label: 'Sair', click: acoes.sair },
    ]);

  bandeja.setContextMenu(montarMenu());
  // Clique duplo no ícone: abre a doca.
  bandeja.on('double-click', acoes.abrirIlha);

  return { atualizar: () => bandeja.setContextMenu(montarMenu()) };
}

module.exports = { criarBandeja };
