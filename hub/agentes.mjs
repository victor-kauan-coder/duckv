// Os agentes de codigo que o duckV sabe abrir. Cada um diz como abrir no terminal virtual,
// o que o celular pode escolher (sempre de listas fechadas: nenhuma flag livre chega do celular),
// como saber quem esta logado e como ler as conversas que ele grava.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ler = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};
const lerJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const clip = (s, n) => {
  s = String(s ?? '').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const ts = (v) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v) || Date.now());
const jwt = (t) => {
  try {
    return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};
// Arquivos de uma pasta (com subpastas) mais novos que `desde`, do mais novo para o mais velho.
function arquivos(dir, teste, desde = 0, prof = 4, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (prof > 0) arquivos(f, teste, desde, prof - 1, out);
    } else if (teste(e.name)) {
      try {
        const st = fs.statSync(f);
        if (st.mtimeMs >= desde) out.push({ file: f, mtime: st.mtimeMs, size: st.size });
      } catch {
        /* sumiu */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
const linhasJson = (txt) =>
  String(txt || '')
    .split('\n')
    .map((l) => {
      try {
        return l.trim() ? JSON.parse(l) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
const mesmaPasta = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// ------------------------------------------------------------------ Claude Code
// O Claude Code continua com o caminho completo de sempre (ganchos, canal, historico em hub/transcript.mjs).
const claude = {
  id: 'claude',
  nome: 'Claude Code',
  curto: 'Claude',
  empresa: 'Anthropic',
  cor: '#D97757',
  bin: 'claude',
  pacote: '@anthropic-ai/claude-code',
  env: (dir, padrao) => (padrao ? {} : { CLAUDE_CONFIG_DIR: dir }),
  modelos: [
    ['default', 'Padrão da conta'],
    ['best', 'O melhor disponível'],
    ['fable', 'Fable'],
    ['opus', 'Opus'],
    ['sonnet', 'Sonnet'],
    ['haiku', 'Haiku'],
    ['opusplan', 'Opus para planejar'],
  ],
  esforcos: [
    ['low', 'Baixo'],
    ['medium', 'Médio'],
    ['high', 'Alto'],
    ['xhigh', 'Extra alto'],
    ['max', 'Máximo'],
  ],
  // De proposito, o modo que pula todas as permissoes nao existe aqui.
  modos: [
    ['manual', 'Perguntar sempre'],
    ['acceptEdits', 'Aceitar edições'],
    ['plan', 'Só planejar'],
    ['auto', 'Automático'],
  ],
  comandos: ['/model', '/effort', '/compact', '/clear', '/login', '/status', '/cost', '/usage', '/context', '/help', '/init', '/resume', '/rename', '/review'],
  args({ model, effort, mode, resume, name, settings }) {
    const a = [];
    if (resume) a.push('--resume', resume);
    if (settings) a.push('--settings', settings);
    if (model && model !== 'default') a.push('--model', model);
    if (effort) a.push('--effort', effort);
    if (mode) a.push('--permission-mode', mode === 'manual' ? 'default' : mode);
    if (name) a.push('--name', name);
    return a;
  },
  caixa: /^\s*[❯>][\s ](?!\d[.)]\s)/,
  conta(dir, padrao) {
    const o = lerJson(padrao ? path.join(os.homedir(), '.claude.json') : path.join(dir, '.claude.json'))?.oauthAccount;
    return o?.emailAddress ? { email: o.emailAddress, uuid: o.accountUuid || null } : null;
  },
};

// ------------------------------------------------------------------ Codex (OpenAI)
const codexHome = (dir, padrao) => (padrao ? path.join(os.homedir(), '.codex') : dir);
const codex = {
  id: 'codex',
  nome: 'Codex',
  curto: 'Codex',
  empresa: 'OpenAI',
  cor: '#10A37F',
  bin: 'codex',
  pacote: '@openai/codex',
  // Login guardado em arquivo dentro da pasta da conta (e nao no cofre do Windows, que e um so).
  env: (dir, padrao) => (padrao ? {} : { CODEX_HOME: dir }),
  preparar(dir) {
    const f = path.join(dir, 'config.toml');
    const t = ler(f) || '';
    if (!/cli_auth_credentials_store/.test(t)) fs.writeFileSync(f, `cli_auth_credentials_store = "file"\n${t}`);
  },
  modelos: [
    ['default', 'Padrão da conta'],
    ['gpt-6.1', 'GPT-6.1'],
    ['gpt-6', 'GPT-6'],
    ['gpt-5.6', 'GPT-5.6'],
  ],
  esforcos: [
    ['low', 'Baixo'],
    ['medium', 'Médio'],
    ['high', 'Alto'],
    ['xhigh', 'Extra alto'],
  ],
  // Sempre pede aprovacao; o celular nao liga o modo sem sandbox nem o "nunca perguntar".
  modos: [
    ['manual', 'Perguntar, pode editar a pasta'],
    ['leitura', 'Só ler, sem editar'],
  ],
  comandos: ['/model', '/status', '/compact', '/new', '/diff', '/review', '/init', '/mention', '/help'],
  args({ model, effort, mode, resume }) {
    const a = [];
    if (resume) a.push('resume', resume);
    if (model && model !== 'default') a.push('-m', model);
    if (effort) a.push('-c', `model_reasoning_effort="${effort}"`);
    a.push('-a', 'on-request', '-s', mode === 'leitura' ? 'read-only' : 'workspace-write');
    return a;
  },
  login: ['login', '--device-auth'],
  caixa: /^\s*›\s/,
  conta(dir, padrao) {
    const a = lerJson(path.join(codexHome(dir, padrao), 'auth.json'));
    if (!a) return null;
    if (a.OPENAI_API_KEY) return { email: 'Chave de API', plano: 'api' };
    const c = jwt(a.tokens?.id_token);
    if (!c) return null;
    const auth = c['https://api.openai.com/auth'] || {};
    return { email: c.email || c['https://api.openai.com/profile']?.email || 'ChatGPT', plano: auth.chatgpt_plan_type || null };
  },
  sessoes: {
    pasta: (dir, padrao) => path.join(codexHome(dir, padrao), 'sessions'),
    lista(dir, padrao) {
      return arquivos(this.pasta(dir, padrao), (n) => /^rollout-.*\.jsonl$/.test(n)).map((a) => {
        const cab = lerJson1(a.file);
        return { sid: cab?.payload?.id || /([0-9a-f-]{36})\.jsonl$/.exec(a.file)?.[1], file: a.file, mtime: a.mtime, cwd: cab?.payload?.cwd || null };
      });
    },
    nova(dir, padrao, cwd, desde) {
      return this.lista(dir, padrao).find((s) => s.mtime >= desde && mesmaPasta(s.cwd, cwd)) || null;
    },
    titulo(file) {
      for (const e of linhasJson(ler(file))) if (e.type === 'event_msg' && e.payload?.type === 'user_message' && e.payload.message) return clip(e.payload.message.replace(/\s+/g, ' '), 70);
      return null;
    },
    ler(file) {
      const items = [];
      let uso = null;
      let limites = null;
      linhasJson(ler(file)).forEach((e, n) => {
        const p = e.payload || {};
        const quando = ts(e.timestamp);
        if (e.type === 'event_msg' && p.type === 'user_message' && p.message) items.push({ id: `cx:${n}`, role: 'user', text: clip(p.message, 8000), ts: quando });
        else if (e.type === 'event_msg' && p.type === 'agent_message' && p.message) items.push({ id: `cx:${n}`, role: 'assistant', text: clip(p.message, 8000), ts: quando });
        else if (e.type === 'event_msg' && p.type === 'exec_command_end') {
          const cmd = Array.isArray(p.command) ? p.command.join(' ') : String(p.command || '');
          items.push({ id: `cx:${n}`, role: 'tool', tool: 'Shell', text: clip(cmd, 140), ts: quando });
        } else if (e.type === 'response_item' && (p.type === 'custom_tool_call' || (p.type === 'function_call' && p.name !== 'shell'))) {
          items.push({ id: `cx:${n}`, role: 'tool', tool: p.name || 'Ferramenta', text: clip(typeof p.input === 'string' ? p.input.split('\n')[0] : p.arguments || '', 140), ts: quando });
        } else if (e.type === 'event_msg' && p.type === 'token_count') {
          const t = p.info?.total_token_usage;
          if (t) uso = { in: t.input_tokens - (t.cached_input_tokens || 0), out: t.output_tokens || 0, cw: 0, cr: t.cached_input_tokens || 0, janela: p.info.model_context_window || null, ultimo: p.info.last_token_usage?.input_tokens || null };
          if (p.rate_limits) limites = p.rate_limits;
        }
      });
      return { items, uso, limites };
    },
  },
  // Uso da conta: o Codex grava os limites (5 horas e semana) junto com o historico.
  limites(dir, padrao) {
    for (const a of arquivos(this.sessoes.pasta(dir, padrao), (n) => /^rollout-.*\.jsonl$/.test(n)).slice(0, 3)) {
      const r = this.sessoes.ler(a.file).limites;
      if (r) return r;
    }
    return null;
  },
  resume: (sid) => ({ resume: sid }),
};
function lerJson1(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(16384);
    const n = fs.readSync(fd, b, 0, b.length, 0);
    fs.closeSync(fd);
    return JSON.parse(b.subarray(0, n).toString('utf8').split('\n')[0]);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Gemini CLI (Google)
const geminiHome = (dir, padrao) => path.join(padrao ? os.homedir() : dir, '.gemini');
const gemini = {
  id: 'gemini',
  nome: 'Gemini CLI',
  curto: 'Gemini',
  empresa: 'Google',
  cor: '#4C8DF6',
  bin: 'gemini',
  pacote: '@google/gemini-cli',
  // NO_BROWSER: o login mostra o link (para abrir no celular) e pede o codigo da pagina.
  env: (dir, padrao) => ({ ...(padrao ? {} : { GEMINI_CLI_HOME: dir }), NO_BROWSER: '1' }),
  preparar(dir) {
    const f = path.join(dir, '.gemini', 'settings.json');
    const s = lerJson(f) || {};
    if (!s.security?.auth?.selectedType) {
      s.security = { ...(s.security || {}), auth: { ...(s.security?.auth || {}), selectedType: 'oauth-personal' } };
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(s, null, 2));
    }
  },
  modelos: [
    ['default', 'Padrão da conta'],
    ['auto', 'Automático'],
    ['pro', 'Pro'],
    ['flash', 'Flash'],
    ['flash-lite', 'Flash-Lite'],
  ],
  esforcos: [],
  // Sem o "yolo": aprovar tudo sozinho nao existe pelo celular.
  modos: [
    ['manual', 'Perguntar sempre'],
    ['auto_edit', 'Aceitar edições'],
    ['plan', 'Só planejar'],
  ],
  comandos: ['/model', '/stats', '/compress', '/clear', '/chat', '/memory', '/tools', '/help', '/about', '/auth', '/resume'],
  args({ model, mode, resume, sessao }) {
    const a = [];
    if (resume) a.push('--resume', resume);
    else if (sessao) a.push('--session-id', sessao);
    if (model && model !== 'default') a.push('-m', model);
    a.push('--approval-mode', mode === 'auto_edit' || mode === 'plan' ? mode : 'default');
    return a;
  },
  // Cada sessao nova ganha um id escolhido aqui, para achar o arquivo dela sem adivinhar.
  novaSessao: () => crypto.randomUUID(),
  login: [],
  caixa: /^\s*>\s/,
  conta(dir, padrao) {
    const h = geminiHome(dir, padrao);
    const email = lerJson(path.join(h, 'google_accounts.json'))?.active;
    if (email && fs.existsSync(path.join(h, 'oauth_creds.json'))) return { email };
    return null;
  },
  sessoes: {
    lista(dir, padrao) {
      return arquivos(path.join(geminiHome(dir, padrao), 'tmp'), (n) => /^session-.*\.jsonl$/.test(n), 0, 3).map((a) => {
        const cab = lerJson1(a.file);
        return { sid: cab?.sessionId, file: a.file, mtime: a.mtime, cwd: cab?.directories?.[0] || null };
      });
    },
    nova(dir, padrao, cwd, desde, sessao) {
      return this.lista(dir, padrao).find((s) => (sessao ? s.sid === sessao : s.mtime >= desde)) || null;
    },
    titulo(file) {
      for (const m of this.mensagens(file)) if (m.type === 'user') return clip(textoGemini(m).replace(/\s+/g, ' '), 70);
      return null;
    },
    // O arquivo regrava a mensagem inteira a cada mudanca: vale a ultima versao de cada id.
    mensagens(file) {
      const porId = new Map();
      for (const e of linhasJson(ler(file)).slice(1)) if (e.id && e.type) porId.set(e.id, e);
      return [...porId.values()];
    },
    ler(file) {
      const items = [];
      let uso = null;
      const t = { in: 0, out: 0, cw: 0, cr: 0 };
      for (const m of this.mensagens(file)) {
        const quando = ts(m.timestamp);
        if (m.type === 'user') {
          const txt = textoGemini(m);
          if (txt) items.push({ id: `gm:${m.id}`, role: 'user', text: clip(txt, 8000), ts: quando });
        } else if (m.type === 'gemini') {
          (m.toolCalls || []).forEach((c, k) => items.push({ id: `gm:${m.id}:t${k}`, role: 'tool', tool: c.displayName || c.name || 'Ferramenta', text: clip(c.description || Object.values(c.args || {}).find((v) => typeof v === 'string') || '', 140), ts: quando }));
          const txt = textoGemini(m);
          if (txt) items.push({ id: `gm:${m.id}`, role: 'assistant', text: clip(txt, 8000), ts: quando });
          if (m.tokens) {
            t.in += m.tokens.input || 0;
            t.out += m.tokens.output || 0;
            t.cr += m.tokens.cached || 0;
            uso = { ...t, ultimo: m.tokens.input || null };
          }
        }
      }
      return { items, uso, limites: null };
    },
  },
  resume: (sid) => ({ resume: sid }),
};
function textoGemini(m) {
  const c = m.displayContent ?? m.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('').trim();
  return '';
}

// ------------------------------------------------------------------ OpenCode
const ocBase = (dir, padrao) =>
  padrao
    ? { data: path.join(os.homedir(), '.local', 'share'), config: path.join(os.homedir(), '.config'), state: path.join(os.homedir(), '.local', 'state'), cache: path.join(os.homedir(), '.cache') }
    : { data: path.join(dir, 'data'), config: path.join(dir, 'config'), state: path.join(dir, 'state'), cache: path.join(dir, 'cache') };
let sqlite = null;
try {
  // Leitor de SQLite do proprio Node (22.13+). Sem ele, a conversa do OpenCode fica so na tela do terminal.
  const prev = process.emitWarning;
  process.emitWarning = () => {};
  sqlite = (await import('node:sqlite')).DatabaseSync;
  process.emitWarning = prev;
} catch {
  sqlite = null;
}
function ocConsulta(dir, padrao, sql, ...params) {
  const f = path.join(ocBase(dir, padrao).data, 'opencode', 'opencode.db');
  if (!sqlite || !fs.existsSync(f)) return [];
  let db;
  try {
    db = new sqlite(f, { readOnly: true });
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  } finally {
    try {
      db?.close();
    } catch {
      /* ja fechado */
    }
  }
}
const opencode = {
  id: 'opencode',
  nome: 'OpenCode',
  curto: 'OpenCode',
  empresa: 'código aberto',
  cor: '#8B93A7',
  bin: 'opencode',
  pacote: 'opencode-ai',
  env(dir, padrao) {
    const b = ocBase(dir, padrao);
    return {
      ...(padrao ? {} : { XDG_DATA_HOME: b.data, XDG_CONFIG_HOME: b.config, XDG_STATE_HOME: b.state, XDG_CACHE_HOME: b.cache }),
      // Tudo pede permissao, exceto ler; nada fora da pasta do projeto; nada publicado na internet.
      OPENCODE_PERMISSION: JSON.stringify({ '*': 'ask', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow', external_directory: 'deny' }),
      OPENCODE_DISABLE_SHARE: '1',
      OPENCODE_DISABLE_AUTOUPDATE: '1',
    };
  },
  modelos: [['default', 'Padrão da conta']],
  esforcos: [],
  modos: [
    ['build', 'Construir (pede permissão)'],
    ['plan', 'Só planejar'],
  ],
  comandos: ['/models', '/new', '/sessions', '/compact', '/help', '/undo', '/redo', '/init', '/connect'],
  args({ mode, resume }) {
    const a = [];
    if (resume) a.push('-s', resume);
    a.push('--agent', mode === 'plan' ? 'plan' : 'build');
    return a;
  },
  login: ['auth', 'login'],
  caixa: /^\s*┃\s/,
  conta(dir, padrao) {
    const a = lerJson(path.join(ocBase(dir, padrao).data, 'opencode', 'auth.json'));
    const prov = a && Object.keys(a);
    // Sem login nenhum ele ainda funciona com os modelos gratuitos do OpenCode Zen.
    return prov?.length ? { email: prov.join(', '), plano: null } : { email: 'OpenCode Zen (gratuito)', plano: 'gratuito' };
  },
  sessoes: {
    lista(dir, padrao) {
      return ocConsulta(dir, padrao, 'select id, directory, title, time_updated from session where parent_id is null order by time_updated desc limit 120').map((s) => ({
        sid: s.id,
        file: `opencode:${s.id}`,
        mtime: ts(s.time_updated),
        cwd: s.directory,
        titulo: s.title,
      }));
    },
    nova(dir, padrao, cwd, desde) {
      return this.lista(dir, padrao).find((s) => s.mtime >= desde - 5000 && mesmaPasta(s.cwd, cwd)) || null;
    },
    titulo: () => null,
    ler(file, dir, padrao) {
      const sid = String(file).replace(/^opencode:/, '');
      const msgs = ocConsulta(dir, padrao, 'select id, data from message where session_id = ? order by id', sid);
      const partes = ocConsulta(dir, padrao, 'select id, message_id, data from part where session_id = ? order by id', sid);
      const porMsg = new Map();
      for (const p of partes) {
        try {
          (porMsg.get(p.message_id) || porMsg.set(p.message_id, []).get(p.message_id)).push({ id: p.id, ...JSON.parse(p.data) });
        } catch {
          /* parte invalida */
        }
      }
      const items = [];
      const t = { in: 0, out: 0, cw: 0, cr: 0 };
      let uso = null;
      for (const m of msgs) {
        let info;
        try {
          info = JSON.parse(m.data);
        } catch {
          continue;
        }
        const quando = ts(info.time?.created);
        for (const p of porMsg.get(m.id) || []) {
          if (p.type === 'text' && p.text?.trim() && !p.synthetic) items.push({ id: `oc:${p.id}`, role: info.role === 'user' ? 'user' : 'assistant', text: clip(p.text, 8000), ts: quando });
          else if (p.type === 'tool') items.push({ id: `oc:${p.id}`, role: 'tool', tool: p.tool || 'Ferramenta', text: clip(p.state?.title || Object.values(p.state?.input || {}).find((v) => typeof v === 'string') || '', 140), ts: quando });
        }
        if (info.role === 'assistant' && info.tokens) {
          t.in += info.tokens.input || 0;
          t.out += info.tokens.output || 0;
          t.cr += info.tokens.cache?.read || 0;
          t.cw += info.tokens.cache?.write || 0;
          uso = { ...t, ultimo: (info.tokens.input || 0) + (info.tokens.cache?.read || 0) };
        }
      }
      return { items, uso, limites: null };
    },
  },
  resume: (sid) => ({ resume: sid }),
};

// ------------------------------------------------------------------ Cline
const clineData = (dir, padrao) => (padrao ? path.join(os.homedir(), '.cline', 'data') : path.join(dir, 'data'));
const cline = {
  id: 'cline',
  nome: 'Cline',
  curto: 'Cline',
  empresa: 'Cline',
  cor: '#A97CF8',
  bin: 'cline',
  pacote: 'cline',
  env: (dir, padrao) => (padrao ? {} : { CLINE_DIR: dir, CLINE_DATA_DIR: clineData(dir, padrao) }),
  modelos: [['default', 'Padrão da conta']],
  esforcos: [
    ['none', 'Sem raciocínio'],
    ['low', 'Baixo'],
    ['medium', 'Médio'],
    ['high', 'Alto'],
    ['xhigh', 'Extra alto'],
  ],
  modos: [
    ['act', 'Agir (pede permissão)'],
    ['plan', 'Só planejar'],
  ],
  comandos: ['/help', '/clear', '/compact', '/model', '/settings', '/history'],
  // O Cline aprova tudo sozinho por padrao: aqui a aprovacao automatica e sempre desligada.
  args({ effort, mode, resume }) {
    const a = ['--auto-approve', 'false'];
    if (resume) a.push('--id', resume);
    if (effort) a.push('--thinking', effort);
    if (mode === 'plan') a.push('--plan');
    return a;
  },
  login: ['auth'],
  caixa: /^\s*[❯>]\s/,
  conta(dir, padrao) {
    // Logado = existe o arquivo de credenciais (so o tamanho e conferido; ele nao e aberto).
    // O provedor aparece sozinho em providers.json mesmo sem login.
    let tam = 0;
    try {
      tam = fs.statSync(path.join(clineData(dir, padrao), 'secrets.json')).size;
    } catch {
      return null;
    }
    if (tam < 10) return null;
    const p = lerJson(path.join(clineData(dir, padrao), 'settings', 'providers.json'));
    const ativo = p?.lastUsedProvider || p?.provider || (p && Object.keys(p.providers || p).find((k) => k !== 'version'));
    return ativo ? { email: String(ativo), plano: null } : null;
  },
  sessoes: {
    lista(dir, padrao) {
      const base = path.join(clineData(dir, padrao), 'sessions');
      let ids = [];
      try {
        ids = fs.readdirSync(base);
      } catch {
        return [];
      }
      return ids
        .map((id) => {
          const man = lerJson(path.join(base, id, `${id}.json`));
          const file = path.join(base, id, `${id}.messages.json`);
          let mtime = 0;
          try {
            mtime = fs.statSync(file).mtimeMs;
          } catch {
            return null;
          }
          return { sid: id, file, mtime, cwd: man?.cwd || null, titulo: man?.metadata?.title || null };
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime);
    },
    nova(dir, padrao, cwd, desde) {
      return this.lista(dir, padrao).find((s) => s.mtime >= desde && mesmaPasta(s.cwd, cwd)) || null;
    },
    titulo(file) {
      const u = (lerJson(file)?.messages || []).find((m) => m.role === 'user');
      return u ? clip(textoCline(u).replace(/\s+/g, ' '), 70) : null;
    },
    ler(file) {
      const items = [];
      const t = { in: 0, out: 0, cw: 0, cr: 0 };
      let uso = null;
      for (const m of lerJson(file)?.messages || []) {
        const quando = ts(m.ts);
        const blocos = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
        blocos.forEach((b, k) => {
          const id = `cl:${m.id}:${k}`;
          if (b.type === 'text' && b.text?.trim()) {
            const txt = m.role === 'user' ? textoCline({ content: [b] }) : b.text.trim();
            if (txt) items.push({ id, role: m.role === 'user' ? 'user' : 'assistant', text: clip(txt, 8000), ts: quando });
          } else if (b.type === 'tool_use') items.push({ id, role: 'tool', tool: b.name || 'Ferramenta', text: clip(Object.values(b.input || {}).flat().find((v) => typeof v === 'string') || '', 140), ts: quando });
        });
        if (m.metrics) {
          t.in += m.metrics.inputTokens || 0;
          t.out += m.metrics.outputTokens || 0;
          t.cr += m.metrics.cacheReadTokens || 0;
          t.cw += m.metrics.cacheWriteTokens || 0;
          uso = { ...t, ultimo: (m.metrics.inputTokens || 0) + (m.metrics.cacheReadTokens || 0) };
        }
      }
      return { items, uso, limites: null };
    },
  },
  resume: (sid) => ({ resume: sid }),
};
// A mensagem do usuario vem embrulhada em <user_input mode="act">…</user_input>.
function textoCline(m) {
  const t = (Array.isArray(m.content) ? m.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const dentro = /<user_input[^>]*>([\s\S]*?)<\/user_input>/.exec(t);
  return (dentro ? dentro[1] : t.replace(/<[a-z_]+[^>]*>[\s\S]*?<\/[a-z_]+>/g, '')).trim();
}

export const AGENTES = { claude, codex, gemini, opencode, cline };
export const agenteDe = (id) => AGENTES[id] || claude;
export const ehAgente = (id) => Object.hasOwn(AGENTES, id);

// O que o celular precisa saber de cada agente para montar as telas.
export function catalogo() {
  return Object.values(AGENTES).map((a) => ({
    id: a.id,
    nome: a.nome,
    curto: a.curto,
    empresa: a.empresa,
    cor: a.cor,
    modelos: a.modelos.map(([id, rotulo]) => ({ id, rotulo })),
    esforcos: a.esforcos.map(([id, rotulo]) => ({ id, rotulo })),
    modos: a.modos.map(([id, rotulo]) => ({ id, rotulo })),
    loginNoTerminal: !!a.login,
  }));
}

// O programa do agente esta instalado neste computador? (cache de 1 minuto)
const instalados = new Map();
export function instalado(agente) {
  const c = instalados.get(agente.id);
  if (c && Date.now() - c.em < 60_000) return c.ok;
  const dirs = String(process.env.PATH || process.env.Path || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.ps1', ''] : [''];
  const ok = dirs.some((d) => exts.some((x) => d && fs.existsSync(path.join(d, agente.bin + x))));
  instalados.set(agente.id, { ok, em: Date.now() });
  return ok;
}
