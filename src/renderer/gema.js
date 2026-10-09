// A GEMA — o icosaendro da marca, o mesmo do portfólio e da capa: desenho
// fixo (semente + corte diagonal), lado roxo (dev) maior que o âmbar (games),
// material de gema e o reflexo de diamante. O brilho, o desdobramento e o
// reflexo rodam na placa de vídeo; daqui só vão alguns números por quadro.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CORES = ['#7C3AED', '#4C1D95', '#D97706', '#92400E', '#6D28D9', '#B45309'].map((c) => new THREE.Color(c));
const FAMILIA_ROXA = [CORES[0], CORES[4], CORES[1]];
const FAMILIA_AMBAR = [CORES[2], CORES[5], CORES[3]];
const EIXO_MARCA = new THREE.Vector3(0.75, -0.55, 0.38).normalize();
const CORTE_MARCA = 0.22;
const SEMENTE_MARCA = 1715;
const RAIO_MODELO = 1.5;

function geradorComSemente(semente) {
  let s = semente >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** A geometria com o padrão da marca e o que o shader precisa por face. */
function geometriaDaMarca() {
  // Cada face precisa dos próprios 3 vértices (cor e normal por face). O
  // IcosahedronGeometry já vem assim; o toNonIndexed fica só por garantia.
  const base = new THREE.IcosahedronGeometry(RAIO_MODELO, 1);
  const geo = base.index ? base.toNonIndexed() : base;
  if (geo !== base) base.dispose();

  const pos = geo.attributes.position;
  const n = pos.count;
  const rng = geradorComSemente(SEMENTE_MARCA);
  const cores = new Float32Array(n * 3);
  const normais = new Float32Array(n * 3);
  const centros = new Float32Array(n * 3);
  const amplitudes = new Float32Array(n);
  const fases = new Float32Array(n);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), cb = new THREE.Vector3(), centro = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    cb.subVectors(c, b);
    ab.subVectors(a, b);
    cb.cross(ab).normalize();
    centro.copy(a).add(b).add(c).normalize();

    const familia = centro.dot(EIXO_MARCA) > CORTE_MARCA ? FAMILIA_AMBAR : FAMILIA_ROXA;
    const cor = familia[Math.floor(rng() * familia.length)];
    const amplitude = 0.55 + rng() * 0.9;
    const fase = rng();
    for (let v = 0; v < 3; v++) {
      const i = f * 3 + v;
      cores.set([cor.r, cor.g, cor.b], i * 3);
      normais.set([cb.x, cb.y, cb.z], i * 3);
      centros.set([centro.x, centro.y, centro.z], i * 3);
      amplitudes[i] = amplitude;
      fases[i] = fase;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.setAttribute('aNormalFace', new THREE.BufferAttribute(normais, 3));
  geo.setAttribute('aCentro', new THREE.BufferAttribute(centros, 3));
  geo.setAttribute('aAmplitude', new THREE.BufferAttribute(amplitudes, 1));
  geo.setAttribute('aFase', new THREE.BufferAttribute(fases, 1));
  return geo;
}

/** Brilho redondo atrás da gema, desenhado uma vez numa textura pequena. */
function texturaDoHalo() {
  const lado = 128;
  const tela = document.createElement('canvas');
  tela.width = tela.height = lado;
  const ctx = tela.getContext('2d');
  const g = ctx.createRadialGradient(lado / 2, lado / 2, 0, lado / 2, lado / 2, lado / 2);
  g.addColorStop(0, 'rgba(124,58,237,0.35)');
  g.addColorStop(0.45, 'rgba(124,58,237,0.12)');
  g.addColorStop(0.7, 'rgba(217,119,6,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, lado, lado);
  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/**
 * Monta a gema na cena. `raioPx` é o tamanho dela na tela.
 * Devolve o grupo (para posicionar e girar) e `atualizar`, chamado a cada
 * quadro com o tempo e o "humor" visual do momento.
 */
export function criarGema(renderer, scene, raioPx) {
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // Luzes direcionais: não dependem da distância, então funcionam na escala
  // em pixels da cena (uma luz pontual sumiria a 30 px de distância).
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const roxa = new THREE.DirectionalLight('#7C3AED', 2.2);
  roxa.position.set(-1, 0.8, 1);
  const ambar = new THREE.DirectionalLight('#D97706', 2.0);
  ambar.position.set(1, -0.6, 0.9);
  const frente = new THREE.DirectionalLight('#ffffff', 0.35);
  frente.position.set(0, 0, 1);
  scene.add(roxa, ambar, frente);

  const uniforms = {
    uTempo: { value: 0 },
    uDesdobra: { value: 0 },
    uEnergia: { value: 1 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    flatShading: true,
    metalness: 0.35,
    roughness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    iridescence: 0.18,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    envMapIntensity: 0.5,
    emissive: new THREE.Color(0x000000),
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aNormalFace; attribute vec3 aCentro;
        attribute float aAmplitude; attribute float aFase;
        uniform float uDesdobra;
        varying vec3 vCentro; varying float vFase;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += aNormalFace * (uDesdobra * aAmplitude * 0.55);
        vCentro = aCentro; vFase = aFase;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTempo; uniform float uEnergia;
        varying vec3 vCentro; varying float vFase;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= 0.84 + 0.24 * sin(uTempo * (0.5 + vFase * 0.6) + vFase * 6.2831);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float ciclo = mod(uTempo, 7.0) / 7.0;
        float faixa = mix(-1.8, 1.8, ciclo);
        float glint = 1.0 - smoothstep(0.0, 0.2, abs(dot(vCentro, normalize(vec3(0.8, 0.55, 0.3))) - faixa));
        // cada face brilha na própria cor: o âmbar continua âmbar
        totalEmissiveRadiance += diffuseColor.rgb * (0.45 * uEnergia + glint * 1.8 * uEnergia);`
      );
  };

  const malha = new THREE.Mesh(geometriaDaMarca(), material);
  malha.frustumCulled = false;

  const arestas = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(RAIO_MODELO * 1.013, 1)),
    new THREE.LineBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 0.18 })
  );

  const contorno = new THREE.Mesh(
    new THREE.IcosahedronGeometry(RAIO_MODELO * 1.04, 3),
    new THREE.ShaderMaterial({
      uniforms: { uForca: { value: 0.55 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uForca; varying vec3 vN; varying vec3 vV;
        void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
          gl_FragColor = vec4(mix(vec3(0.486, 0.227, 0.929), vec3(0.851, 0.467, 0.024), 0.35), f * uForca); }`,
      transparent: true,
      depthWrite: false,
    })
  );
  contorno.renderOrder = 1;

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texturaDoHalo(), transparent: true, depthWrite: false })
  );
  halo.scale.set(RAIO_MODELO * 4, RAIO_MODELO * 4, 1);
  halo.renderOrder = -1;

  // `corpo` gira; o grupo de fora só anda (o halo não deve girar junto).
  const corpo = new THREE.Group();
  corpo.add(malha, arestas, contorno);
  const grupo = new THREE.Group();
  grupo.add(halo, corpo);
  grupo.scale.setScalar(raioPx / RAIO_MODELO);
  scene.add(grupo);

  /**
   * @param {number} t tempo em segundos
   * @param {{ desdobra: number, energia: number }} visual
   */
  function atualizar(t, { desdobra, energia }) {
    uniforms.uTempo.value = t;
    uniforms.uDesdobra.value = desdobra;
    uniforms.uEnergia.value = energia;
    halo.material.opacity = Math.min(1, 0.6 + energia * 0.4);
    contorno.material.uniforms.uForca.value = 0.55 * Math.min(energia, 1.2);
  }

  return { grupo, corpo, atualizar };
}
