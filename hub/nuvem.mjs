// Sessoes que nao rodam neste computador: o Claude Code na nuvem (claude.ai/code e o "Code" do app
// Claude) e as tarefas do Cowork. As duas vivem na API de sessoes da Anthropic e se leem com o mesmo
// login que o Claude Code guardou na pasta da conta. Aqui so se le: nada e criado, mudado ou apagado.
//
// O formato da API nao e publico. Por isso tudo aqui e lido com cuidado: campo que faltar vira vazio,
// e uma resposta estranha vira um aviso na lista, nunca um erro que derruba o servidor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const API = 'https://api.anthropic.com';
const BETA = 'ccr-byoc-2025-07-29';
const MAX_PAGINAS = 20;

const lerJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const lerDir = (d) => {
  try {
    return fs.readdirSync(d, { withFileTypes: true });
  } catch {
    return [];
  }
};
const clip = (s, n) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const quando = (...vs) => {
  for (const v of vs) {
    const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
    if (Number.isFinite(t) && t > 0) return t;
  }
  return 0;
};
// So ids no formato da API (session_01...) viram endereco ou pasta: nada de barras ou pontos.
export const idValido = (sid) => typeof sid === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(sid);

export function cabecalhos(token, org) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA,
    ...(org ? { 'x-organization-uuid': org } : {}),
  };
}

// --------------------------------------------------------------- pastas do app Claude
// O app Claude do computador guarda, por conta e organizacao, quais sessoes da nuvem sao do Cowork
// (local-agent-mode-sessions/<conta>/<organizacao>/remote-session-spaces.json, com as pastas que cada
// uma pode ver). No Windows o app vem da loja (MSIX) e a pasta dele mora em Packages\Claude_*\LocalCache.
export function pastaDoAppClaude(home = os.homedir(), plataforma = process.platform, appdata = process.env.APPDATA) {
  if (plataforma === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude');
  if (plataforma !== 'win32') return path.join(home, '.config', 'Claude');
  const pacotes = path.join(home, 'AppData', 'Local', 'Packages');
  const opcoes = [
    ...lerDir(pacotes).filter((d) => d.isDirectory() && /^Claude_/.test(d.name)).map((d) => path.join(pacotes, d.name, 'LocalCache', 'Roaming', 'Claude')),
    path.join(appdata || path.join(home, 'AppData', 'Roaming'), 'Claude'),
  ];
  return opcoes.find((p) => fs.existsSync(p)) || opcoes.at(-1);
}

// sid -> { conta (uuid), pastas } das sessoes que o Cowork abriu.
export function sessoesDoCowork(raizApp) {
  const base = path.join(raizApp, 'local-agent-mode-sessions');
  const mapa = new Map();
  for (const conta of lerDir(base)) {
    if (!conta.isDirectory()) continue;
    for (const org of lerDir(path.join(base, conta.name))) {
      if (!org.isDirectory()) continue;
      const j = lerJson(path.join(base, conta.name, org.name, 'remote-session-spaces.json'));
      for (const e of Array.isArray(j?.entries) ? j.entries : []) {
        if (!idValido(e?.sessionId)) continue;
        const pastas = (Array.isArray(e.folders) ? e.folders : []).filter((p) => typeof p === 'string').slice(0, 8);
        mapa.set(e.sessionId, { conta: conta.name, org: org.name, pastas });
      }
    }
  }
  return mapa;
}

// --------------------------------------------------------------- sessoes
// Estado da sessao na nuvem para os estados do duckV. A API manda tres sinais: session_status (o
// trabalhador: idle, running, archived...), status_bucket (o resumo para a lista: blocked, review_ready,
// completed...) e post_turn_summary.status_category (need_input quando parou esperando voce).
const RODANDO = new Set(['running', 'active', 'working', 'in_progress', 'requires_action']);
// Pedido parado ha mais de dois dias nao chama mais atencao: vira "parou esperando voce".
const PEDIDO_VALE = 2 * 24 * 3600 * 1000;
function estadoDe(s, agoraMs) {
  const st = String(s.session_status || s.worker_status || s.status || '').toLowerCase();
  const balde = String(s.status_bucket || '').toLowerCase();
  const cat = String(s.post_turn_summary?.status_category || '').toLowerCase();
  if (st === 'archived' || s.status === 'archived') return 'ended';
  const pede = st === 'requires_action' || balde === 'blocked' || cat === 'need_input' || !!s.external_metadata?.pending_action;
  const t = quando(s.updated_at, s.last_event_at, s.created_at);
  const recente = !t || agoraMs - t < PEDIDO_VALE;
  if (pede && recente) return 'waiting';
  if (RODANDO.has(st) || balde === 'running' || balde === 'in_progress') return 'working';
  return 'idle';
}
// O que a sessao fez ou pede, numa frase curta, para a linha de baixo da lista.
const RESUMOS = { review_ready: 'Pronta para revisar', completed: 'Concluída', need_input: 'Parou esperando você', blocked: 'Parou esperando você' };

function repoDe(ctx) {
  const fontes = Array.isArray(ctx?.sources) ? ctx.sources : [];
  const git = fontes.find((f) => f && typeof f.url === 'string');
  if (!git) return null;
  const m = /([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(git.url);
  return m ? m[1] : null;
}
function ramoDe(ctx) {
  const saidas = Array.isArray(ctx?.outcomes) ? ctx.outcomes : [];
  for (const o of saidas) {
    const r = o?.git_info?.branches;
    if (Array.isArray(r) && typeof r[0] === 'string') return r[0];
  }
  return null;
}

// Uma sessao da API no formato das listas do duckV. `cowork` traz as pastas, quando o app Claude sabe.
export function sessaoDaApi(s, cowork, agoraMs = Date.now()) {
  if (!s || typeof s !== 'object' || !idValido(s.id)) return null;
  const tipo = String(s.environment_kind || s.session_context?.environment_kind || '').toLowerCase();
  const origem = String(s.origin || '').toLowerCase();
  const doCowork = !!cowork || /cowork|local_agent|agent_mode/.test(`${tipo} ${origem}`);
  const estado = estadoDe(s, agoraMs);
  const resumo = s.post_turn_summary || {};
  const pedido = s.external_metadata?.pending_action;
  const repo = repoDe(s.session_context);
  const pastas = cowork?.pastas || [];
  const uso = s.external_metadata?.context_usage;
  const ctx = uso && typeof uso.max_tokens === 'number' && uso.max_tokens > 0 && typeof uso.used_tokens === 'number'
    ? { pct: Math.min(100, (uso.used_tokens / uso.max_tokens) * 100), in: uso.used_tokens, out: 0, size: uso.max_tokens }
    : null;
  const link = typeof s.session_url === 'string' && /^https:\/\/claude\.ai\//.test(s.session_url) ? s.session_url : `https://claude.ai/code/${s.id}`;
  return {
    sid: s.id,
    origem: doCowork ? 'cowork' : 'nuvem',
    // Ponte do Controle Remoto: e uma sessao deste computador vista pela nuvem (o duckV ja mostra).
    ponte: tipo === 'bridge',
    titulo: clip(s.title || resumo.title || s.session_context?.title || '', 90) || (doCowork ? 'Tarefa do Cowork' : 'Sessão na nuvem'),
    estado,
    pendente: estado === 'waiting' ? clip(resumo.needs_action || pedido?.description || pedido?.tool_name || resumo.status_detail || '', 140) || null : null,
    resumo: clip(resumo.recent_action || resumo.status_detail || RESUMOS[String(resumo.status_category || s.status_bucket || '').toLowerCase()] || '', 140) || null,
    naoLida: !!s.unread,
    criada: quando(s.created_at),
    mtime: quando(s.updated_at, s.last_event_at, s.created_at),
    repo,
    ramo: ramoDe(s.session_context) || (s.external_metadata?.current_branches && Object.values(s.external_metadata.current_branches).find((b) => typeof b === 'string')) || null,
    modelo: [s.configured_model, s.session_context?.model, s.external_metadata?.last_served_model].find((m) => typeof m === 'string' && m) || null,
    ctx,
    cwd: repo || pastas[0] || (typeof s.session_context?.cwd === 'string' && s.session_context.cwd) || null,
    pastas,
    // Sessoes da nuvem abrem no claude.ai; as do Cowork, so no app Claude do computador.
    link: doCowork ? null : link,
  };
}

async function pedirJson(fetcher, url, headers) {
  const r = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
  if (r.status === 401) throw Object.assign(new Error('login'), { codigo: 401 });
  if (!r.ok) throw Object.assign(new Error(`A Anthropic respondeu ${r.status}.`), { codigo: r.status });
  return r.json();
}
// Lista paginada: aceita os dois jeitos de continuar (next_cursor ou has_more + last_id).
async function paginas(fetcher, base, headers, limite) {
  const itens = [];
  let cursor = null;
  let depois = null;
  let anterior = null;
  for (let i = 0; i < MAX_PAGINAS && itens.length < limite; i++) {
    const u = new URL(base);
    if (cursor) u.searchParams.set('cursor', cursor);
    if (depois) u.searchParams.set('after_id', depois);
    const j = await pedirJson(fetcher, u.href, headers);
    const lote = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.sessions) ? j.sessions : Array.isArray(j?.events) ? j.events : [];
    // a API ignorou o cursor e devolveu o mesmo lote: para aqui
    const primeiro = lote.length ? JSON.stringify(lote[0]) : null;
    if (primeiro && primeiro === anterior) break;
    anterior = primeiro;
    itens.push(...lote);
    if (j?.next_cursor && j.next_cursor !== cursor) cursor = j.next_cursor;
    else if (j?.has_more && j?.last_id && j.last_id !== depois) depois = j.last_id;
    else break;
  }
  return itens.slice(0, limite);
}

// As tarefas do Cowork nao entram na lista de sessoes: o app Claude guarda os ids delas (sessoesDoCowork)
// e cada uma e lida pelo id. As que a Anthropic ja apagou (404) ficam lembradas, para nao perguntar de novo.
const sumidas = new Map(); // sid -> quando sumiu
async function buscarUma(fetcher, sid, headers) {
  if (now() - (sumidas.get(sid) || 0) < 3600_000) return null;
  const r = await fetcher(`${API}/v1/sessions/${sid}`, { headers, signal: AbortSignal.timeout(15000) });
  if (r.status === 404 || r.status === 403) {
    sumidas.set(sid, now());
    return null;
  }
  if (r.status === 401) throw Object.assign(new Error('login'), { codigo: 401 });
  return r.ok ? r.json() : null;
}
const now = () => Date.now();

export async function listar({ token, org, conta = null, cowork = new Map(), fetcher = fetch, limite = 200 }) {
  const headers = cabecalhos(token, org);
  const brutas = await paginas(fetcher, `${API}/v1/sessions`, headers, limite);
  const vistas = new Set(brutas.map((s) => s?.id));
  // as do Cowork desta conta que a lista nao trouxe
  const doCowork = [...cowork].filter(([sid, c]) => !vistas.has(sid) && (!conta || c.conta === conta)).slice(0, 30);
  for (const [sid] of doCowork) {
    const s = await buscarUma(fetcher, sid, headers).catch((e) => {
      if (e.codigo === 401) throw e;
      return null;
    });
    if (s) brutas.push(s);
  }
  return brutas
    .map((s) => sessaoDaApi(s, cowork.get(s?.id)))
    .filter((s) => s && !s.ponte)
    .sort((a, b) => b.mtime - a.mtime);
}

// --------------------------------------------------------------- mensagens
// Os eventos de uma sessao trazem as mensagens no formato do Claude Code (type user/assistant com
// message.content). Viram linhas iguais as do historico local, para o mesmo leitor mostrar tudo.
export function eventosParaLinhas(eventos) {
  const linhas = [];
  for (const e of Array.isArray(eventos) ? eventos : []) {
    const x = e?.payload && typeof e.payload === 'object' && !e.message ? e.payload : e;
    if (!x || (x.type !== 'user' && x.type !== 'assistant') || !x.message || typeof x.message !== 'object') continue;
    const uuid = x.uuid || e.uuid || e.id;
    if (!uuid) continue;
    linhas.push({
      type: x.type,
      uuid: String(uuid),
      timestamp: x.timestamp || e.created_at || e.timestamp || null,
      isSidechain: !!x.parent_tool_use_id || !!x.isSidechain,
      message: x.message,
    });
  }
  return linhas;
}

export async function eventos({ token, org, sid, fetcher = fetch, limite = 4000 }) {
  if (!idValido(sid)) throw new Error('Sessão inválida.');
  return eventosParaLinhas(await paginas(fetcher, `${API}/v1/sessions/${sid}/events`, cabecalhos(token, org), limite));
}

// --------------------------------------------------------------- demonstracao
// Sessoes de mentira para o modo demonstracao: o app mostra a nuvem e o Cowork sem tocar em conta nenhuma.
export function demo(agoraMs = Date.now()) {
  const min = 60_000;
  const quando = (m) => new Date(agoraMs - m * min).toISOString();
  const nuvem = { type: 'internal_session', environment_kind: 'anthropic_cloud', origin: 'desktop_app', connection_status: 'connected' };
  const sessoes = [
    { ...nuvem, id: 'session_demo_nuvem_1', title: 'Migrar o checkout para a API nova', session_status: 'running', status_bucket: 'running', created_at: quando(40), updated_at: new Date(agoraMs - 20_000).toISOString(), configured_model: 'claude-opus-5-5', external_metadata: { context_usage: { max_tokens: 1_000_000, used_tokens: 214_000 } }, session_context: { cwd: '', sources: [{ type: 'git_repository', url: 'https://github.com/exemplo/loja-api' }], outcomes: [{ type: 'git_repository', git_info: { branches: ['claude/checkout-api-nova'] } }] } },
    { ...nuvem, id: 'session_demo_nuvem_2', title: 'Revisar o pull request #128', session_status: 'idle', status_bucket: 'blocked', unread: true, post_turn_summary: { status_category: 'need_input', needs_action: 'Rodar npm test no repositório', recent_action: 'Leu as 14 alterações do pull request' }, created_at: quando(180), updated_at: quando(4), session_context: { sources: [{ type: 'git_repository', url: 'https://github.com/exemplo/site-novo.git' }] } },
    { ...nuvem, id: 'session_demo_cowork_1', title: 'Organizar as notas fiscais de outubro', session_status: 'idle', status_bucket: 'completed', post_turn_summary: { status_category: 'completed', recent_action: 'Separou 23 notas em 6 pastas' }, created_at: quando(26 * 60), updated_at: quando(22 * 60) },
    { ...nuvem, id: 'session_demo_nuvem_3', title: 'Atualizar dependências do blog', session_status: 'archived', status_bucket: 'completed', created_at: quando(5 * 24 * 60), updated_at: quando(5 * 24 * 60), session_context: { sources: [{ type: 'git_repository', url: 'https://github.com/exemplo/blog' }] } },
    // ponte do Controle Remoto: sessao do proprio computador, que a lista do duckV deixa de fora
    { id: 'session_demo_ponte', title: 'loja-api', environment_kind: 'bridge', origin: 'claude_code_cli', session_status: 'idle', created_at: quando(30), updated_at: quando(1) },
  ];
  const cowork = new Map([['session_demo_cowork_1', { conta: 'demo', org: 'demo', pastas: ['C:\\Users\\voce\\Documentos\\Notas'] }]]);
  const falas = {
    session_demo_nuvem_1: [
      ['user', 't1', 39, 'Migre o checkout para a API de pagamentos nova e abra um pull request.'],
      ['assistant', 'a1', 38, [{ type: 'text', text: 'Vou ler o módulo atual de checkout e o guia da API nova.' }, { type: 'tool_use', id: 'u1', name: 'Read', input: { file_path: 'src/checkout/pagamento.ts' } }, { type: 'tool_use', id: 'u2', name: 'Grep', input: { pattern: 'gatewayAntigo' } }]],
      ['assistant', 'a2', 12, [{ type: 'text', text: 'Troquei as **7 chamadas** do gateway antigo. Agora rodo os testes:' }, { type: 'tool_use', id: 'u3', name: 'Bash', input: { command: 'npm test -- checkout', description: 'Roda os testes do checkout' } }]],
    ],
    session_demo_nuvem_2: [
      ['user', 't2', 180, 'Revise o pull request #128 e diga o que falta para aprovar.'],
      ['assistant', 'b1', 5, [{ type: 'text', text: 'Li as 14 alterações. Antes de opinar, quero rodar a suíte de testes.' }]],
    ],
    session_demo_cowork_1: [
      ['user', 't3', 26 * 60, 'Organize as notas fiscais de outubro em pastas por fornecedor e me dê o total.'],
      ['assistant', 'c1', 22 * 60, [{ type: 'text', text: 'Pronto. Separei **23 notas** em 6 pastas.\n\n| Fornecedor | Notas | Total |\n|---|---|---|\n| Mercado | 9 | R$ 1.284,10 |\n| Farmácia | 4 | R$ 312,90 |\n| Outros | 10 | R$ 2.077,45 |' }]],
    ],
    session_demo_nuvem_3: [['user', 't4', 5 * 24 * 60, 'Atualize as dependências do blog.'], ['assistant', 'd1', 5 * 24 * 60 - 3, [{ type: 'text', text: 'Atualizei 12 pacotes e abri o pull request #44.' }]]],
  };
  const novas = new Map(); // sid -> tarefa das sessoes criadas na demonstracao
  const eventosDe = (sid) =>
    novas.has(sid)
      ? [{ type: 'user', uuid: `${sid}-t`, created_at: new Date(agoraMs).toISOString(), message: { role: 'user', content: novas.get(sid) } }, { type: 'assistant', uuid: `${sid}-a`, created_at: new Date(agoraMs).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Comecei. Vou clonar o repositório e ler o código antes de mudar qualquer coisa.' }] } }]
      : (falas[sid] || []).map(([type, uuid, m, content]) => ({ type, uuid: `${sid}-${uuid}`, created_at: quando(m), message: { role: type, content } }));
  return { sessoes, cowork, eventosDe, novas };
}

// --------------------------------------------------------------- criar uma sessao na nuvem
// `claude --cloud "tarefa"` cria a sessao na nuvem a partir do repositorio do GitHub da pasta e sai
// na hora, dizendo o id. A tarefa e texto livre: por isso o Claude Code e chamado direto pelo
// executavel, nunca pelo cmd.exe (onde & e | virariam comandos).
export function acharClaude({ plataforma = process.platform, caminho = process.env.PATH || process.env.Path || '', existe = fs.existsSync } = {}) {
  const P = plataforma === 'win32' ? path.win32 : path.posix;
  const pastas = caminho.split(P.delimiter).filter(Boolean);
  if (plataforma !== 'win32') return pastas.map((d) => P.join(d, 'claude')).find(existe) || null;
  for (const d of pastas) {
    const exe = P.join(d, 'claude.exe');
    if (existe(exe)) return exe;
    // instalado pelo npm: o claude.cmd da pasta aponta para o executavel dentro do pacote
    if (existe(P.join(d, 'claude.cmd'))) {
      const dentro = P.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (existe(dentro)) return dentro;
    }
  }
  return null;
}

// O texto da tarefa como o Claude Code vai receber: sem caracteres de controle, ate 4000 letras, e
// sem comecar com "-" (senao viraria uma opcao da linha de comando).
export function textoDaTarefa(t) {
  let s = String(t ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (s.startsWith('-')) s = `Tarefa: ${s}`;
  return s.length >= 3 ? s.slice(0, 4000) : null;
}

const semCores = (s) => String(s || '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
// Le a resposta do `claude --cloud`: o id da sessao criada ou o motivo de nao ter criado.
export function lerCriacao(saida) {
  const t = semCores(saida);
  const m = /\b(session_[A-Za-z0-9]{8,60})\b/.exec(t);
  if (m && /Created cloud session|claude\.ai\/code\//i.test(t)) return { sid: m[1], link: `https://claude.ai/code/${m[1]}` };
  const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const erro = linhas.find((l) => /^error[:\s]/i.test(l)) || linhas.at(-1) || 'O Claude Code não criou a sessão.';
  return { erro: erro.replace(/^error:\s*/i, '').slice(0, 300) };
}

export function criar({ exe, texto, cwd, env, executar }) {
  return new Promise((resolve) => {
    executar(exe, ['--cloud', texto], { cwd, env, timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const r = lerCriacao(`${stdout || ''}\n${stderr || ''}`);
      if (!r.sid && err?.killed) r.erro = 'O Claude Code demorou demais para criar a sessão.';
      resolve(r);
    });
  });
}

// --------------------------------------------------------------- repositorios do GitHub
// A sessao na nuvem nasce do repositorio do GitHub da pasta. Para escolher qualquer repositorio (mesmo
// um que nao esta no computador), o duckV lista os seus pelo GitHub CLI (gh) e, se preciso, baixa uma
// copia leve (so a ultima versao) numa pasta propria dele.
export const nomeRepoValido = (r) => typeof r === 'string' && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(r) && !r.split('/').some((p) => p === '.' || p === '..');

// "owner/nome" de um endereco do GitHub (https ou ssh); null se nao for do GitHub.
export function repoDoRemoto(url) {
  const m = /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(String(url || '').trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

// Lista vinda de `gh api user/repos`: so o que a tela precisa.
export function lerRepos(json) {
  let lista;
  try {
    lista = JSON.parse(json);
  } catch {
    return [];
  }
  return (Array.isArray(lista) ? lista : [])
    .filter((r) => r && nomeRepoValido(r.full_name))
    .map((r) => ({ repo: r.full_name, descricao: clip(r.description || '', 120) || null, privado: !!r.private, atualizado: quando(r.pushed_at, r.updated_at), arquivado: !!r.archived }))
    .filter((r) => !r.arquivado);
}

// Pasta da copia leve de um repositorio, dentro da pasta de dados do duckV.
export const pastaDoRepo = (dados, repo) => path.join(dados, 'repos', repo.replace('/', '__'));
