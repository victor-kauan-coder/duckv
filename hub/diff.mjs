// O que o agente mudou na pasta da sessao (aba "Mudancas") e a busca de arquivos do "@" da caixa de
// mensagem. O git roda sempre com execFile e argumentos separados: nada vira texto de comando num shell,
// e a pasta e sempre a da propria sessao, decidida pelo servidor.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Acima disto o arquivo aparece so como "mudou, grande demais para mostrar".
export const LIMITE_LINHAS = 1500;
export const LIMITE_BYTES = 256 * 1024;
// O diff inteiro: passou disto, vem so a lista de arquivos com os numeros.
export const LIMITE_TOTAL = 4 * 1024 * 1024;
const MAX_ARQUIVOS = 400;
// A arvore vazia do git: o "antes" de um repositorio ainda sem nenhum commit.
const VAZIA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
// Ajustes do usuario que mudariam o formato da saida ficam desligados.
const BASE = ['-c', 'core.quotepath=false', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'color.ui=false'];

function git(cwd, args, maxBuffer = LIMITE_TOTAL) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...BASE, ...args], { maxBuffer, windowsHide: true, timeout: 20_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || err?.message || ''), grande: err?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }),
    );
  });
}

// Caminho entre aspas que o git usa para nomes com caracteres especiais: "a\tb" e \303\251 (UTF-8 em octal).
function semAspas(p) {
  if (!p.startsWith('"')) return p;
  const bytes = [];
  const s = p.slice(1, -1);
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      bytes.push(...Buffer.from(s[i]));
      continue;
    }
    const n = s[++i];
    if (/[0-7]/.test(n)) {
      bytes.push(parseInt(s.slice(i, i + 3), 8));
      i += 2;
    } else bytes.push({ n: 10, t: 9, r: 13, '"': 34, '\\': 92 }[n] ?? n.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}
const tiraPrefixo = (p) => semAspas(p).replace(/^[ab]\//, '');

// Le a saida do "git diff" em arquivos e trechos. Cada linha de um trecho: { t: '+', '-' ou ' ', x: texto, a, n }
// (a = numero da linha antes, n = depois).
export function lerSaida(saida) {
  const arquivos = [];
  let f = null;
  let h = null;
  let a = 0;
  let n = 0;
  for (let l of saida.split('\n')) {
    l = l.replace(/\r$/, '');
    if (l.startsWith('diff --git ')) {
      const resto = l.slice(11);
      // "a/x b/x": sem renomear, as duas metades sao iguais
      const meio = (resto.length - 1) / 2;
      f = { caminho: tiraPrefixo(Number.isInteger(meio) ? resto.slice(meio + 1) : resto), somadas: 0, tiradas: 0, estado: 'mudou', trechos: [] };
      arquivos.push(f);
      h = null;
      continue;
    }
    if (!f) continue;
    if (!h) {
      if (l.startsWith('+++ ') && l.slice(4) !== '/dev/null') f.caminho = tiraPrefixo(l.slice(4));
      else if (l.startsWith('--- ') && l.slice(4) !== '/dev/null') f.antes = tiraPrefixo(l.slice(4));
      else if (l.startsWith('new file mode')) f.estado = 'novo';
      else if (l.startsWith('deleted file mode')) f.estado = 'apagado';
      else if (l.startsWith('rename from ')) f.antes = semAspas(l.slice(12));
      else if (l.startsWith('rename to ')) {
        f.caminho = semAspas(l.slice(10));
        f.estado = 'renomeado';
      } else if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) f.binario = true;
    }
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
    if (m) {
      a = Number(m[1]);
      n = Number(m[2]);
      h = { cab: l, linhas: [] };
      f.trechos.push(h);
      continue;
    }
    if (!h) continue;
    const t = l[0];
    if (t === '+') {
      h.linhas.push({ t, x: l.slice(1), n: n++ });
      f.somadas++;
    } else if (t === '-') {
      h.linhas.push({ t, x: l.slice(1), a: a++ });
      f.tiradas++;
    } else if (t === ' ') h.linhas.push({ t, x: l.slice(1), a: a++, n: n++ });
    // "\ No newline at end of file" e linhas vazias do fim ficam de fora
  }
  // "antes" so interessa quando o arquivo trocou de nome
  for (const x of arquivos) if (x.estado !== 'renomeado') delete x.antes;
  return arquivos;
}

// Arquivo grande demais para mostrar fica so com os numeros.
function encolher(f) {
  const linhas = f.trechos.reduce((s, h) => s + h.linhas.length, 0);
  const bytes = f.trechos.reduce((s, h) => s + h.linhas.reduce((b, l) => b + l.x.length, 0), 0);
  if (f.binario || linhas > LIMITE_LINHAS || bytes > LIMITE_BYTES) {
    f.grande = true;
    f.trechos = [];
  }
  return f;
}

// Arquivo novo, ainda fora do git: vira um trecho so de linhas somadas.
function arquivoNovo(raiz, rel) {
  const f = { caminho: rel, somadas: 0, tiradas: 0, estado: 'novo', naoRastreado: true, trechos: [] };
  let st;
  try {
    st = fs.statSync(path.join(raiz, rel));
  } catch {
    return f;
  }
  if (!st.isFile()) return f;
  if (st.size > LIMITE_BYTES) return Object.assign(f, { grande: true });
  let buf;
  try {
    buf = fs.readFileSync(path.join(raiz, rel));
  } catch {
    return f;
  }
  if (buf.subarray(0, 8000).includes(0)) return Object.assign(f, { binario: true, grande: true });
  const texto = buf.toString('utf8').replace(/\r\n/g, '\n');
  const linhas = texto.endsWith('\n') ? texto.slice(0, -1).split('\n') : texto ? texto.split('\n') : [];
  f.somadas = linhas.length;
  if (linhas.length > LIMITE_LINHAS) return Object.assign(f, { grande: true });
  if (linhas.length) f.trechos.push({ cab: `@@ -0,0 +1,${linhas.length} @@`, linhas: linhas.map((x, i) => ({ t: '+', x, n: i + 1 })) });
  return f;
}

// O diff da pasta: o que mudou desde o ultimo commit, mais os arquivos novos nao rastreados.
// Devolve { git: false, msg } fora de um repositorio, ou { git: true, raiz, ramo, arquivos, somadas, tiradas, grande? }.
export async function lerDiff(cwd) {
  if (!cwd) return { git: false, msg: 'Esta sessão não tem pasta.' };
  const topo = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!topo.ok) return { git: false, msg: 'Esta pasta não é um repositório git, então não dá para mostrar o que mudou.' };
  const raiz = path.resolve(topo.out.trim());
  const temHead = (await git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'])).ok;
  const base = temHead ? 'HEAD' : VAZIA;
  const ramo = temHead ? (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim() : '';
  // Roda na raiz: caminhos relativos a ela, mesmo com a sessao numa subpasta.
  let arquivos;
  let grande = false;
  const r = await git(raiz, ['diff', base, '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/', '-M', '--']);
  if (r.ok) arquivos = lerSaida(r.out).map(encolher);
  else if (r.grande) {
    // Diff gigante: so a lista, com os numeros de cada arquivo.
    grande = true;
    const ns = await git(raiz, ['diff', base, '--numstat', '--no-color', '--no-ext-diff', '-M', '-z', '--']);
    arquivos = [];
    const partes = ns.out.split('\0');
    for (let i = 0; i < partes.length; i++) {
      const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(partes[i]);
      if (!m) continue;
      let caminho = m[3];
      // renomeado: o caminho vem vazio e os dois nomes vem nas partes seguintes
      if (!caminho) {
        caminho = partes[i + 2];
        i += 2;
      }
      arquivos.push({ caminho, somadas: m[1] === '-' ? 0 : Number(m[1]), tiradas: m[2] === '-' ? 0 : Number(m[2]), estado: 'mudou', binario: m[1] === '-', grande: true, trechos: [] });
    }
  } else return { git: true, raiz, ramo, erro: `O git não conseguiu ler as mudanças: ${r.err.trim().split('\n').pop()}`, arquivos: [], somadas: 0, tiradas: 0 };
  const novos = await git(raiz, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (novos.ok) for (const rel of novos.out.split('\0').filter(Boolean).slice(0, MAX_ARQUIVOS)) arquivos.push(arquivoNovo(raiz, rel));
  if (arquivos.length > MAX_ARQUIVOS) {
    arquivos = arquivos.slice(0, MAX_ARQUIVOS);
    grande = true;
  }
  arquivos.sort((x, y) => x.caminho.localeCompare(y.caminho));
  return {
    git: true,
    raiz,
    ramo,
    arquivos,
    somadas: arquivos.reduce((s, f) => s + f.somadas, 0),
    tiradas: arquivos.reduce((s, f) => s + f.tiradas, 0),
    grande: grande || undefined,
  };
}

// Pastas que nunca entram na lista do "@" de uma pasta sem git.
const PULAR = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.gradle', '.idea', 'coverage']);

function listarSemGit(raiz, max = 4000) {
  const achados = [];
  const fila = [''];
  while (fila.length && achados.length < max) {
    const rel = fila.shift();
    let itens;
    try {
      itens = fs.readdirSync(path.join(raiz, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of itens) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!PULAR.has(e.name) && r.split('/').length < 8) fila.push(r);
      } else if (e.isFile()) achados.push(r);
      if (achados.length >= max) break;
    }
  }
  return achados;
}

// Nota de quanto o caminho combina com o que foi digitado: nome do arquivo antes do caminho inteiro.
function nota(caminho, q) {
  const c = caminho.toLowerCase();
  const nome = c.slice(c.lastIndexOf('/') + 1);
  if (!q) return 1;
  if (nome.startsWith(q)) return 4;
  if (nome.includes(q)) return 3;
  if (c.includes(q)) return 2;
  // letras do nome na ordem, com outras no meio ("dsk" acha "desktop.js")
  let i = 0;
  for (const ch of nome) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

// Arquivos da pasta da sessao para o "@": os rastreados pelo git, ou uma listagem limitada fora dele.
// Caminhos relativos a pasta da sessao, com "/".
export async function buscarArquivos(cwd, texto = '', max = 50) {
  const q = String(texto || '').toLowerCase().replace(/\\/g, '/').trim().slice(0, 200);
  let lista;
  let git_ = true;
  const r = await git(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], 16 * 1024 * 1024);
  if (r.ok) lista = r.out.split('\0').filter(Boolean);
  else {
    git_ = false;
    lista = listarSemGit(cwd);
  }
  const itens = lista
    .map((c) => [c, nota(c, q)])
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1] || x[0].length - y[0].length || x[0].localeCompare(y[0]))
    .slice(0, max)
    .map(([c]) => c);
  return { git: git_, itens };
}
