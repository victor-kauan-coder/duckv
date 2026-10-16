// Sessoes da nuvem e do Cowork: leitura cuidadosa da API (com uma API de mentira), Cowork pelas pastas
// do app Claude e mensagens no formato do historico local. Nada aqui fala com a Anthropic.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nv = await import(pathToFileURL(path.join(ROOT, 'hub/nuvem.mjs')).href);
const { parseEntry } = await import(pathToFileURL(path.join(ROOT, 'hub/transcript.mjs')).href);
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

// --- uma sessao da API vira item de lista
const s = nv.sessaoDaApi({
  id: 'session_01ABC', title: 'Migrar o checkout', worker_status: 'running', created_at: '2026-10-16T10:00:00Z', updated_at: '2026-10-16T11:00:00Z',
  session_context: { sources: [{ type: 'git_repository', url: 'https://github.com/eu/loja-api.git' }], outcomes: [{ git_info: { branches: ['claude/x'] } }], model: 'claude-opus-5-5' },
});
ok(s.origem === 'nuvem' && s.estado === 'working', 'sessao rodando na nuvem fica "trabalhando"');
ok(s.repo === 'eu/loja-api' && s.ramo === 'claude/x' && s.cwd === 'eu/loja-api', 'repositorio e ramo lidos do contexto');
ok(s.link === 'https://claude.ai/code/session_01ABC', 'sessao da nuvem abre no claude.ai');
ok(s.mtime === Date.parse('2026-10-16T11:00:00Z'), 'data da ultima mudanca');
const p = nv.sessaoDaApi({ id: 'session_02', worker_status: 'requires_action', external_metadata: { pending_action: { tool_name: 'Bash' } } });
ok(p.estado === 'waiting' && p.pendente === 'Bash', 'sessao que pede permissao fica "pedindo", com o que ela pede');
ok(nv.sessaoDaApi({ id: 'session_03', status: 'archived', worker_status: 'idle' }).estado === 'ended', 'arquivada conta como encerrada');
ok(nv.sessaoDaApi({ id: 'session_04', title: '' }).titulo === 'Sessão na nuvem', 'sem titulo ganha um nome');
const cw = nv.sessaoDaApi({ id: 'session_05', title: 'Notas' }, { pastas: ['C:\\Notas'] });
ok(cw.origem === 'cowork' && cw.link === null && cw.cwd === 'C:\\Notas', 'sessao do Cowork: sem link do claude.ai, com a pasta');
ok(nv.sessaoDaApi({ id: '../../etc' }) === null && nv.sessaoDaApi({ id: 'a/b' }) === null, 'id com barra ou ponto e recusado');
ok(nv.sessaoDaApi(null) === null && nv.sessaoDaApi('x') === null, 'resposta estranha nao derruba');

// --- o formato que a API manda hoje (session_status, status_bucket, post_turn_summary)
const agora = Date.parse('2026-10-16T12:00:00Z');
const real = (x) => nv.sessaoDaApi({ id: 'session_01R', type: 'internal_session', environment_kind: 'anthropic_cloud', origin: 'desktop_app', created_at: '2026-10-16T10:00:00Z', updated_at: '2026-10-16T11:30:00Z', ...x }, null, agora);
const bloq = real({ session_status: 'idle', status_bucket: 'blocked', post_turn_summary: { status_category: 'need_input', needs_action: 'Aprovar o plano' } });
ok(bloq.estado === 'waiting' && bloq.pendente === 'Aprovar o plano', 'parada em "blocked" com need_input fica pedindo, com o que falta');
ok(real({ session_status: 'idle', status_bucket: 'blocked', updated_at: '2026-10-10T10:00:00Z' }).estado === 'idle', 'pedido parado ha dias nao chama mais atencao');
ok(real({ session_status: 'running' }).estado === 'working', 'session_status running fica trabalhando');
ok(real({ session_status: 'archived', status_bucket: 'blocked' }).estado === 'ended', 'arquivada vence o resto');
const pronta = real({ session_status: 'idle', status_bucket: 'review_ready', post_turn_summary: { status_category: 'review_ready' } });
ok(pronta.estado === 'idle' && pronta.resumo === 'Pronta para revisar', 'pronta para revisar vira a frase da lista');
const comCtx = real({ configured_model: 'claude-opus-5-5', external_metadata: { context_usage: { max_tokens: 200000, used_tokens: 50000 } } });
ok(comCtx.ctx?.pct === 25 && comCtx.ctx.size === 200000 && comCtx.modelo === 'claude-opus-5-5', 'contexto e modelo lidos do que a API manda');
ok(real({ session_url: 'https://claude.ai/code/session_01R' }).link === 'https://claude.ai/code/session_01R' && real({ session_url: 'https://mal.example/x' }).link === 'https://claude.ai/code/session_01R', 'link so do claude.ai');
ok(real({ environment_kind: 'bridge', origin: 'claude_code_cli' }).ponte === true, 'sessao-ponte do Controle Remoto e marcada');

// --- Cowork pelas pastas do app Claude
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-nuvem-'));
const pasta = path.join(app, 'local-agent-mode-sessions', 'conta-uuid', 'org-uuid');
fs.mkdirSync(pasta, { recursive: true });
fs.writeFileSync(path.join(pasta, 'remote-session-spaces.json'), JSON.stringify({ entries: [{ sessionId: 'session_01COW', folders: ['C:\\Docs'] }, { sessionId: '../fora', folders: [] }] }));
fs.mkdirSync(path.join(app, 'local-agent-mode-sessions', 'quebrada', 'org'), { recursive: true });
fs.writeFileSync(path.join(app, 'local-agent-mode-sessions', 'quebrada', 'org', 'remote-session-spaces.json'), '{pela metade');
const mapa = nv.sessoesDoCowork(app);
ok(mapa.get('session_01COW')?.pastas[0] === 'C:\\Docs' && mapa.get('session_01COW').conta === 'conta-uuid', 'sessao do Cowork achada nas pastas do app');
ok(!mapa.has('../fora') && mapa.size === 1, 'id invalido e arquivo pela metade ficam de fora');
ok(nv.sessoesDoCowork(path.join(app, 'nao-existe')).size === 0, 'sem app Claude, lista vazia');

// --- lista paginada com uma API de mentira
const pedidos = [];
const api = (respostas) => async (url, op) => {
  pedidos.push({ url, op });
  const r = respostas.shift() ?? { data: [] };
  if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => r };
};
const lista = await nv.listar({
  token: 'tk', org: 'org1',
  cowork: new Map([['session_b', { pastas: ['C:\\X'] }]]),
  fetcher: api([
    { data: [{ id: 'session_a', title: 'A', updated_at: '2026-10-16T09:00:00Z' }], has_more: true, last_id: 'session_a' },
    { data: [{ id: 'session_b', title: 'B', updated_at: '2026-10-16T12:00:00Z' }, { lixo: true }, { id: 'session_ponte', environment_kind: 'bridge' }] },
  ]),
});
ok(lista.length === 2 && lista[0].sid === 'session_b' && lista[0].origem === 'cowork', 'duas paginas juntas, a mais nova primeiro, Cowork marcado, ponte de fora');
ok(new URL(pedidos[1].url).searchParams.get('after_id') === 'session_a', 'segue para a pagina seguinte (has_more + last_id)');
ok(pedidos[0].op.headers.Authorization === 'Bearer tk' && pedidos[0].op.headers['x-organization-uuid'] === 'org1' && /ccr-byoc/.test(pedidos[0].op.headers['anthropic-beta']), 'cabecalhos de login e organizacao');
ok(pedidos[0].url.startsWith('https://api.anthropic.com/v1/sessions'), 'so fala com a API da Anthropic');
pedidos.length = 0;
const repetida = await nv.listar({ token: 'tk', fetcher: api([{ data: [{ id: 'session_a' }], next_cursor: 'c' }, { data: [{ id: 'session_a' }], next_cursor: 'd' }, { data: [{ id: 'session_a' }], next_cursor: 'e' }]) });
ok(repetida.length === 1 && pedidos.length === 2, 'API que ignora o cursor nao vira laco infinito');
let erro = null;
try {
  await nv.listar({ token: 'tk', fetcher: api([401]) });
} catch (e) {
  erro = e;
}
ok(erro?.codigo === 401, 'login vencido vira erro com o codigo');

// --- Cowork: fora da lista, lido pelo id; o que sumiu fica lembrado
pedidos.length = 0;
const comCowork = await nv.listar({
  token: 'tk', conta: 'eu',
  cowork: new Map([['session_cw1', { conta: 'eu', pastas: ['C:\Docs'] }], ['session_cw2', { conta: 'eu', pastas: [] }], ['session_outra', { conta: 'outra', pastas: [] }]]),
  fetcher: async (url) => {
    pedidos.push({ url });
    if (url.endsWith('/v1/sessions')) return { ok: true, status: 200, json: async () => ({ data: [], has_more: false }) };
    if (url.endsWith('session_cw1')) return { ok: true, status: 200, json: async () => ({ id: 'session_cw1', title: 'Notas', session_status: 'idle' }) };
    return { ok: false, status: 404, json: async () => ({}) };
  },
});
ok(comCowork.length === 1 && comCowork[0].origem === 'cowork' && comCowork[0].cwd === 'C:\Docs', 'tarefa do Cowork lida pelo id, com a pasta');
ok(!pedidos.some((p) => p.url.endsWith('session_outra')), 'Cowork de outra conta nao e consultado com este login');
const antes = pedidos.length;
await nv.listar({ token: 'tk', conta: 'eu', cowork: new Map([['session_cw2', { conta: 'eu', pastas: [] }]]), fetcher: async (url) => (pedidos.push({ url }), url.endsWith('/v1/sessions') ? { ok: true, status: 200, json: async () => ({ data: [] }) } : { ok: false, status: 404, json: async () => ({}) }) });
ok(pedidos.length === antes + 1, 'tarefa que sumiu (404) nao e perguntada de novo');

// --- mensagens
const linhas = nv.eventosParaLinhas([
  { id: 'ev1', created_at: '2026-10-16T10:00:00Z', type: 'user', message: { role: 'user', content: 'Oi' } },
  { type: 'assistant', uuid: 'ev2', message: { role: 'assistant', id: 'm2', content: [{ type: 'text', text: 'Olá' }, { type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] } },
  { type: 'assistant', uuid: 'ev3', parent_tool_use_id: 'x', message: { content: [{ type: 'text', text: 'subagente' }] } },
  { type: 'system', uuid: 'ev4' },
  { type: 'user', message: { content: 'sem id' } },
  { payload: { type: 'user', uuid: 'ev5', message: { content: 'embrulhada' } } },
]);
ok(linhas.length === 4, 'so mensagens de verdade viram linhas (sistema e sem id ficam de fora)');
ok(linhas[0].uuid === 'ev1' && linhas[0].timestamp === '2026-10-16T10:00:00Z', 'id e hora do evento');
ok(linhas[2].isSidechain === true, 'mensagens de subagentes ficam marcadas');
const lidos = linhas.flatMap((l) => parseEntry(l).items);
ok(lidos.some((x) => x.role === 'user' && x.text === 'Oi') && lidos.some((x) => x.role === 'assistant' && x.text === 'Olá') && lidos.some((x) => x.role === 'tool' && x.tool === 'Bash'), 'o leitor do historico mostra as mensagens da nuvem');
ok(!lidos.some((x) => x.text === 'subagente'), 'conversa de subagente nao entra na conversa principal');
let recusou = false;
try {
  await nv.eventos({ token: 'tk', sid: '../x', fetcher: api([]) });
} catch {
  recusou = true;
}
ok(recusou, 'id invalido nunca vira endereco');

// --- demonstracao
const d = nv.demo(Date.parse('2026-10-16T12:00:00Z'));
const itens = d.sessoes.map((x) => nv.sessaoDaApi(x, d.cowork.get(x.id), Date.parse('2026-10-16T12:00:00Z'))).filter((x) => !x.ponte);
ok(itens.some((x) => x.origem === 'cowork') && itens.some((x) => x.estado === 'working') && itens.some((x) => x.estado === 'waiting'), 'demonstracao mostra nuvem, Cowork, trabalhando e pedindo');
ok(d.sessoes.filter((x) => x.environment_kind !== 'bridge').every((x) => nv.eventosParaLinhas(d.eventosDe(x.id)).length > 0), 'toda sessao da demonstracao tem conversa');
fs.rmSync(app, { recursive: true, force: true });
