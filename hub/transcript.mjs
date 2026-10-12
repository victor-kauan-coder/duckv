// Leitura do historico (.jsonl) que o Claude Code grava para cada sessao.
import fs from 'node:fs';
import path from 'node:path';

// Le o historico inteiro ao abrir (conversas longas inclusive); so um arquivo gigante comeca pelo final.
// Teto de 64 MB por historico; acima disso, carregar em pedacos sob demanda.
const MAX_INITIAL = 64 * 1024 * 1024;

// Le apenas o que foi acrescentado ao arquivo desde a ultima leitura.
export class Tail {
  constructor(file) {
    this.file = file;
    this.pos = 0;
    this.rest = Buffer.alloc(0);
    this.first = true;
  }

  read() {
    let st;
    try {
      st = fs.statSync(this.file);
    } catch {
      return [];
    }
    if (st.size < this.pos) {
      this.pos = 0;
      this.rest = Buffer.alloc(0);
    }
    if (st.size === this.pos) return [];
    let start = this.pos;
    let dropFirstLine = false;
    if (this.first && st.size > MAX_INITIAL) {
      start = st.size - MAX_INITIAL;
      dropFirstLine = true;
    }
    this.first = false;
    const buf = Buffer.alloc(st.size - start);
    let fd;
    try {
      fd = fs.openSync(this.file, 'r');
      fs.readSync(fd, buf, 0, buf.length, start);
    } catch {
      return [];
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    this.pos = st.size;
    const all = this.rest.length ? Buffer.concat([this.rest, buf]) : buf;
    const lastNl = all.lastIndexOf(0x0a);
    if (lastNl < 0) {
      this.rest = all;
      return [];
    }
    this.rest = all.subarray(lastNl + 1);
    const lines = all.subarray(0, lastNl).toString('utf8').split('\n');
    if (dropFirstLine) lines.shift();
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* linha incompleta ou corrompida */
      }
    }
    return out;
  }
}

const clip = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';

// Resumo curto de uma chamada de ferramenta, para mostrar no celular.
export function toolSummary(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      return clip(i.description || i.command || '', 140);
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return base(i.file_path || i.notebook_path);
    case 'Glob':
    case 'Grep':
      return clip(i.pattern || '', 80);
    case 'WebFetch':
      return clip(i.url || '', 100);
    case 'WebSearch':
      return clip(i.query || '', 100);
    case 'Agent':
    case 'Task':
      return clip(i.description || '', 100);
    case 'TaskCreate':
      return clip(i.subject || '', 100);
    case 'TaskUpdate':
      return i.status ? `#${i.taskId} → ${i.status}` : `#${i.taskId}`;
    case 'TodoWrite':
      return Array.isArray(i.todos) ? `${i.todos.length} itens` : '';
    case 'Skill':
      return clip(i.skill || '', 60);
    case 'AskUserQuestion':
      return clip((Array.isArray(i.questions) ? i.questions : []).map((q) => q?.question).filter(Boolean).join(' · '), 200);
    default: {
      const first = Object.values(i).find((v) => typeof v === 'string' && v);
      return clip(first || '', 100);
    }
  }
}

// Texto digitado pelo usuario, sem os blocos internos que o Claude Code injeta.
export function cleanUserText(raw) {
  let t = String(raw ?? '');
  if (t.includes('<channel source=')) return null; // mensagens do celular: o servidor ja registrou
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  const cmd = /<command-name>([\s\S]*?)<\/command-name>/.exec(t);
  if (cmd) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t);
    return `${cmd[1].trim()} ${args ? args[1].trim() : ''}`.trim();
  }
  if (/^\s*<(local-command|bash-|task-notification|user-prompt-submit-hook|command-message)/.test(t)) return null;
  if (/^\s*\[Request interrupted/.test(t)) return 'Interrompido no computador';
  t = t.trim();
  return t || null;
}

function usageOf(u) {
  if (!u || typeof u !== 'object') return null;
  return {
    in: Number(u.input_tokens) || 0,
    out: Number(u.output_tokens) || 0,
    cw: Number(u.cache_creation_input_tokens) || 0,
    cr: Number(u.cache_read_input_tokens) || 0,
  };
}

// Imagem guardada no historico (colada por voce, aberta pelo Claude ou devolvida por uma ferramenta).
const TIPOS_IMG = /^image\/(png|jpeg|gif|webp)$/;
function imagem(b) {
  const s = b?.type === 'image' ? b.source : null;
  if (s?.type !== 'base64' || !TIPOS_IMG.test(s.media_type) || typeof s.data !== 'string' || s.data.length > 20_000_000) return null;
  return { media: s.media_type, data: s.data };
}

// Converte uma linha do historico em itens exibiveis e efeitos colaterais.
// Retorna { items: [...], usage: {id, ...} | null, tools: [...], results: [...] }
export function parseEntry(e) {
  const out = { items: [], usage: null, tools: [], results: [] };
  if (!e || typeof e !== 'object') return out;
  const msg = e.message;
  if (!msg || typeof msg !== 'object') return out;
  const ts = Date.parse(e.timestamp) || Date.now();
  const side = !!e.isSidechain;

  if (e.type === 'assistant') {
    const u = usageOf(msg.usage);
    if (u && msg.id) out.usage = { id: msg.id, ts, ...u };
    if (side) return out;
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    blocks.forEach((b, idx) => {
      if (b?.type === 'text' && b.text?.trim()) {
        out.items.push({ id: `${e.uuid}:${idx}`, role: 'assistant', text: clip(b.text.trim(), 8000), ts });
      } else if (b?.type === 'tool_use') {
        out.tools.push({ id: b.id, name: b.name, input: b.input });
        out.items.push({
          id: `${e.uuid}:${idx}`,
          role: 'tool',
          tool: b.name,
          text: toolSummary(b.name, b.input),
          ts,
        });
      }
    });
    return out;
  }

  if (e.type === 'user') {
    if (side) return out;
    const c = msg.content;
    if (typeof c === 'string') {
      if (e.isMeta) return out;
      const text = cleanUserText(c);
      if (text) out.items.push({ id: `${e.uuid}:0`, role: 'user', text: clip(text, 8000), ts });
      return out;
    }
    if (Array.isArray(c)) {
      c.forEach((b, idx) => {
        if (b?.type === 'text' && !e.isMeta) {
          const text = cleanUserText(b.text);
          if (text) out.items.push({ id: `${e.uuid}:${idx}`, role: 'user', text: clip(text, 8000), ts });
        } else if (b?.type === 'image') {
          const img = imagem(b);
          if (img) out.items.push({ id: `${e.uuid}:${idx}`, role: 'image', via: 'user', ts, ...img });
        } else if (b?.type === 'tool_result') {
          let text = '';
          if (typeof b.content === 'string') text = b.content;
          else if (Array.isArray(b.content)) {
            text = b.content.map((x) => x?.text || '').join('\n');
            b.content.forEach((x, n) => {
              const img = imagem(x);
              if (img) out.items.push({ id: `${e.uuid}:${idx}:${n}`, role: 'image', via: 'tool', ts, ...img });
            });
          }
          out.results.push({ id: b.tool_use_id, error: !!b.is_error, text: clip(text, 400) });
        }
      });
    }
  }
  return out;
}

// Mantem a lista de tarefas a partir das ferramentas TodoWrite / TaskCreate / TaskUpdate.
export class TaskTracker {
  constructor() {
    this.list = [];
    this.pendingCreate = new Map(); // tool_use_id -> tarefa aguardando numero
    this.seq = 0;
  }

  onTool(t) {
    const i = t.input && typeof t.input === 'object' ? t.input : {};
    if (t.name === 'TodoWrite' && Array.isArray(i.todos)) {
      this.list = i.todos.map((x, n) => ({
        id: String(n + 1),
        subject: clip(x.content || x.activeForm || '', 160),
        status: x.status || 'pending',
      }));
      return true;
    }
    if (t.name === 'TaskCreate') {
      const task = { id: String(++this.seq), subject: clip(i.subject || '', 160), status: 'pending' };
      this.list.push(task);
      this.pendingCreate.set(t.id, task);
      return true;
    }
    if (t.name === 'TaskUpdate' && i.taskId != null) {
      const task = this.list.find((x) => x.id === String(i.taskId));
      if (!task) return false;
      if (i.status === 'deleted') this.list = this.list.filter((x) => x !== task);
      else {
        if (i.status) task.status = i.status;
        if (i.subject) task.subject = clip(i.subject, 160);
      }
      return true;
    }
    return false;
  }

  onResult(r) {
    const task = this.pendingCreate.get(r.id);
    if (!task) return false;
    this.pendingCreate.delete(r.id);
    const m = /Task #(\d+)/.exec(r.text || '');
    if (m) {
      task.id = m[1];
      this.seq = Math.max(this.seq, Number(m[1]));
    }
    return true;
  }
}

function walk(dir, sinceMs, out, depth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (depth < 5) walk(full, sinceMs, out, depth + 1);
    } else if (ent.name.endsWith('.jsonl')) {
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs >= sinceMs) out.push({ full, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* arquivo sumiu */
      }
    }
  }
}

// Soma os tokens gastos por uma conta desde `sinceMs`, lendo os historicos da
// pasta da conta. `cache` (Map) evita reler arquivos que nao mudaram; `aceita(arquivo)` filtra.
export function scanWindowTokens(accountDir, sinceMs, cache, aceita) {
  let files = [];
  walk(path.join(accountDir, 'projects'), sinceMs, files);
  if (aceita) files = files.filter((f) => aceita(f.full));
  const seen = new Set();
  const total = { in: 0, out: 0, cw: 0, cr: 0, msgs: 0 };
  const alive = new Set();
  for (const f of files) {
    alive.add(f.full);
    let c = cache.get(f.full);
    if (!c || c.mtimeMs !== f.mtimeMs || c.size !== f.size) {
      const rows = new Map();
      let text = '';
      try {
        text = fs.readFileSync(f.full, 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue;
        try {
          const e = JSON.parse(line);
          if (e.type !== 'assistant' || !e.message?.id) continue;
          const u = usageOf(e.message.usage);
          if (!u) continue;
          rows.set(e.message.id, [Date.parse(e.timestamp) || 0, u.in, u.out, u.cw, u.cr]);
        } catch {
          /* ignora */
        }
      }
      c = { mtimeMs: f.mtimeMs, size: f.size, rows };
      cache.set(f.full, c);
    }
    for (const [id, r] of c.rows) {
      if (r[0] < sinceMs || seen.has(id)) continue;
      seen.add(id);
      total.in += r[1];
      total.out += r[2];
      total.cw += r[3];
      total.cr += r[4];
      total.msgs += 1;
    }
  }
  for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key);
  return total;
}
