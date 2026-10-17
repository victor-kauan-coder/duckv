// Retomar as sessoes depois que o duckV desliga: o estado salvo guarda as sessoes abertas pelo duckV que
// estavam vivas, e ao ligar de novo elas aparecem para retomar com --resume, na mesma conta, pasta,
// modelo e modo. No lugar do Claude Code roda o terminal de mentira, entao nada gasta limite.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, '..');
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const PORT = '18793';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};
const ate = async (cond, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (cond()) return true;
    } catch {
      /* ainda nao */
    }
    await sleep(150);
  }
  return false;
};
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-retomar-'));
// pasta do projeto dentro da pasta pessoal (folderAllowed so aceita de la); apagada no fim
const proj = fs.mkdtempSync(path.join(os.homedir(), 'duckv-retomar-proj-'));
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(TMP, 'c1') }]));
const env = { ...process.env, PAINEL_CODIGO: 'codigo-de-teste-retomar-0123456789', PAINEL_PORT: PORT, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), FAKE_HOOK: path.join(ROOT, 'agent/hook.mjs'), FAKE_SESSIONSTART: '1', PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(AQUI, 'terminal-de-mentira.mjs')]) };
const estadoSalvo = () => JSON.parse(fs.readFileSync(path.join(TMP, 'state.json'), 'utf8'));

let cookie = null;
async function ligar() {
  const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`);
      break;
    } catch {
      await sleep(150);
    }
  }
  if (!cookie) {
    const par = await fetch(`http://127.0.0.1:${PORT}/parear?k=codigo-de-teste-retomar-0123456789`, { redirect: 'manual' });
    cookie = par.headers.get('set-cookie').split(';')[0];
  }
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie } });
  const c = { hub, ws, state: null, screen: null, replies: new Map(), ref: 0 };
  ws.on('message', (r) => {
    const m = JSON.parse(r);
    if (m.t === 'state') c.state = m;
    else if (m.t === 'screen') c.screen = m;
    else if (m.ref) c.replies.get(m.ref)?.(m);
  });
  await new Promise((r) => ws.on('open', r));
  c.ask = (o) => new Promise((res) => {
    o.ref = ++c.ref;
    c.replies.set(o.ref, res);
    ws.send(JSON.stringify(o));
  });
  await ate(() => c.state);
  return c;
}
async function desligar(c) {
  c.ws.close();
  c.hub.kill();
  await new Promise((r) => c.hub.once('exit', r));
}

// ---------------------------------------------------------------- 1. o estado salvo guarda as vivas
let c = await ligar();
if (!c.state.host.available) {
  // sem terminal embutido (Linux com musl) nao ha sessao para retomar
  ok(true, 'terminal embutido indisponivel neste sistema: nada para retomar');
  await desligar(c);
  process.exit(process.exitCode || 0);
}
ok(Array.isArray(c.state.retomaveis) && c.state.retomaveis.length === 0, 'sem nada para retomar, o estado traz a lista vazia');
const st = await c.ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet', effort: 'high', mode: 'acceptEdits', name: 'Para retomar', cols: 60, rows: 24 });
ok(st.t === 'ack', `sessao aberta pelo duckV (${st.instance || st.msg})`);
// o terminal de mentira avisa o SessionStart (com o id da conversa) logo depois da pergunta da pasta
await ate(() => c.state.instances.find((i) => i.id === st.instance)?.pergunta);
await c.ask({ t: 'key', instance: st.instance, key: '1' });
const anotada = await ate(() => (estadoSalvo().retomar || []).some((r) => r.cwd === proj));
const r1 = (estadoSalvo().retomar || []).find((r) => r.cwd === proj);
ok(anotada && r1.account === 'conta1' && r1.model === 'sonnet' && r1.effort === 'high' && r1.mode === 'acceptEdits' && r1.name === 'Para retomar', 'a sessao viva fica anotada no estado salvo, com conta, pasta, modelo, esforco, modo e nome');
await desligar(c);

// ---------------------------------------------------------------- 2. ao ligar, oferece; retomar abre com --resume
// Uma conversa de verdade no historico da conta (o terminal de mentira grava a dele fora dele).
const sid = crypto.randomUUID();
const sumida = crypto.randomUUID();
const pastaProj = path.join(TMP, 'c1', 'projects', 'proj-retomar');
fs.mkdirSync(pastaProj, { recursive: true });
fs.writeFileSync(path.join(pastaProj, `${sid}.jsonl`), `${JSON.stringify({ type: 'user', cwd: proj, sessionId: sid, message: { role: 'user', content: 'Arrume o teste de login' }, timestamp: new Date().toISOString() })}\n`);
const salvo = estadoSalvo();
salvo.retomar = [
  { account: 'conta1', sessionId: sid, name: 'Arrumar login', cwd: proj, model: 'sonnet', effort: null, mode: 'acceptEdits', equipe: { id: 'eqabcd1234', ordem: 2, total: 3 } },
  { account: 'conta1', sessionId: sumida, name: 'Sumiu', cwd: proj, model: null, effort: null, mode: null },
  { account: 'conta-que-nao-existe', sessionId: crypto.randomUUID(), cwd: proj },
  { account: 'conta1', sessionId: 'id com espaco & calc', cwd: proj },
];
fs.writeFileSync(path.join(TMP, 'state.json'), JSON.stringify(salvo));
c = await ligar();
const ofertas = c.state.retomaveis.map((r) => r.sid);
ok(ofertas.length === 2 && ofertas.includes(sid) && ofertas.includes(sumida), 'ao ligar, o estado oferece as que estavam abertas (conta inexistente e id estranho ficam de fora)');
ok(!c.state.instances.some((i) => i.hosted), 'nada abre sozinho: retomar so com um toque');
const re = await c.ask({ t: 'retomar', sids: [sid] });
ok(re.t === 'ack' && re.instances.length === 1, 'retomar uma abre a sessao');
const nova = re.instances[0];
await ate(() => c.state.instances.find((i) => i.id === nova)?.pergunta);
await c.ask({ t: 'key', instance: nova, key: '1' });
c.ws.send(JSON.stringify({ t: 'term', instance: nova, on: true, cols: 90, rows: 24 }));
const viu = await ate(() => (c.screen?.lines || []).join('').includes(`--resume ${sid}`));
const inst = c.state.instances.find((i) => i.id === nova);
ok(viu, 'a sessao abre com --resume e o id da conversa');
ok(inst?.hosted && inst.account === 'conta1' && inst.cwd === proj && inst.permMode === 'acceptEdits', 'na mesma conta, pasta e modo');
ok(inst?.equipe?.id === 'eqabcd1234' && inst.equipe.ordem === 2, 'a sessao de uma equipe volta para a equipe');
ok(await ate(() => c.state.retomaveis.length === 1 && c.state.retomaveis[0].sid === sumida, 3000), 'a retomada sai da lista de ofertas');
const falha = await c.ask({ t: 'retomar', sids: [sumida] });
ok(falha.t === 'err' && /histórico/.test(falha.msg), 'conversa que sumiu do historico explica o motivo');
ok(await ate(() => c.state.retomaveis.length === 0, 3000), 'e tambem sai da lista');
await sleep(1800);
ok((estadoSalvo().retomar || []).some((r) => r.sessionId === sid), 'a retomada, viva, continua anotada para a proxima vez');
await c.ask({ t: 'stop', instance: nova });
await ate(() => c.state.instances.find((i) => i.id === nova)?.status === 'ended');
await sleep(1800);
ok(!(estadoSalvo().retomar || []).some((r) => r.sessionId === sid), 'encerrar a sessao tira ela da lista');
await desligar(c);

// ---------------------------------------------------------------- 3. descartar
const s2 = estadoSalvo();
s2.retomar = [{ account: 'conta1', sessionId: sid, cwd: proj }];
fs.writeFileSync(path.join(TMP, 'state.json'), JSON.stringify(s2));
c = await ligar();
ok(c.state.retomaveis.length === 1, 'oferecida de novo depois de religar');
const desc = await c.ask({ t: 'retomarDescartar' });
await ate(() => c.state.retomaveis.length === 0);
ok(desc.t === 'ack' && c.state.retomaveis.length === 0 && !c.state.instances.some((i) => i.hosted), 'descartar limpa a lista sem abrir nada');
await sleep(1800);
ok(!(estadoSalvo().retomar || []).length, 'e o estado salvo esquece');
await desligar(c);

fs.rmSync(proj, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nRetomar depois de desligar: tudo certo.');
