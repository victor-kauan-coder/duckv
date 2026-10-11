// Sessoes abertas pelo celular: o Claude Code roda dentro de um terminal
// virtual mantido pelo servidor. Assim o celular consegue digitar comandos
// (/model, /effort...), apertar teclas e ver a tela, como se estivesse no
// teclado do computador.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let pty = null;
let Terminal = null;
let loadError = null;
try {
  const m = await import('@lydell/node-pty');
  pty = m.spawn ? m : m.default;
  const x = await import('@xterm/headless');
  Terminal = x.Terminal || x.default?.Terminal;
  if (!pty?.spawn || !Terminal) throw new Error('biblioteca de terminal incompleta');
} catch (e) {
  loadError = e?.message || String(e);
  pty = null;
}

export const hostedAvailable = () => !!pty;
export const hostedError = () => loadError;

export const MODELS = ['default', 'best', 'fable', 'opus', 'sonnet', 'haiku', 'opusplan'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// De proposito, o modo que pula todas as permissoes nao pode ser ligado pelo celular.
export const MODES = ['manual', 'acceptEdits', 'plan', 'auto'];

const KEYS = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  'ctrl-c': '\x03',
  backspace: '\x7f',
  space: ' ',
};
const ARROWS = { up: 'A', down: 'B', right: 'C', left: 'D' };

const cleanText = (t) => String(t).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

// As pastas onde o celular pode abrir sessoes: a pasta pessoal, as listadas em
// "pastasPermitidas" (data/config.json) e as que ja tiveram sessao aberta no computador.
export function folderAllowed(dir, extraRoots = [], known = []) {
  let real;
  try {
    real = fs.realpathSync(dir);
    if (!fs.statSync(real).isDirectory()) return null;
  } catch {
    return null;
  }
  const norm = (p) => {
    let r = path.resolve(p);
    try {
      r = fs.realpathSync(r);
    } catch {
      /* usa o caminho como veio */
    }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  const target = norm(real);
  const inside = (root) => {
    const r = norm(root);
    return target === r || target.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
  };
  if ([os.homedir(), ...extraRoots].some(inside)) return real;
  if (known.some((k) => norm(k) === target)) return real;
  return null;
}

export function listFolders(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$') && e.name !== 'node_modules')
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 300);
  } catch {
    return [];
  }
}

const BOX = /[\u2500-\u257f\u2580-\u259f]/g;
const limpa = (l) => String(l || '').replace(BOX, ' ').replace(/\s+$/, '');

// Procura, na parte de baixo da tela, um menu de opcoes numeradas do Claude Code
// (por exemplo "❯ 1. Yes  2. No") para o app oferecer como botoes. So vale quando
// uma das linhas tem o marcador de selecao, para nao confundir com listas no texto.
export function readPrompt(lines) {
  const ls = lines.map(limpa);
  let fim = ls.length - 1;
  while (fim >= 0 && !ls[fim].trim()) fim--;
  const opcao = /^\s*([❯›>▶]\s*)?(\d)[.)]\s+(\S.*)$/;
  for (let i = fim; i >= Math.max(0, fim - 24); i--) {
    if (!opcao.test(ls[i])) continue;
    // sobe ate o inicio do bloco de opcoes (linhas de descricao indentadas sao toleradas)
    const opcoes = [];
    let marcado = false;
    let j = i;
    let topo = i;
    while (j >= 0) {
      const m = opcao.exec(ls[j]);
      if (m) {
        opcoes.unshift({ tecla: m[2], rotulo: m[3].trim().slice(0, 120) });
        if (m[1]) marcado = true;
        topo = j;
      } else if (ls[j].trim() && !/^\s{3,}\S/.test(ls[j])) break;
      else if (!ls[j].trim() && j < topo - 1) break;
      j--;
    }
    const emOrdem = opcoes.every((o, n) => Number(o.tecla) === n + 1);
    if (opcoes.length < 2 || opcoes.length > 9 || !marcado || !emOrdem) return null;
    const titulo = [];
    let vazias = 0;
    for (let k = topo - 1; k >= 0 && titulo.length < 3; k--) {
      const t = ls[k].trim();
      if (!t) {
        if (titulo.length && ++vazias > 1) break;
        continue;
      }
      titulo.unshift(t);
    }
    return { titulo: titulo.join(' ').slice(0, 300), opcoes };
  }
  return null;
}

// A linha do rodape em que o Claude Code mostra o modo de permissao ativo.
export function readFooter(lines) {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12); i--) {
    const t = limpa(lines[i]).trim();
    if (/shift\s*\+\s*tab/i.test(t) || /\bmode\b.*\bon\b/i.test(t)) return t.slice(0, 140);
  }
  return '';
}

// Abre o Claude Code no terminal virtual. `opts`: cwd, env, model, effort, mode,
// name, cols, rows, command (para testes), onScreen(snapshot), onExit(code).
export function startHosted(opts) {
  if (!pty) throw new Error(`Terminal virtual indisponivel neste computador: ${loadError}`);
  const cols = Math.max(40, Math.min(160, opts.cols || 60));
  const rows = Math.max(16, Math.min(60, opts.rows || 32));

  const args = [];
  if (opts.model && opts.model !== 'default') args.push('--model', opts.model);
  if (opts.effort) args.push('--effort', opts.effort);
  if (opts.mode) args.push('--permission-mode', opts.mode);
  if (opts.name) args.push('--name', opts.name);

  const custom = opts.command; // [programa, ...argumentos], usado nos testes e em instalacoes fora do padrao
  let file;
  let argv;
  if (custom?.length) {
    file = custom[0];
    argv = [...custom.slice(1), ...args];
  } else if (process.platform === 'win32') {
    // cmd.exe encontra tanto o claude.exe quanto o claude.cmd instalado pelo npm.
    file = process.env.ComSpec || 'cmd.exe';
    // Sem /s: como o comando nao comeca com aspas, o cmd preserva as aspas dos argumentos.
    argv = ['/d', '/c', 'claude', ...args];
  } else {
    file = 'claude';
    argv = args;
  }

  const term = new Terminal({ cols, rows, scrollback: 400, allowProposedApi: true });
  const proc = pty.spawn(file, argv, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });

  let alive = true;
  let timer = null;
  let last = '';

  function snapshot() {
    const buf = term.buffer.active;
    const lines = [];
    for (let y = 0; y < term.rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      lines.push(line ? line.translateToString(true) : '');
    }
    return { lines, cx: buf.cursorX, cy: buf.cursorY, cols: term.cols, rows: term.rows };
  }
  function emit() {
    timer = null;
    const snap = snapshot();
    const sig = `${snap.cols}x${snap.rows}:${snap.cx},${snap.cy}:${snap.lines.join('\n')}`;
    if (sig === last) return;
    last = sig;
    opts.onScreen?.(snap);
  }
  const schedule = () => {
    if (!timer) timer = setTimeout(emit, 120);
  };

  proc.onData((d) => term.write(d, schedule));
  // O terminal virtual responde as perguntas que o programa faz ao terminal (tamanho, cores...).
  term.onData((d) => alive && proc.write(d));
  proc.onExit(({ exitCode }) => {
    alive = false;
    clearTimeout(timer);
    emit();
    opts.onExit?.(exitCode);
    term.dispose();
  });

  const write = (data) => {
    if (alive) proc.write(data);
  };

  return {
    pid: proc.pid,
    alive: () => alive,
    snapshot,
    resize(c, r) {
      if (!alive) return;
      c = Math.max(40, Math.min(160, Math.round(c)));
      r = Math.max(16, Math.min(60, Math.round(r)));
      if (c === term.cols && r === term.rows) return;
      term.resize(c, r);
      proc.resize(c, r);
      schedule();
    },
    key(name) {
      if (ARROWS[name]) return write(`\x1b${term.modes.applicationCursorKeysMode ? 'O' : '['}${ARROWS[name]}`), true;
      if (KEYS[name]) return write(KEYS[name]), true;
      if (/^[a-z0-9]$/i.test(name)) return write(name), true;
      return false;
    },
    // Digita um texto e aperta Enter, como o usuario faria no teclado.
    send(text) {
      const t = cleanText(text).trim();
      if (!t) return false;
      if (!t.includes('\n') && t.length <= 400) write(t);
      else if (term.modes.bracketedPasteMode) write(`\x1b[200~${t}\x1b[201~`);
      else write(t.replace(/\n/g, ' '));
      setTimeout(() => write('\r'), 180);
      return true;
    },
    kill() {
      if (!alive) return;
      try {
        proc.kill();
      } catch {
        /* ja terminou */
      }
    },
  };
}
