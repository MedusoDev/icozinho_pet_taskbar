// OS SONS — sintetizados na hora (WebAudio), sem arquivos de áudio: notas
// curtas e baixinhas, para avisar sem assustar.

let contexto = null;

function nota(frequencia, inicio, duracao, volume = 0.06) {
  contexto ??= new AudioContext();
  const t = contexto.currentTime + inicio;
  const osc = contexto.createOscillator();
  const ganho = contexto.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequencia;
  ganho.gain.setValueAtTime(0, t);
  ganho.gain.linearRampToValueAtTime(volume, t + 0.015);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  osc.connect(ganho).connect(contexto.destination);
  osc.start(t);
  osc.stop(t + duracao + 0.02);
}

const SONS = {
  // duas notas subindo e repetindo: "ei, olha aqui"
  pedido: () => {
    nota(660, 0, 0.16);
    nota(880, 0.12, 0.22);
    nota(660, 0.42, 0.16);
    nota(880, 0.54, 0.22);
  },
  // acorde subindo: terminou
  pronto: () => {
    nota(523, 0, 0.18, 0.05);
    nota(659, 0.08, 0.18, 0.05);
    nota(784, 0.16, 0.3, 0.05);
  },
  // descendo: deu errado
  erro: () => {
    nota(440, 0, 0.2, 0.05);
    nota(330, 0.14, 0.32, 0.05);
  },
};

export function tocar(qual) {
  try {
    SONS[qual]?.();
  } catch {
    // sem saída de áudio: segue em silêncio
  }
}
