// Teste do "Todas as contas": uma sessao por conta, na mesma pasta, com o briefing de equipe.
// No lugar do Claude Code roda o terminal de mentira, entao nada gasta o seu limite.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { briefingEquipe, arquivoDaEquipe } from '../hub/equipe.mjs';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-equipe-'));
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const PORT = '18791';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const proj = path.join(os.homedir(), 'duckv-equipe-proj'); fs.mkdirSync(proj, { recursive: true });
// Nove contas: as tres primeiras formam a equipe dos testes e o resto serve para estourar o limite de 8.
const NOMES = ['Trabalho', 'Pessoal', 'Estudos', 'Quarta', 'Quinta', 'Sexta', 'Setima', 'Oitava', 'Nona'];
const contas = NOMES.map((nome, i) => ({ id: `conta${i + 1}`, nome, cor: '#ff7a1a', dir: path.join(TMP, `c${i + 1}`) }));
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify(contas));
const env = { ...process.env, PAINEL_CODIGO: 'codigo-de-teste-0123456789', PAINEL_PORT: PORT, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), FAKE_HOOK: path.join(ROOT, 'agent/hook.mjs'), PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(AQUI, 'terminal-de-mentira.mjs')]) };
const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
await sleep(6500);
const pair = await fetch(`http://127.0.0.1:${PORT}/parear?k=codigo-de-teste-0123456789`, { redirect: 'manual' });
const cookie = pair.headers.get('set-cookie').split(';')[0];
const phone = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie } });
let state = null, screen = null; const replies = new Map(); let ref = 0;
phone.on('message', (r) => { const m = JSON.parse(r); if (m.t === 'state') state = m; else if (m.t === 'screen') screen = m; else if (m.ref) replies.get(m.ref)?.(m); });
await new Promise((r) => phone.on('open', r));
const ask = (o) => new Promise((res) => { o.ref = ++ref; replies.set(o.ref, res); phone.send(JSON.stringify(o)); });
const ate = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (cond()) return true; } catch {} await sleep(100); } return false; };
const plano = () => (screen?.lines || []).join('');
const sessao = (id) => state.instances.find((i) => i.id === id);
const hospedadas = () => state.instances.filter((i) => i.hosted).length;
await sleep(300);
// Alpine (musl) nao tem terminal embutido: sem ele nao ha sessao para abrir aqui.
if (state.host.available === false) {
  ok((await ask({ t: 'equipe', cwd: proj, texto: 'Divida a tarefa entre voces' })).t === 'err', 'sem terminal virtual, a equipe responde com o motivo');
  phone.close(); hub.kill(); fs.rmSync(proj, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true });
  console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nTodas as contas (sem terminal virtual): tudo certo.');
  process.exit(process.exitCode || 0);
}

// o briefing: quantos patos sao, qual e o seu, quem sao os outros e onde a divisao e combinada
const bri = briefingEquipe({ id: 'eq0a0b0c0d', ordem: 2, nomes: ['Trabalho', 'Pessoal', 'Estudos'], tarefa: 'Corrija o teste de pagamento.' });
ok(/um dos 3 patos/.test(bri) && /mesma pasta/.test(bri), 'o briefing diz quantos patos sao e que a pasta e a mesma');
ok(/pato 2, da conta Pessoal/.test(bri) && bri.includes('o pato 1 (Trabalho) e o pato 3 (Estudos)'), 'o briefing diz qual pato e o seu e quem sao os outros');
ok(bri.includes(arquivoDaEquipe('eq0a0b0c0d')) && /anota ali o que pegou/.test(bri), 'o briefing manda combinar a divisao no arquivo da pasta');
ok(bri.trimEnd().endsWith('Corrija o teste de pagamento.'), 'a tarefa vem no fim do briefing');

ok((await ask({ t: 'equipe', cwd: proj, texto: 'oi' })).t === 'err', 'tarefa curta demais e recusada');
ok((await ask({ t: 'equipe', cwd: proj, texto: 'x'.repeat(8001) })).t === 'err', 'tarefa longa demais e recusada');
ok((await ask({ t: 'equipe', cwd: '/etc', texto: 'Divida a tarefa entre voces' })).t === 'err', 'pasta fora das permitidas e recusada');
ok((await ask({ t: 'equipe', cwd: proj, texto: 'Divida a tarefa entre voces', contas: ['conta1'] })).t === 'err', 'equipe de uma conta so e recusada');
ok((await ask({ t: 'equipe', cwd: proj, texto: 'Divida a tarefa entre voces', contas: ['conta1', 'conta1'] })).t === 'err', 'a mesma conta repetida nao faz uma equipe');
// Sem a lista, entram as nove contas instaladas: passa do limite de 8 e nada e aberto.
const demais = await ask({ t: 'equipe', cwd: proj, texto: 'Divida a tarefa entre voces' });
await sleep(400);
ok(demais.t === 'err' && /8 sess/.test(demais.msg || '') && hospedadas() === 0, 'equipe maior que o limite de 8 e recusada antes de abrir qualquer sessao');

const tarefa = 'Divida esta tarefa entre voces e me avise';
const eq = await ask({ t: 'equipe', cwd: proj, texto: tarefa, contas: ['conta1', 'conta2', 'conta3'], cols: 120, rows: 40 });
ok(eq.t === 'ack' && /^eq[0-9a-f]{8}$/.test(eq.equipe || '') && eq.instances?.length === 3, `uma sessao por conta (${eq.msg || eq.equipe})`);
await ate(() => eq.instances?.every((x) => sessao(x)?.hosted));
const time = (eq.instances || []).map(sessao);
ok(time.every((s) => s?.equipe?.id === eq.equipe && s.equipe.total === 3), 'as tres sessoes levam o id da equipe no estado');
ok(time.map((s) => s?.equipe?.ordem).join() === '1,2,3', 'a ordem dos patos comeca em 1');
ok(time.map((s) => s?.account).join() === 'conta1,conta2,conta3', 'cada conta ganhou uma sessao');
ok(time.every((s) => s?.name === tarefa.slice(0, 50)), 'as sessoes da equipe se chamam pela tarefa');

// o briefing e a primeira mensagem da sessao: espera a caixa de mensagem aparecer e vai sozinho
const primeiro = eq.instances[0];
await ate(() => sessao(primeiro)?.pergunta);
await ask({ t: 'key', instance: primeiro, key: '1' });
phone.send(JSON.stringify({ t: 'term', instance: primeiro, on: true, cols: 120, rows: 40 }));
await ate(() => /um dos 3 patos do duckV/.test(plano()) && plano().includes(tarefa), 25000);
ok(plano().includes('Você é o pato 1, da conta Trabalho'), 'o briefing chega ao pato 1 depois de a caixa de mensagem aparecer');
ok(plano().includes(`.duckv/equipe-${eq.equipe}.md`) && plano().includes(tarefa), 'o briefing leva o arquivo da equipe e a tarefa');

// uma conta que falha nao impede as outras
const parcial = await ask({ t: 'equipe', cwd: proj, texto: tarefa, contas: ['conta4', 'conta5', 'conta-que-nao-existe'] });
ok(parcial.t === 'ack' && parcial.instances?.length === 2 && parcial.falhas?.length === 1, 'conta com problema nao impede as outras');
ok(parcial.falhas?.[0]?.conta === 'conta-que-nao-existe' && !!parcial.falhas[0].erro, 'a conta que falhou volta com o motivo');
ok(parcial.equipe !== eq.equipe, 'cada equipe ganha um id proprio');
// sessao aberta sozinha: nenhum campo de equipe no estado
const sozinha = await ask({ t: 'start', account: 'conta6', cwd: proj, model: 'sonnet' });
await ate(() => sessao(sozinha.instance)?.hosted);
ok(sozinha.t === 'ack' && !('equipe' in (sessao(sozinha.instance) || {})), 'sessao fora de uma equipe nao tem o campo equipe');

// agora sao 6 sessoes abertas: uma equipe de 4 nao cabe mais
await ate(() => hospedadas() === 6);
const semVaga = await ask({ t: 'equipe', cwd: proj, texto: tarefa, contas: ['conta6', 'conta7', 'conta8', 'conta9'] });
await sleep(400);
ok(semVaga.t === 'err' && hospedadas() === 6, 'equipe que nao cabe nas 8 sessoes e recusada sem abrir nenhuma');

for (const x of [...eq.instances, ...parcial.instances, sozinha.instance]) await ask({ t: 'stop', instance: x });
await ate(() => hospedadas() === 0);
phone.close(); hub.kill(); fs.rmSync(proj, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nTodas as contas: tudo certo.');
process.exit(process.exitCode || 0);
