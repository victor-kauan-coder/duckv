// Previas e arquivos de cada sessao, para ver no celular sem ir ao computador.
// - Previa: um servidor de desenvolvimento em localhost:porta que apareceu na conversa
//   (o Vite, o Next, um "npm run dev"...). O celular busca as paginas por aqui.
// - Arquivo: algo que o agente criou ou editou dentro da pasta do projeto (HTML, imagem, SVG, PDF).
// - Artefato: um link de artefato do claude.ai que apareceu na conversa (abre no navegador do celular).
// So entra na lista o que apareceu na propria sessao, e so celulares pareados chegam aqui.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const LOCAL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{4,5})\b/g;
const ARTEFATO = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]{6,80}/g;
// O que o navegador do celular sabe mostrar. Codigo-fonte e configuracao ficam de fora.
export const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};
// Arquivos que valem abrir sozinhos na lista (os outros so carregam junto de uma pagina).
const ABRIVEIS = new Set(['.html', '.htm', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.mp4', '.webm', '.md']);

function lista(inst) {
  if (!inst.previas) inst.previas = { portas: [], arquivos: [], artefatos: [] };
  return inst.previas;
}
const poe = (arr, v, max) => {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  arr.unshift(v);
  if (arr.length > max) arr.length = max;
};

/** Procura previas e artefatos num texto da conversa (mensagem ou saida de ferramenta). */
export function lerTexto(inst, texto, portaDoDuckV) {
  if (!texto || typeof texto !== 'string') return false;
  let mudou = false;
  for (const m of texto.matchAll(LOCAL)) {
    const p = Number(m[1]);
    if (p >= 1024 && p <= 65535 && p !== portaDoDuckV && !lista(inst).portas.includes(p)) {
      poe(lista(inst).portas, p, 6);
      mudou = true;
    }
  }
  for (const m of texto.matchAll(ARTEFATO)) {
    if (!lista(inst).artefatos.includes(m[0])) {
      poe(lista(inst).artefatos, m[0], 8);
      mudou = true;
    }
  }
  return mudou;
}

/** Um arquivo criado ou editado pelo agente: entra na lista se estiver na pasta do projeto e for de abrir. */
export function lerArquivo(inst, caminho) {
  const rel = dentroDoProjeto(inst, caminho);
  if (!rel || !ABRIVEIS.has(path.extname(rel).toLowerCase())) return false;
  const l = lista(inst).arquivos;
  if (l[0] === rel) return false;
  poe(l, rel, 12);
  return true;
}

/** Caminho relativo a pasta do projeto, ou null se estiver fora dela ou for escondido (.env, .git...). */
export function dentroDoProjeto(inst, caminho) {
  if (!inst.cwd || !caminho) return null;
  const raiz = path.resolve(inst.cwd);
  const alvo = path.resolve(raiz, String(caminho));
  const rel = path.relative(raiz, alvo);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  // ":" no Windows vira unidade ("C:") ou fluxo alternativo do NTFS ("a.html:x"); \0 corta o nome.
  if (/[:\u0000]/.test(rel)) return null;
  if (rel.split(/[\\/]/).some((parte) => parte.startsWith('.') || parte === 'node_modules')) return null;
  return rel.split(path.sep).join('/');
}

/** O que o celular recebe no estado da sessao. */
export const publico = (inst) => (inst.previas ? { portas: inst.previas.portas, arquivos: inst.previas.arquivos, artefatos: inst.previas.artefatos } : null);

/** GET /api/previa/<porta>/<caminho>: repassa ao servidor de desenvolvimento, sem levar a chave do celular. */
export function repassar(req, res, inst, porta, caminho, cabecalhosSeguros) {
  if (!lista(inst).portas.includes(porta)) {
    res.writeHead(404, cabecalhosSeguros);
    return res.end('Essa porta nao apareceu nesta sessao.');
  }
  const pedido = http.request(
    {
      host: '127.0.0.1',
      port: porta,
      method: 'GET',
      path: caminho || '/',
      headers: { accept: req.headers.accept || '*/*', 'accept-language': req.headers['accept-language'] || 'pt-BR', 'user-agent': req.headers['user-agent'] || 'duckV' },
      timeout: 15000,
    },
    (r) => {
      const h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      for (const k of ['content-type', 'content-length', 'last-modified', 'etag']) if (r.headers[k]) h[k] = r.headers[k];
      res.writeHead(r.statusCode || 502, h);
      r.pipe(res);
    },
  );
  pedido.on('timeout', () => pedido.destroy(new Error('tempo')));
  pedido.on('error', () => {
    if (!res.headersSent) res.writeHead(502, cabecalhosSeguros);
    res.end('A previa nao respondeu. O servidor de desenvolvimento ainda esta ligado no computador?');
  });
  req.on('close', () => pedido.destroy());
  pedido.end();
}

/** GET /api/pasta/<caminho>: um arquivo da pasta do projeto (e o que a pagina dele carrega junto). */
export function servirDaPasta(res, inst, caminho, cabecalhosSeguros) {
  const rel = dentroDoProjeto(inst, decodeURIComponent(caminho || ''));
  const tipo = rel && TIPOS[path.extname(rel).toLowerCase()];
  if (!tipo) {
    res.writeHead(404, cabecalhosSeguros);
    return res.end('Arquivo fora da pasta do projeto ou de um tipo que o celular nao abre.');
  }
  const alvo = path.join(path.resolve(inst.cwd), rel);
  let st;
  try {
    // O caminho real passa pelas mesmas regras: um atalho nao pode apontar para fora, e no Windows
    // o nome curto 8.3 (SEGRED~1 para .segredos) nao pode furar a regra das pastas escondidas.
    // realpathSync.native devolve os nomes longos de verdade.
    const real = path.relative(fs.realpathSync.native(inst.cwd), fs.realpathSync.native(alvo));
    if (!real || real.startsWith('..') || path.isAbsolute(real)) throw new Error('fora');
    if (dentroDoProjeto(inst, real) === null || TIPOS[path.extname(real).toLowerCase()] !== tipo) throw new Error('escondido');
    st = fs.statSync(alvo);
    if (!st.isFile() || st.size > 50 * 1024 * 1024) throw new Error('grande');
  } catch {
    res.writeHead(404, cabecalhosSeguros);
    return res.end('O arquivo nao esta mais no computador.');
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': st.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(alvo).on('error', () => res.destroy()).pipe(res);
}
