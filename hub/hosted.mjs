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
  'ctrl-u': '\x15',
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

// Menu numerado do Claude Code ("❯ 1. Yes" / "  2. No"). So vale quando uma das linhas
// tem o marcador de selecao, para nao confundir com listas no texto.
function menuNumerado(ls, fim) {
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
    return { opcoes, topo };
  }
  return null;
}

// Menu sem numeros ("❯ No, exit" / "  Yes, I trust this folder"), com "Enter to confirm"
// logo abaixo. Escolhe-se com as setas; `selecionada` diz onde o marcador esta agora.
function menuSemNumero(ls, fim) {
  for (let i = fim; i >= Math.max(0, fim - 24); i--) {
    const m = /^\s*❯\s+(\S.*)$/.exec(ls[i]);
    if (!m) continue;
    const col = ls[i].lastIndexOf(m[1]);
    // opcoes irmas: o texto comeca na mesma coluna e antes dela so ha espaco
    const irma = (l) => l != null && l.length > col && l[col] !== ' ' && !l.slice(0, col).trim();
    let topo = i;
    let base = i;
    while (topo > 0 && irma(ls[topo - 1])) topo--;
    while (base < ls.length - 1 && irma(ls[base + 1])) base++;
    if (base === topo || base - topo > 8) return null;
    if (!/Enter to confirm|Esc to cancel/i.test(ls.slice(base + 1, base + 4).join(' '))) return null;
    const opcoes = [];
    for (let k = topo; k <= base; k++) opcoes.push({ tecla: String(opcoes.length + 1), rotulo: (k === i ? m[1] : ls[k].slice(col)).trim().slice(0, 120) });
    return { opcoes, topo, menu: true, selecionada: i - topo };
  }
  return null;
}

// Procura, na parte de baixo da tela, uma pergunta do Claude Code para o app oferecer como botoes.
export function readPrompt(lines) {
  const ls = lines.map(limpa);
  let fim = ls.length - 1;
  while (fim >= 0 && !ls[fim].trim()) fim--;
  const achado = menuNumerado(ls, fim) || menuSemNumero(ls, fim);
  if (!achado) return null;
  const { opcoes, topo } = achado;
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
  // Tudo o que a tela mostra acima das opcoes: num pedido de permissao que caiu no
  // terminal, o comando inteiro tem de aparecer no celular antes do botao de aceitar.
  let ini = Math.max(0, topo - 40);
  while (ini < topo && !ls[ini].trim()) ini++;
  const contexto = ls.slice(ini, topo).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd().slice(-4000);
  // Opcoes que deixam uma permissao valendo para sempre pedem um segundo toque.
  for (const o of opcoes) if (/don.?t ask again|always|allow all|sempre/i.test(o.rotulo)) o.confirmar = true;
  const p = { titulo: titulo.join(' ').slice(0, 300), opcoes, contexto };
  if (achado.menu) Object.assign(p, { menu: true, selecionada: achado.selecionada });
  return p;
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
  // Retomar uma conversa existente (por exemplo, do Claude desktop) e carregar os ganchos do claudeV
  // sem mexer nas configuracoes de sempre.
  if (opts.resume) args.push('--resume', opts.resume);
  if (opts.settings) args.push('--settings', opts.settings);
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
    // NoDefaultCurrentDirectoryInExePath: o cmd.exe nao executa um claude.cmd plantado na pasta do projeto.
    env: { ...process.env, ...opts.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', NoDefaultCurrentDirectoryInExePath: '1' },
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

  // Mensagens do celular esperam a caixa de mensagem do Claude Code aparecer na tela:
  // uma linha que comeca com o marcador de entrada e nao e opcao numerada de menu.
  const fila = [];
  let digitando = false;
  const CAIXA = /^\s*[❯>][\s ](?!\d[.)]\s)/;
  // Com um menu aberto (confiar na pasta, permissao...) nao e caixa de mensagem: o Enter escolheria uma opcao.
  const pronto = () => {
    const ls = snapshot().lines;
    return ls.some((l) => CAIXA.test(l)) && !readPrompt(ls);
  };
  function esvaziar() {
    if (digitando || !fila.length || !alive) return;
    if (!pronto()) return void setTimeout(esvaziar, 300);
    digitando = true;
    const t = fila.shift();
    // Limpa a caixa antes: depois de Interromper, o Claude Code devolve a ultima mensagem para ela.
    // ponytail: Ctrl+U apaga so a linha atual; sobra de varias linhas ainda grudaria.
    write('\x15');
    if (!t.includes('\n') && t.length <= 400) write(t);
    else if (term.modes.bracketedPasteMode) write(`\x1b[200~${t}\x1b[201~`);
    else write(t.replace(/\n/g, ' '));
    // Enter so depois que o texto aparecer na caixa (ou 2 s, o que vier antes).
    const inicio = t.replace(/\s+/g, ' ').slice(0, 12);
    const t0 = Date.now();
    const enter = () => {
      const tela = snapshot().lines.join('\n');
      if (Date.now() - t0 < 2000 && !tela.includes(inicio) && !tela.includes('[Pasted')) return void setTimeout(enter, 100);
      write('\r');
      setTimeout(() => {
        digitando = false;
        esvaziar();
      }, 800);
    };
    setTimeout(enter, 150);
  }

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
      // No Windows o terminal (ConPTY) segura um Esc sozinho esperando o resto de uma sequencia;
      // mandado como tecla do Windows (win32-input-mode: aperta e solta), ele chega na hora.
      if (name === 'esc' && process.platform === 'win32' && !opts.command) return write('\x1b[27;1;27;1;0;1_\x1b[27;1;27;0;0;1_'), true;
      if (KEYS[name]) return write(KEYS[name]), true;
      // Botao de um menu sem numeros: anda com as setas ate a opcao e confirma.
      const menu = /^[1-9]$/.test(name) ? readPrompt(snapshot().lines) : null;
      if (menu?.menu) {
        const passos = Number(name) - 1 - menu.selecionada;
        const seta = `\x1b${term.modes.applicationCursorKeysMode ? 'O' : '['}${passos > 0 ? 'B' : 'A'}`;
        write(seta.repeat(Math.abs(passos)));
        setTimeout(() => write('\r'), 150);
        return true;
      }
      if (/^[a-z0-9]$/i.test(name)) return write(name), true;
      return false;
    },
    // Digita um texto e aperta Enter, como o usuario faria no teclado.
    // Espera a caixa de mensagem existir: logo ao abrir (ou enquanto o Claude Code se atualiza)
    // o texto digitado se perderia.
    send(text) {
      const t = cleanText(text).trim();
      if (!t) return false;
      fila.push(t);
      esvaziar();
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
