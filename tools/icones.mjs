#!/usr/bin/env node
// Gera os icones do duckV a partir do mesmo desenho do pato em pixels do app (app/desktop.js).
// O fundo e um "squircle" (quadrado de cantos bem arredondados, como os icones do Android e do iOS),
// com borda suave. Sem dependencias: o PNG e montado aqui mesmo, com o zlib do Node.
//
//   node tools/icones.mjs
//
// Arquivos gerados:
//   app/icons/icone-192.png, icone-512.png   squircle com cantos transparentes (navegador, PWA, janela)
//   app/icons/icone-mascara-512.png          quadrado inteiro com folga (o Android recorta no formato dele)
//   app/icons/apple-touch-icon.png           quadrado inteiro 180 px (o iOS arredonda sozinho; canto transparente vira preto)
//   desktop/build/icon.png                   1024 px para o instalador (.exe, AppImage, .deb)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SPRITE = [
  '.........OOOO...',
  '........OBBBBO..',
  '........OBBeBkkk',
  '........OBBBBqq.',
  '.T......obbbo...',
  'TtT...oobbbbo...',
  'Tttooobbbbbbbo..',
  'obbbbwwwbbbbbo..',
  '.obbbbwwwbbbo...',
  '..obbbbbbbbo....',
  '...oooooooo.....',
  '.....f...g......',
  '....ff..gg......',
];
const TINTA = [0x1d, 0x14, 0x10];
const CORES = {
  O: TINTA, o: TINTA, T: TINTA, e: TINTA, q: TINTA, f: TINTA, g: TINTA,
  B: [0xff, 0xf6, 0xee], b: [0xff, 0xf6, 0xee], t: [0xff, 0xf6, 0xee],
  w: [0xe6, 0xd3, 0xbf],
  k: [0xff, 0xd8, 0x4a],
};
const LARANJA = [0xff, 0x7a, 0x1a];
const LARANJA_CLARO = [0xff, 0x93, 0x40]; // topo do degrade sutil do squircle

// Superelipse |x|^n + |y|^n <= 1: a forma dos icones modernos, mais macia que um retangulo de canto redondo.
function dentroSquircle(x, y, n = 5) {
  return Math.abs(x) ** n + Math.abs(y) ** n <= 1;
}

function desenhar(tam, { forma, margem, pixel }) {
  const px = new Uint8ClampedArray(tam * tam * 4);
  const meio = tam / 2;
  const raio = tam / 2 - margem;
  const AMOSTRAS = 4;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let cobre = 1;
      if (forma === 'squircle') {
        let n = 0;
        for (let sy = 0; sy < AMOSTRAS; sy++)
          for (let sx = 0; sx < AMOSTRAS; sx++) n += dentroSquircle((x + (sx + 0.5) / AMOSTRAS - meio) / raio, (y + (sy + 0.5) / AMOSTRAS - meio) / raio) ? 1 : 0;
        cobre = n / (AMOSTRAS * AMOSTRAS);
      }
      const t = y / tam;
      const fundo = forma === 'squircle' ? LARANJA_CLARO.map((c, i) => Math.round(c + (LARANJA[i] - c) * Math.min(1, t * 1.6))) : LARANJA;
      const i = (y * tam + x) * 4;
      px[i] = fundo[0];
      px[i + 1] = fundo[1];
      px[i + 2] = fundo[2];
      px[i + 3] = Math.round(cobre * 255);
    }
  }
  // O pato fica centrado; cada "pixel" do desenho vira um quadrado inteiro, sem borrar.
  const largura = SPRITE[0].length * pixel;
  const altura = SPRITE.length * pixel;
  const x0 = Math.round((tam - largura) / 2);
  const y0 = Math.round((tam - altura) / 2 + pixel * 0.15);
  SPRITE.forEach((linha, sy) =>
    [...linha].forEach((c, sx) => {
      const cor = CORES[c];
      if (!cor) return;
      for (let y = y0 + sy * pixel; y < y0 + (sy + 1) * pixel; y++)
        for (let x = x0 + sx * pixel; x < x0 + (sx + 1) * pixel; x++) {
          const i = (y * tam + x) * 4;
          px[i] = cor[0];
          px[i + 1] = cor[1];
          px[i + 2] = cor[2];
          px[i + 3] = 255;
        }
    }),
  );
  return px;
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pedaco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii');
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tamanho, t, dados, crc]);
}
function png(tam, px) {
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(tam, 0);
  cab.writeUInt32BE(tam, 4);
  cab[8] = 8; // 8 bits por canal
  cab[9] = 6; // RGBA
  const linhas = Buffer.alloc((tam * 4 + 1) * tam);
  for (let y = 0; y < tam; y++) Buffer.from(px.buffer, y * tam * 4, tam * 4).copy(linhas, y * (tam * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', cab), pedaco('IDAT', zlib.deflateSync(linhas, { level: 9 })), pedaco('IEND', Buffer.alloc(0))]);
}

const saidas = [
  ['app/icons/icone-512.png', 512, { forma: 'squircle', margem: 16, pixel: 20 }],
  ['app/icons/icone-192.png', 192, { forma: 'squircle', margem: 6, pixel: 7 }],
  ['app/icons/icone-mascara-512.png', 512, { forma: 'quadrado', margem: 0, pixel: 16 }],
  ['app/icons/apple-touch-icon.png', 180, { forma: 'quadrado', margem: 0, pixel: 8 }],
  ['desktop/build/icon.png', 1024, { forma: 'squircle', margem: 32, pixel: 40 }],
];
for (const [arquivo, tam, opts] of saidas) {
  fs.writeFileSync(path.join(RAIZ, arquivo), png(tam, desenhar(tam, opts)));
  console.log(`${arquivo} (${tam} px)`);
}
