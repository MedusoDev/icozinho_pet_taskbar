// BANDEJA — o ícone perto do relógio. É por ali que se esconde, mostra,
// liga o "iniciar com o Windows" e fecha o Icozinho.
const { Menu, Tray, nativeImage } = require('electron');
const path = require('path');

/**
 * @param {object} acoes
 * @param {() => boolean} acoes.estaVisivel
 * @param {() => void} acoes.alternarVisivel
 * @param {() => boolean} acoes.iniciaComWindows
 * @param {(ligado: boolean) => void} acoes.definirInicio
 * @param {() => void} acoes.sair
 */
function criarBandeja(acoes) {
  const icone = nativeImage
    .createFromPath(path.join(__dirname, '..', '..', 'assets', 'bandeja.png'))
    .resize({ width: 16, height: 16 });
  const bandeja = new Tray(icone);
  bandeja.setToolTip('Icozinho');

  const montarMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Icozinho', enabled: false },
      { type: 'separator' },
      {
        label: acoes.estaVisivel() ? 'Esconder' : 'Mostrar',
        click: () => {
          acoes.alternarVisivel();
          bandeja.setContextMenu(montarMenu());
        },
      },
      {
        label: 'Iniciar com o Windows',
        type: 'checkbox',
        checked: acoes.iniciaComWindows(),
        click: (item) => acoes.definirInicio(item.checked),
      },
      { type: 'separator' },
      { label: 'Sair', click: acoes.sair },
    ]);

  bandeja.setContextMenu(montarMenu());
  // Clique duplo no ícone: esconde ou mostra, sem abrir o menu.
  bandeja.on('double-click', () => {
    acoes.alternarVisivel();
    bandeja.setContextMenu(montarMenu());
  });
  return bandeja;
}

module.exports = { criarBandeja };
