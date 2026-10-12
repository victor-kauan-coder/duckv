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
// No Windows o ConPTY entrega o Shift+Tab como um Tab comum; o Claude Code aceita Alt+M para trocar o modo.
const TROCA_MODO = process.platform === 'win32' ? '\x1bm' : KEYS['shift-tab'];

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
  const opcao = /^\s*([❯›>▶●]\s*)?(\d)[.)]\s+(\S.*)$/;
  for (let i = fim; i >= Math.max(0, fim - 24); i--) {
    if (!opcao.test(ls[i])) continue;
    // sobe ate o inicio do bloco de opcoes (linhas de descricao indentadas sao toleradas)
    const opcoes = [];
    let marcado = false;
    let j = i;
    let topo = i;
    let detalhe = [];
    while (j >= 0) {
      const m = opcao.exec(ls[j]);
      if (m) {
        const o = { tecla: m[2], rotulo: m[3].trim().slice(0, 120) };
        // As linhas indentadas logo abaixo explicam a opcao (perguntas do AskUserQuestion).
        if (detalhe.length) o.detalhe = detalhe.join(' ').replace(/\s+/g, ' ').trim().slice(0, 240);
        // "Type something." e parecidas: a resposta e escrita, nao escolhida.
        if (/^(type something|other|outro|digite)/i.test(o.rotulo)) o.livre = true;
        opcoes.unshift(o);
        detalhe = [];
        if (m[1]) marcado = true;
        topo = j;
      } else if (/^\s{3,}\S/.test(ls[j])) detalhe.unshift(ls[j].trim());
      else if (ls[j].trim()) break;
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

// Pergunta de sim ou nao no fim da tela, como a do Cline: Approve tool "editor" {...} [y/N]
function simNao(ls, fim) {
  for (let i = fim; i >= Math.max(0, fim - 3); i--) {
    if (!/\[y\/N\]\s*$/i.test(ls[i])) continue;
    let ini = i;
    while (ini > 0 && ls[ini - 1].trim() && i - ini < 12) ini--;
    const titulo = /Approve tool "([^"]+)"/.exec(ls.slice(ini, i + 1).join(' '));
    return {
      titulo: titulo ? `Aprovar a ferramenta ${titulo[1]}?` : ls[i].replace(/\[y\/N\]\s*$/i, '').trim().slice(0, 300),
      opcoes: [
        { tecla: 'y', rotulo: 'Sim, pode' },
        { tecla: 'n', rotulo: 'Não' },
      ],
      contexto: ls.slice(Math.max(0, ini - 20), i + 1).join('\n').trim().slice(-4000),
      simNao: true,
    };
  }
  return null;
}

// Procura, na parte de baixo da tela, uma pergunta do agente para o app oferecer como botoes.
export function readPrompt(lines) {
  const ls = lines.map(limpa);
  let fim = ls.length - 1;
  while (fim >= 0 && !ls[fim].trim()) fim--;
  const sn = simNao(ls, fim);
  if (sn) return sn;
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
// "claude auth login" numa pasta de conta, sem janela: devolve o link de entrada que ele mostra
// e depois recebe o codigo que a pagina da Anthropic exibe ao fim do login.
export function loginConta(dir) {
  if (!pty) throw new Error(`Terminal virtual indisponivel neste computador: ${loadError}`);
  const win = process.platform === 'win32';
  const proc = pty.spawn(win ? process.env.ComSpec || 'cmd.exe' : 'claude', win ? ['/d', '/c', 'claude', 'auth', 'login'] : ['auth', 'login'], {
    name: 'xterm-256color',
    cols: 400,
    rows: 30,
    cwd: dir,
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir, BROWSER: 'none', NoDefaultCurrentDirectoryInExePath: '1' },
  });
  let saida = '';
  let fim = null;
  const terminou = new Promise((r) => proc.onExit(({ exitCode }) => r((fim = exitCode))));
  const url = new Promise((resolve, reject) => {
    const d = proc.onData((t) => {
      saida = (saida + t).slice(-20000);
      const m = /https:\/\/[a-z.]*claude\.(?:com|ai)\/[^\s\x07\x1b"'<>]*oauth\/authorize\?[^\s\x07\x1b"'<>]+/.exec(saida);
      if (m) {
        d.dispose();
        resolve(m[0]);
      }
    });
    terminou.then(() => reject(new Error('O Claude Code fechou antes de mostrar o link de entrada. ' + saida.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, '').trim().slice(-300))));
    setTimeout(() => reject(new Error('O Claude Code não mostrou o link de entrada.')), 30000);
  });
  return {
    url,
    async codigo(c) {
      if (fim !== null) return false;
      proc.write(`${c}\r`);
      const r = await Promise.race([terminou, new Promise((ok) => setTimeout(() => ok('tempo'), 30000))]);
      return r === 0;
    },
    fechar: () => {
      try {
        proc.kill();
      } catch {
        /* ja fechou */
      }
    },
  };
}

export function startHosted(opts) {
  if (!pty) throw new Error(`Terminal virtual indisponivel neste computador: ${loadError}`);
  const cols = Math.max(40, Math.min(160, opts.cols || 60));
  const rows = Math.max(16, Math.min(60, opts.rows || 32));

  // Programa e argumentos vem montados pelo adaptador do agente (hub/agentes.mjs).
  const bin = opts.bin || 'claude';
  const args = opts.args || [];

  const custom = opts.command; // [programa, ...argumentos], usado nos testes e em instalacoes fora do padrao
  let file;
  let argv;
  if (custom?.length) {
    file = custom[0];
    argv = [...custom.slice(1), ...args];
  } else if (process.platform === 'win32') {
    // cmd.exe encontra tanto o .exe quanto o .cmd instalado pelo npm.
    file = process.env.ComSpec || 'cmd.exe';
    // Sem /s: como o comando nao comeca com aspas, o cmd preserva as aspas dos argumentos.
    argv = ['/d', '/c', bin, ...args];
  } else {
    file = bin;
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
    return { lines, cx: buf.cursorX, cy: buf.cursorY, cols: term.cols, rows: term.rows, links: links() };
  }
  // Links que aparecem na tela (o de login, por exemplo). Linhas quebradas pelo terminal sao juntadas
  // antes, porque um link longo ocupa varias linhas de uma tela estreita.
  function links() {
    const buf = term.buffer.active;
    const juntas = [];
    for (let y = 0; y < buf.length; y++) {
      const l = buf.getLine(y);
      if (!l) continue;
      const s = l.translateToString(true);
      if (l.isWrapped && juntas.length) juntas[juntas.length - 1] += s;
      else juntas.push(s);
    }
    const achados = [];
    for (const s of juntas) {
      for (const m of s.matchAll(/https?:\/\/[^\s"'<>│┃]+/g)) {
        const u = m[0].replace(/[.,;)]+$/, '');
        if (!achados.includes(u)) achados.push(u);
      }
    }
    return achados.slice(-3);
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
  // Mensagem esperando a caixa ha muito tempo: avisa uma vez, com o que a tela mostra, em vez de esperar calada.
  let esperaDesde = 0;
  let avisouEspera = false;
  const CAIXA = opts.caixa || /^\s*[❯>][\s ](?!\d[.)]\s)/;
  // Com um menu aberto (confiar na pasta, permissao...) nao e caixa de mensagem: o Enter escolheria uma opcao.
  const pronto = () => {
    const ls = snapshot().lines;
    return ls.some((l) => CAIXA.test(l)) && !readPrompt(ls);
  };
  function esvaziar() {
    if (digitando || !fila.length || !alive) return;
    if (!pronto()) {
      esperaDesde ||= Date.now();
      if (!avisouEspera && Date.now() - esperaDesde > 12000) {
        avisouEspera = true;
        const tela = snapshot().lines.map((l) => l.trim()).filter(Boolean);
        opts.onEspera?.(fila.length, tela.slice(-6));
      }
      return void setTimeout(esvaziar, 300);
    }
    esperaDesde = 0;
    avisouEspera = false;
    digitando = true;
    const t = fila.shift();
    // Limpa a caixa antes: depois de Interromper, o Claude Code devolve a ultima mensagem para ela.
    // Limite: Ctrl+U apaga so a linha atual; sobra de varias linhas ainda grudaria.
    write('\x15');
    if (!t.includes('\n') && t.length <= 400) write(t);
    else if (term.modes.bracketedPasteMode) write(`\x1b[200~${t}\x1b[201~`);
    else write(t.replace(/\n/g, ' '));
    // Enter so depois que o texto aparecer na caixa (ou 2 s, o que vier antes).
    const inicio = t.replace(/\s+/g, ' ').slice(0, 12);
    const t0 = Date.now();
    // A mensagem ainda esta na caixa de entrada (e nao so na conversa, acima dela)?
    const naCaixa = () => {
      const ls = snapshot().lines;
      // A caixa e a ultima linha com o marcador; as de cima sao mensagens ja enviadas.
      // Com um menu aberto, um Enter a mais escolheria uma opcao: nao repete.
      if (readPrompt(ls)) return false;
      const i = ls.findLastIndex((l) => CAIXA.test(l));
      return i >= 0 && ls.slice(i, i + 6).join(' ').replace(/\s+/g, ' ').includes(inicio);
    };
    let tentativas = 0;
    const enter = () => {
      const tela = snapshot().lines.join('\n');
      if (Date.now() - t0 < 2000 && !tela.includes(inicio) && !tela.includes('[Pasted')) return void setTimeout(enter, 100);
      write('\r');
      // Texto longo chega como "colado" e o Claude Code as vezes ignora o Enter logo depois: confere e repete.
      setTimeout(() => {
        if (alive && ++tentativas < 4 && naCaixa()) return enter();
        digitando = false;
        esvaziar();
      }, 700);
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
      if (name === 'shift-tab') return write(TROCA_MODO), true;
      if (KEYS[name]) return write(KEYS[name]), true;
      // Pergunta de sim ou nao: a letra e o Enter.
      if (/^[yn]$/.test(name) && readPrompt(snapshot().lines)?.simNao) return write(name), setTimeout(() => write('\r'), 120), true;
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
    // Troca o modo de permissao como no teclado: Shift+Tab ate o rodape mostrar o modo pedido.
    // Resolve com o modo em que parou, ou null se o rodape nunca mostrou o pedido.
    async modo(alvo) {
      const atual = () => {
        // so o rodape: a conversa na tela pode citar esses nomes
        const t = readFooter(snapshot().lines);
        if (/bypass permissions on/i.test(t)) return 'bypassPermissions';
        if (/accept edits on/i.test(t)) return 'acceptEdits';
        if (/plan mode on/i.test(t)) return 'plan';
        if (/auto mode on/i.test(t)) return 'auto';
        return 'manual';
      };
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 6 && alive; i++) {
        if (atual() === alvo) return alvo;
        write(TROCA_MODO);
        await espera(350);
        // pular todas as permissoes nunca fica ligado por causa do celular, nem de passagem
        if (atual() === 'bypassPermissions' && alvo !== 'bypassPermissions') {
          write(TROCA_MODO);
          await espera(350);
        }
      }
      return atual() === alvo ? alvo : null;
    },
    // Digita um texto e aperta Enter, como o usuario faria no teclado.
    // Resposta escrita para uma pergunta do Claude: escolhe a opcao de escrever, digita e confirma.
    responder(tecla, texto) {
      const t = cleanText(texto).replace(/\s+/g, ' ').trim().slice(0, 2000);
      if (!/^[1-9]$/.test(tecla) || !t) return false;
      write(tecla);
      setTimeout(() => write(t), 300);
      setTimeout(() => write('\r'), 300 + 250 + Math.min(1500, t.length * 2));
      return true;
    },
    // Digita um texto qualquer onde o cursor estiver e aperta Enter (codigo de login, por exemplo).
    digitar(texto) {
      const t = cleanText(texto).replace(/\n/g, ' ').trim().slice(0, 4000);
      if (!t) return false;
      write(t);
      setTimeout(() => write('\r'), 200 + Math.min(1500, t.length * 2));
      return true;
    },
    // Espera a caixa de mensagem existir: logo ao abrir (ou enquanto o Claude Code se atualiza)
    // o texto digitado se perderia.
    send(text) {
      const t = cleanText(text).trim();
      if (!t) return false;
      fila.push(t);
      esvaziar();
      return true;
    },
    pendentes: () => fila.length,
    // Tira da fila o que ainda nao foi digitado (o celular desistiu de mandar).
    desistir() {
      const n = fila.length;
      fila.length = 0;
      esperaDesde = 0;
      avisouEspera = false;
      return n;
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
