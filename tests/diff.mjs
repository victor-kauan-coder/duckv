// Teste da aba "Mudancas" (o diff da pasta da sessao), da busca do "@" e da fila de mensagens
// que esperam o turno do agente acabar. No lugar do Claude Code roda o terminal de mentira.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lerDiff, lerSaida, buscarArquivos, LIMITE_LINHAS } from '../hub/diff.mjs';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, '..');
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (cond()) return true; } catch {} await sleep(100); } return false; };

// Repositorio temporario dentro da pasta pessoal (as sessoes so abrem la); apagado no fim.
const repo = fs.mkdtempSync(path.join(os.homedir(), 'duckv-teste-diff-'));
const semGit = fs.mkdtempSync(path.join(os.homedir(), 'duckv-teste-semgit-'));
const g = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=teste', '-c', 'user.email=teste@exemplo.com', '-c', 'commit.gpgsign=false', ...a], { stdio: 'pipe' });
g('init', '-q');
fs.writeFileSync(path.join(repo, 'frete.js'), 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
fs.writeFileSync(path.join(repo, 'apagar.txt'), 'some daqui\n');
fs.writeFileSync(path.join(repo, 'imagem.bin'), Buffer.from([0, 1, 2, 3, 0, 255]));

// ---------------------------------------------------------------- sem commit ainda
let d = await lerDiff(repo);
ok(d.git && d.arquivos.length === 3 && d.arquivos.every((f) => f.estado === 'novo'), 'repositorio sem nenhum commit: tudo aparece como arquivo novo');
g('add', '.'); g('commit', '-q', '-m', 'inicio');

// ---------------------------------------------------------------- arquivo mudado, novo, apagado e binario
fs.writeFileSync(path.join(repo, 'frete.js'), 'const a = 1;\nconst b = 20;\nconst c = 3;\nconst d = 4;\n');
fs.writeFileSync(path.join(repo, 'novo.md'), '# Novo\n\nlinha dois\n');
fs.rmSync(path.join(repo, 'apagar.txt'));
fs.writeFileSync(path.join(repo, 'imagem.bin'), Buffer.from([0, 9, 9, 9, 0, 255, 7]));
fs.mkdirSync(path.join(repo, 'sub'));
d = await lerDiff(path.join(repo, 'sub'));
const achar = (c) => d.arquivos.find((f) => f.caminho === c);
const frete = achar('frete.js');
ok(d.git && fs.realpathSync(d.raiz) === fs.realpathSync(repo), 'acha a raiz do repositorio mesmo com a sessao numa subpasta');
ok(frete && frete.estado === 'mudou' && frete.somadas === 2 && frete.tiradas === 1, `arquivo mudado com linhas somadas e tiradas (${frete?.somadas}/${frete?.tiradas})`);
const linhas = frete.trechos.flatMap((h) => h.linhas);
ok(linhas.some((l) => l.t === '-' && l.x === 'const b = 2;' && l.a === 2) && linhas.some((l) => l.t === '+' && l.x === 'const b = 20;' && l.n === 2), 'trecho traz as linhas com o numero de antes e o de depois');
ok(linhas.some((l) => l.t === ' ' && l.x === 'const a = 1;' && l.a === 1 && l.n === 1), 'linhas de contexto ficam no trecho');
const novo = achar('novo.md');
ok(novo && novo.estado === 'novo' && novo.naoRastreado && novo.somadas === 3 && novo.trechos[0].linhas[0].x === '# Novo', 'arquivo novo nao rastreado entra no diff, linha por linha');
ok(achar('apagar.txt')?.estado === 'apagado' && achar('apagar.txt').tiradas === 1, 'arquivo apagado aparece como apagado');
ok(achar('imagem.bin')?.binario && achar('imagem.bin').grande && !achar('imagem.bin').trechos.length, 'arquivo binario vira so "mudou", sem trechos');
ok(d.somadas === d.arquivos.reduce((s, f) => s + f.somadas, 0) && d.tiradas >= 2, 'total de linhas somadas e tiradas');

// ---------------------------------------------------------------- diff grande
fs.writeFileSync(path.join(repo, 'grande.txt'), Array.from({ length: LIMITE_LINHAS + 50 }, (_, i) => `linha ${i}`).join('\n') + '\n');
g('add', 'grande.txt');
d = await lerDiff(repo);
const grande = d.arquivos.find((f) => f.caminho === 'grande.txt');
ok(grande?.grande && !grande.trechos.length && grande.somadas === LIMITE_LINHAS + 50, 'arquivo com diff gigante fica so com os numeros (grande demais para mostrar)');
ok(d.arquivos.find((f) => f.caminho === 'frete.js')?.trechos.length > 0, 'os outros arquivos continuam com os trechos');

// ---------------------------------------------------------------- pasta sem git
const sg = await lerDiff(semGit);
ok(sg.git === false && /não é um repositório git/.test(sg.msg), 'pasta que nao e repositorio git: diz isso');

// ---------------------------------------------------------------- leitura da saida do git
const lido = lerSaida(['diff --git "a/caf\\303\\251 x.txt" "b/caf\\303\\251 x.txt"', 'index 1..2 100644', '--- "a/caf\\303\\251 x.txt"', '+++ "b/caf\\303\\251 x.txt"', '@@ -1 +1 @@', '-um', '+dois', '\\ No newline at end of file', 'diff --git a/v.txt b/n.txt', 'similarity index 90%', 'rename from v.txt', 'rename to n.txt'].join('\n'));
ok(lido[0].caminho === 'café x.txt' && lido[0].somadas === 1 && lido[0].tiradas === 1, 'nome com acento e espaco que o git poe entre aspas e lido certo');
ok(lido[1].estado === 'renomeado' && lido[1].antes === 'v.txt' && lido[1].caminho === 'n.txt', 'arquivo renomeado guarda o nome antigo');

// ---------------------------------------------------------------- busca do "@"
fs.mkdirSync(path.join(semGit, 'src')); fs.mkdirSync(path.join(semGit, 'node_modules'));
fs.writeFileSync(path.join(semGit, 'src', 'pedido.js'), '');
fs.writeFileSync(path.join(semGit, 'node_modules', 'pedido.js'), '');
const b1 = await buscarArquivos(repo, 'fre');
ok(b1.git && b1.itens[0] === 'frete.js', 'busca do @ acha arquivo rastreado pelo git pelo comeco do nome');
ok((await buscarArquivos(repo, 'nov')).itens.includes('novo.md'), 'arquivo novo ainda nao rastreado tambem aparece no @');
const b2 = await buscarArquivos(semGit, 'pedido');
ok(!b2.git && b2.itens.length === 1 && b2.itens[0] === 'src/pedido.js', 'fora do git a listagem e limitada e pula node_modules');

// ---------------------------------------------------------------- pelo servidor
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-teste-'));
const PORT = '18797';
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(TMP, 'c1') }]));
const env = { ...process.env, PAINEL_CODIGO: 'codigo-de-teste-0123456789', PAINEL_PORT: PORT, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), FAKE_HOOK: path.join(ROOT, 'agent/hook.mjs'), PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(AQUI, 'terminal-de-mentira.mjs')]) };
const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
await ate(() => fs.existsSync(path.join(TMP, 'config.json')), 20000);
await sleep(1500);
const cfg = JSON.parse(fs.readFileSync(path.join(TMP, 'config.json'), 'utf8'));
let pair = null;
for (let i = 0; i < 60 && !pair; i++) { await sleep(250); pair = await fetch(`http://127.0.0.1:${PORT}/parear?k=codigo-de-teste-0123456789`, { redirect: 'manual' }).catch(() => null); }
const cookie = pair.headers.get('set-cookie').split(';')[0];
const phone = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie } });
let state = null, screen = null; const replies = new Map(); let ref = 0;
phone.on('message', (r) => { const m = JSON.parse(r); if (m.t === 'state') state = m; else if (m.t === 'screen') screen = m; else if (m.ref) replies.get(m.ref)?.(m); });
await new Promise((r) => phone.on('open', r));
const ask = (o) => new Promise((res) => { o.ref = ++ref; replies.set(o.ref, res); phone.send(JSON.stringify(o)); });
const plano = () => (screen?.lines || []).join('');
const gancho = (instance, ev) => fetch(`http://127.0.0.1:${PORT}/ingest/hook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-painel-secret': cfg.agentSecret }, body: JSON.stringify({ account: 'conta1', instance, event: ev }) });
await ate(() => state);

const s1 = await ask({ t: 'start', account: 'conta1', cwd: repo, model: 'sonnet', cols: 70, rows: 30 });
const s2 = await ask({ t: 'start', account: 'conta1', cwd: semGit, model: 'sonnet', cols: 70, rows: 30 });
ok(s1.t === 'ack' && s2.t === 'ack', 'duas sessoes abertas: uma no repositorio e outra numa pasta sem git');
const id = s1.instance;
const r1 = await ask({ t: 'diff', instance: id });
ok(r1.t === 'ack' && r1.git && r1.arquivos.some((f) => f.caminho === 'frete.js' && f.somadas === 2) && r1.arquivos.some((f) => f.caminho === 'novo.md'), 'mensagem diff devolve os arquivos mudados e os novos da pasta da sessao');
const r2 = await ask({ t: 'diff', instance: s2.instance });
ok(r2.t === 'ack' && r2.git === false && r2.msg, 'diff de sessao numa pasta sem git avisa que nao e repositorio');
const outra = await ask({ t: 'diff', instance: s2.instance, cwd: repo });
ok(outra.t === 'err' && /própria sessão/.test(outra.msg), 'pedir o diff da pasta de outra sessao e recusado');
ok((await ask({ t: 'diff', instance: 'nao-existe' })).t === 'err', 'diff de sessao que nao existe e recusado');
const arq = await ask({ t: 'arquivos', instance: id, q: 'fre' });
ok(arq.t === 'ack' && arq.itens[0] === 'frete.js', 'mensagem arquivos (o @) busca na pasta da sessao');

// ---------------------------------------------------------------- fila de mensagens
await ate(() => state.instances.find((i) => i.id === id)?.pergunta);
await ask({ t: 'key', instance: id, key: '1' });
phone.send(JSON.stringify({ t: 'term', instance: id, on: true, cols: 70, rows: 30 }));
await ate(() => /escreva|> $/.test(plano()) || /shift\+tab/.test(state.instances.find((i) => i.id === id).rodape));
await gancho(id, { hook_event_name: 'UserPromptSubmit' });
await ate(() => state.instances.find((i) => i.id === id).status === 'working');
await ask({ t: 'send', instance: id, text: 'primeira da fila' });
await ask({ t: 'send', instance: id, text: 'segunda da fila' });
await ate(() => state.instances.find((i) => i.id === id).fila?.length === 2);
let fila = state.instances.find((i) => i.id === id).fila;
ok(fila?.length === 2 && fila[0].texto === 'primeira da fila' && fila[0].id, 'com o agente trabalhando, as mensagens ficam na fila e o app ve a lista');
await sleep(800);
ok(!/got: "primeira da fila"/.test(plano()), 'mensagem na fila nao e digitada enquanto o turno nao acaba');
ok((await ask({ t: 'filaEditar', instance: id, id: fila[0].id, text: '!whoami' })).t === 'err', 'editar a fila passa pelo mesmo filtro das mensagens');
ok((await ask({ t: 'filaEditar', instance: id, id: fila[0].id, text: 'primeira editada' })).t === 'ack', 'editar uma mensagem da fila');
ok((await ask({ t: 'filaTirar', instance: id, id: fila[1].id })).t === 'ack', 'tirar uma mensagem da fila');
await ate(() => state.instances.find((i) => i.id === id).fila?.length === 1 && state.instances.find((i) => i.id === id).fila[0].texto === 'primeira editada');
fila = state.instances.find((i) => i.id === id).fila;
ok(fila.length === 1 && fila[0].texto === 'primeira editada', 'a fila mostrada no app acompanha a edicao e a retirada');
ok((await ask({ t: 'filaTirar', instance: id, id: 'f999' })).t === 'err', 'tirar da fila uma mensagem que ja saiu avisa');
await gancho(id, { hook_event_name: 'Stop', last_assistant_message: 'pronto' });
await ate(() => /got: "primeira editada"/.test(plano()));
ok(/got: "primeira editada"/.test(plano()) && !/segunda da fila/.test(plano()), 'quando o turno acaba, a fila sai sozinha (com o texto editado e sem a tirada)');
await ate(() => state.instances.find((i) => i.id === id).fila?.length === 0);
ok(state.instances.find((i) => i.id === id).fila.length === 0, 'a fila esvazia no app');
await ask({ t: 'send', instance: id, text: 'sem turno' });
await ate(() => /got: "sem turno"/.test(plano()));
ok(/got: "sem turno"/.test(plano()), 'com o agente parado, a mensagem vai direto, sem fila');

await ask({ t: 'stop', instance: id }); await ask({ t: 'stop', instance: s2.instance });
await sleep(400);
phone.close(); hub.kill();
for (const p of [repo, semGit, TMP]) fs.rmSync(p, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nMudancas, @ e fila: tudo certo.');
process.exit(process.exitCode || 0);
