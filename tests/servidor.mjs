// Teste ponta a ponta do servidor e do canal, com um cliente real do protocolo e um celular simulado.
// Usa uma pasta temporaria: nao toca nas suas contas nem nos dados do duckV.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-teste-'));
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify([1, 2, 3].map((n) => ({ id: 'conta' + n, nome: 'Conta ' + n, cor: '#ff7a1a', dir: path.join(TMP, 'c' + n) }))));
const CODIGO = 'codigo-de-teste-0123456789';
const AMBIENTE = { ...process.env, PAINEL_CODIGO: CODIGO, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json') };
const require = createRequire(path.join(ROOT, 'x.js'));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const PORT = '18765';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env: { ...AMBIENTE, PAINEL_PORT: PORT }, stdio: ['ignore', 'pipe', 'inherit'] });
let hubOut = ''; hub.stdout.on('data', (d) => (hubOut += d));
await sleep(6500);
const cfg = JSON.parse(fs.readFileSync(path.join(TMP, 'config.json'), 'utf8'));
const base = `http://127.0.0.1:${PORT}`;

// --- seguranca basica
ok((await fetch(`${base}/api/state`)).status === 401, 'API sem pareamento responde 401');
ok((await fetch(`${base}/parear?k=errado`, { redirect: 'manual' })).status === 403, 'codigo de pareamento errado e recusado');
ok((await fetch(`${base}/ingest/hook`, { method: 'POST', body: '{}' })).status === 403, 'relatorio sem segredo e recusado');
ok((await fetch(`${base}/..%2f..%2fdata/config.json`)).status === 404, 'arquivos fora do app nao sao servidos');
const pair = await fetch(`${base}/parear?k=${CODIGO}`, { redirect: 'manual' });
const cookie = (pair.headers.get('set-cookie') || '').split(';')[0];
ok(pair.status === 302 && cookie.startsWith('painel='), 'pareamento entrega o cookie');
ok((await fetch(`${base}/api/state`, { headers: { cookie, origin: 'https://evil.example' } })).status === 403, 'outro site (Origin estranho) e recusado');
ok((await fetch(`${base}/`)).status === 200, 'pagina do app e servida');
ok(!JSON.stringify(cfg).includes(cookie.slice(7)) && !fs.readFileSync(path.join(TMP, 'aparelhos.json'), 'utf8').includes(cookie.slice(7)), 'a chave do celular nao fica gravada no disco');
const viaApi = await (await fetch(`${base}/api/parear`, { method: 'POST', body: JSON.stringify({ k: CODIGO, nome: 'Teste' }) })).json();
const outro = `painel=${viaApi.chave}`;
ok((await fetch(`${base}/api/state`, { headers: { cookie: outro } })).status === 200, 'app Android pareia pela API');
ok((await fetch(`${base}/api/parear`, { method: 'POST', body: JSON.stringify({ k: 'errado' }) })).status === 403, 'API de pareamento recusa codigo errado');
await fetch(`${base}/api/desparear`, { method: 'POST', headers: { cookie: outro } });
ok((await fetch(`${base}/api/state`, { headers: { cookie: outro } })).status === 401, 'desparear invalida a chave no computador');
ok((await fetch(`${base}/api/state`, { headers: { cookie } })).status === 200, 'desparear um celular nao afeta os outros');

// --- celular simulado
const phone = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie } });
const got = []; let state = null;
phone.on('message', (r) => { const m = JSON.parse(r); if (m.t === 'state') state = m; else got.push(m); });
await new Promise((r) => phone.on('open', r));
const noCookie = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
ok(await new Promise((r) => { noCookie.on('error', () => r(true)); noCookie.on('open', () => r(false)); }), 'WebSocket sem pareamento e recusado');

// --- canal iniciado como o Claude Code faria
const env = { ...AMBIENTE, PAINEL_PORT: PORT, PAINEL_ACCOUNT: 'conta2', PAINEL_INSTANCE: 'conta2-teste', CLAUDE_CODE_SESSION_ID: 'sess-1' };
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'agent/channel.mjs')], env, stderr: 'inherit' });
const client = new Client({ name: 'claude-code-fake', version: '0' }, { capabilities: {} });
const fromChannel = [];
client.fallbackNotificationHandler = async (n) => { fromChannel.push(n); };
await client.connect(transport);
const caps = client.getServerCapabilities();
ok(!!caps?.experimental?.['claude/channel'] && !!caps?.experimental?.['claude/channel/permission'], 'canal declara as duas capacidades');
ok(!!client.getInstructions(), 'canal envia instrucoes');
await sleep(800);
ok(state?.instances.some((i) => i.id === 'conta2-teste' && i.account === 'conta2' && i.canSend), 'sessao aparece no painel como controlavel');

// --- historico + linha de status + eventos
const tfile = path.join(TMP, 'sess-1.jsonl');
const line = (o) => fs.appendFileSync(tfile, JSON.stringify(o) + '\n');
fs.writeFileSync(tfile, '');
const run = (script, input) => new Promise((res) => { const c = spawn(process.execPath, [path.join(ROOT, script)], { env, stdio: ['pipe', 'pipe', 'inherit'] }); let o = ''; c.stdout.on('data', (d) => (o += d)); c.on('close', () => res(o)); c.stdin.end(JSON.stringify(input)); });
const reset5 = Math.floor(Date.now() / 1000) + 3600;
const sl = await run('agent/statusline.mjs', { session_id: 'sess-1', session_name: 'loja-api', transcript_path: tfile, model: { id: 'claude-x', display_name: 'Sonnet' }, workspace: { current_dir: 'C:\\proj\\loja' }, cost: { total_cost_usd: 0.42, total_lines_added: 10, total_lines_removed: 2 }, context_window: { total_input_tokens: 15500, total_output_tokens: 1200, context_window_size: 200000, used_percentage: 8 }, rate_limits: { five_hour: { used_percentage: 23.5, resets_at: reset5 }, seven_day: { used_percentage: 41.2, resets_at: reset5 + 86400 } } });
ok(/5h 24%/.test(sl) && /semana 41%/.test(sl), `linha de status impressa: ${sl.trim()}`);
await run('agent/hook.mjs', { hook_event_name: 'UserPromptSubmit', session_id: 'sess-1', transcript_path: tfile, cwd: 'C:\\proj\\loja' });
line({ type: 'user', uuid: 'u1', timestamp: new Date().toISOString(), message: { role: 'user', content: 'rode os testes' } });
line({ type: 'assistant', uuid: 'a1', timestamp: new Date().toISOString(), message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'Vou rodar os testes.' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test', description: 'Roda os testes' } }], usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 1000 } } });
line({ type: 'assistant', uuid: 'a2', timestamp: new Date().toISOString(), message: { id: 'msg_2', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_t', name: 'TaskCreate', input: { subject: 'Corrigir teste' } }], usage: { input_tokens: 5, output_tokens: 5 } } });
line({ type: 'user', uuid: 'u2', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_t', content: 'Task #7 created successfully: Corrigir teste' }] } });
line({ type: 'user', uuid: 'u3', isMeta: true, timestamp: new Date().toISOString(), message: { role: 'user', content: '<system-reminder>interno</system-reminder>' } });
await run('agent/hook.mjs', { hook_event_name: 'PreToolUse', session_id: 'sess-1', transcript_path: tfile, tool_name: 'Bash', tool_use_id: 'toolu_1', tool_input: { command: 'npm test', description: 'Roda os testes' } });
phone.send(JSON.stringify({ t: 'open', instance: 'conta2-teste' }));
await sleep(1500);
let inst = state.instances.find((i) => i.id === 'conta2-teste');
const acc = state.accounts.find((a) => a.id === 'conta2');
ok(Math.round(acc.usage.five_hour.pct) === 24 && acc.usage.five_hour.resetsAt === reset5 * 1000, 'uso de 5h e horario de reinicio chegam ao painel');
ok(inst.name === 'loja-api' && inst.ctx.in === 15500 && inst.model === 'Sonnet', 'nome, modelo e tokens de contexto');
ok(inst.status === 'working' && /Bash: Roda os testes/.test(inst.activity), `estado trabalhando: ${inst.activity}`);
ok(inst.tokens.in === 105 && inst.tokens.out === 55 && inst.tokens.cr === 1000, 'tokens somados do historico');
ok(inst.tasks.length === 1 && inst.tasks[0].id === '7', 'tarefa lida do historico com o numero certo');
const hist = got.find((m) => m.t === 'history');
const all = [...(hist?.items || []), ...got.filter((m) => m.t === 'msgs').flatMap((m) => m.items)];
ok(all.some((m) => m.role === 'user' && m.text === 'rode os testes') && all.some((m) => m.role === 'assistant') && all.some((m) => m.role === 'tool' && m.tool === 'Bash'), 'mensagens chegam ao celular');
ok(!all.some((m) => /interno/.test(m.text)), 'blocos internos nao aparecem');

// --- pedido de permissao: Claude Code -> canal -> painel -> celular -> volta
await client.notification({ method: 'notifications/claude/channel/permission_request', params: { request_id: 'abcde', tool_name: 'Bash', description: 'Roda os testes', input_preview: '{"command":"npm test"}' } });
await sleep(600);
inst = state.instances.find((i) => i.id === 'conta2-teste');
ok(inst.status === 'waiting' && inst.perms[0]?.id === 'abcde' && inst.perms[0].toolUseId === 'toolu_1', 'pedido de permissao aparece no celular, ligado a chamada');
phone.send(JSON.stringify({ t: 'verdict', instance: 'conta2-teste', request_id: 'abcde', behavior: 'allow', ref: 1 }));
await sleep(600);
const v = fromChannel.find((n) => n.method === 'notifications/claude/channel/permission');
ok(v?.params.request_id === 'abcde' && v.params.behavior === 'allow', 'aceitar no celular chega ao Claude Code');
inst = state.instances.find((i) => i.id === 'conta2-teste');
ok(inst.perms.length === 0 && inst.status === 'working', 'pedido some depois de respondido');
phone.send(JSON.stringify({ t: 'verdict', instance: 'conta2-teste', request_id: 'abcde', behavior: 'allow', ref: 2 }));
await sleep(300);
ok(got.some((m) => m.t === 'err' && m.ref === 2), 'responder duas vezes da erro claro');

// --- permissao respondida no computador (resultado da ferramenta no historico)
await client.notification({ method: 'notifications/claude/channel/permission_request', params: { request_id: 'fghij', tool_name: 'Write', description: 'Grava arquivo', input_preview: '{}' } });
await run('agent/hook.mjs', { hook_event_name: 'PreToolUse', session_id: 'sess-1', tool_name: 'Write', tool_use_id: 'toolu_2', tool_input: { file_path: 'C:\\proj\\loja\\a.js' } });
await sleep(300);
inst = state.instances.find((i) => i.id === 'conta2-teste');
ok(inst.perms[0]?.toolUseId === 'toolu_2', 'pedido ligado mesmo quando o evento chega depois');
line({ type: 'user', uuid: 'u4', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', is_error: true, content: 'negado' }] } });
await sleep(1500);
inst = state.instances.find((i) => i.id === 'conta2-teste');
ok(inst.perms.length === 0, 'pedido respondido no computador some do celular');

// --- mensagem do celular -> Claude Code
phone.send(JSON.stringify({ t: 'send', instance: 'conta2-teste', text: 'agora faça o commit', ref: 3 }));
await sleep(500);
const ch = fromChannel.find((n) => n.method === 'notifications/claude/channel');
ok(ch?.params.content === 'agora faça o commit' && ch.params.meta?.origem === 'celular', 'mensagem do celular entra na sessao');
ok(got.some((m) => m.t === 'msgs' && m.items.some((i) => i.via === 'celular')), 'mensagem enviada aparece na conversa');

// --- fim da vez e encerramento
await run('agent/hook.mjs', { hook_event_name: 'Stop', session_id: 'sess-1', last_assistant_message: 'Pronto, testes passando.' });
await sleep(300);
inst = state.instances.find((i) => i.id === 'conta2-teste');
ok(inst.status === 'idle' && inst.lastText === 'Pronto, testes passando.', 'fim da vez deixa a sessao parada');
await client.close();
await sleep(22000);
inst = state.instances.find((i) => i.id === 'conta2-teste');
ok(inst?.status === 'ended', 'sessao fechada aparece como encerrada');
phone.close(); hub.kill();
fs.rmSync(TMP, { recursive: true, force: true });
// --- perguntas do Claude Code lidas da tela
const { readPrompt } = await import(pathToFileURL(path.join(ROOT, 'hub/hosted.mjs')).href);
const confia = readPrompt([' Quick safety check: do you trust this folder?', '', ' ❯ No, exit', '   Yes, I trust this folder', '', ' Enter to confirm · Esc to cancel']);
ok(confia?.menu && confia.selecionada === 0 && confia.opcoes[1]?.rotulo === 'Yes, I trust this folder', 'menu sem numeros vira botoes');
ok(readPrompt(['────', '❯ Try "edit"', '────', '  manual mode on']) === null, 'caixa de mensagem nao e confundida com menu');
ok(readPrompt(['Do you want to proceed?', '❯ 1. Yes', '  2. No'])?.opcoes.length === 2, 'menu numerado continua reconhecido');

console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nServidor e canal: tudo certo.');
process.exit(process.exitCode || 0);
