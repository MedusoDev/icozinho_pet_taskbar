// PREFERÊNCIAS — o pouco que o Icozinho lembra entre uma abertura e outra,
// num JSON na pasta de dados do app.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const PADRAO = {
  visivel: true,
  iniciarComWindows: false,
};

const arquivo = () => path.join(app.getPath('userData'), 'preferencias.json');

function ler() {
  try {
    return { ...PADRAO, ...JSON.parse(fs.readFileSync(arquivo(), 'utf8')) };
  } catch {
    return { ...PADRAO };
  }
}

function salvar(preferencias) {
  try {
    fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
    fs.writeFileSync(arquivo(), JSON.stringify(preferencias, null, 2));
  } catch (erro) {
    console.error('[icozinho] não deu para salvar as preferências:', erro.message);
  }
}

module.exports = { ler, salvar };
