// Bateria de ataques contra um duckV de verdade (pasta temporaria, nada das suas contas):
// DNS rebinding, sequestro do WebSocket por outro site, CSRF, segredo dos agentes, caminhos para
// fora do app (inclusive truques do Windows), limites de tamanho, vazamento de segredos e
// forca bruta no pareamento. Cada caso e um ataque conhecido em ferramentas parecidas.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function novoHub(porta, extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-seg-'));
  fs.writeFileSync(path.join(tmp, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(tmp, 'c1') }]));
  const env = { ...process.env, PAINEL_DATA: tmp, PAINEL_CONTAS: path.join(tmp, 'contas.json'), PAINEL_PORT: String(porta), ...extra };
  const proc = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const h = { proc, tmp, saida: '', base: `http://127.0.0.1:${porta}`, porta };
  proc.stdout.on('data', (d) => (h.saida += d));
  proc.stderr.on('data', (d) => (h.saida += d));
  return h;
}
async function esperarNoAr(h) {
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`${h.base}/`);
      return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('o duckV de teste nao ligou');
}
// Pedido HTTP cru: o fetch nao deixa mudar o Host nem mandar caminhos sem normalizar.
function cru(porta, { method = 'GET', caminho = '/', headers = {}, corpo = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: porta, method, path: caminho, headers, setHost: !('host' in headers) && !('Host' in headers) }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: b }));
    });
    req.on('error', (e) => resolve({ status: 0, erro: e.code, corpo: '' }));
    if (corpo) req.write(corpo);
    req.end();
  });
}
// Bytes crus no socket, para pedidos que nem o http do Node aceita montar.
function socketCru(porta, texto) {
  return new Promise((resolve) => {
    const s = net.connect(porta, '127.0.0.1', () => s.write(texto));
    let b = '';
    s.on('data', (d) => (b += d));
    s.on('close', () => resolve(b));
    s.on('error', () => resolve(b));
    setTimeout(() => s.destroy(), 3000);
  });
}
// Abre o WebSocket do celular; devolve true se conectou.
function wsAbre(porta, headers, caminho = '/ws') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${porta}${caminho}`, { headers });
    ws.on('open', () => { ws.close(); resolve(true); });
    ws.on('error', () => resolve(false));
    ws.on('unexpected-response', () => resolve(false));
  });
}

// ================================================================ hub de teste (pareamento automatico)
const P = 18771;
const CODIGO = 'codigo-de-teste-seguranca-0123456789';
const hub = novoHub(P, { PAINEL_CODIGO: CODIGO });
await esperarNoAr(hub);
const cfg = JSON.parse(fs.readFileSync(path.join(hub.tmp, 'config.json'), 'utf8'));
const par = await fetch(`${hub.base}/parear?k=${CODIGO}`, { redirect: 'manual' });
const setCookie = par.headers.get('set-cookie') || '';
const cookie = setCookie.split(';')[0];
const chave = cookie.slice('painel='.length);
const EVIL = `evil.test:${P}`;

// ---------------------------------------------------------------- DNS rebinding
ok((await cru(P, { headers: { host: EVIL } })).status === 421, 'rebinding: pagina pedida com Host de outro site e recusada');
ok((await cru(P, { caminho: `/parear?k=${CODIGO}`, headers: { host: EVIL } })).status === 421, 'rebinding: site de fora nao consegue parear mesmo com o codigo');
ok((await cru(P, { method: 'POST', caminho: '/api/parear', headers: { host: EVIL, 'content-type': 'application/json' }, corpo: JSON.stringify({ k: CODIGO }) })).status === 421, 'rebinding: API de pareamento recusa Host de fora');
ok((await cru(P, { method: 'POST', caminho: '/api/parear/espera', headers: { host: EVIL }, corpo: '{"espera":"x"}' })).status === 421, 'rebinding: consulta do pareamento recusa Host de fora');
ok((await cru(P, { caminho: '/api/state', headers: { host: EVIL, cookie, origin: `http://${EVIL}` } })).status === 421, 'rebinding: API com cookie valido e Origin igual ao Host de fora e recusada');
ok(!(await wsAbre(P, { cookie, host: EVIL, origin: `http://${EVIL}` })), 'rebinding: WebSocket com Host e Origin de fora nao abre');
ok((await cru(P, { headers: { host: `localhost:${P}` } })).status === 200 && (await cru(P, { headers: { host: `[::1]:${P}` } })).status === 200, 'localhost e [::1] continuam funcionando');
ok((await cru(P, { headers: { host: `evil.test@127.0.0.1:${P}` } })).status === 421, 'Host com usuario@ (truque de URL) e recusado');
ok(/^HTTP\/1\.[01] (400|421)/.test(await socketCru(P, 'GET / HTTP/1.0\r\n\r\n')), 'pedido sem Host e recusado');

// ---------------------------------------------------------------- WebSocket sequestrado por outro site (CSWSH) e CSRF
ok(await wsAbre(P, { cookie }), 'app (sem Origin) conecta no WebSocket');
ok(await wsAbre(P, { cookie, origin: `http://127.0.0.1:${P}` }), 'pagina do proprio duckV conecta no WebSocket');
for (const origin of ['https://evil.test', 'null', `http://localhost.evil.test:${P}`, `http://127.0.0.1.evil.test:${P}`, `http://127.0.0.1:${P + 1}`, 'file://'])
  ok(!(await wsAbre(P, { cookie, origin })), `CSWSH: WebSocket com Origin ${origin} nao abre`);
ok(!(await wsAbre(P, {})) && !(await wsAbre(P, { cookie: 'painel=inventado' })) && !(await wsAbre(P, { cookie: `painel=${chave.slice(0, -1)}x` })), 'WebSocket sem chave, com chave inventada ou quase certa nao abre');
ok((await cru(P, { method: 'POST', caminho: '/api/desparear', headers: { cookie, origin: 'https://evil.test' } })).status === 403 && (await fetch(`${hub.base}/api/state`, { headers: { cookie } })).status === 200, 'CSRF: outro site nao consegue desparear o celular');

// ---------------------------------------------------------------- cookie
ok(/HttpOnly/i.test(setCookie) && /SameSite=(Lax|Strict)/i.test(setCookie) && /Path=\//.test(setCookie), 'cookie com HttpOnly, SameSite e Path');
ok(chave.length >= 43, `chave do celular com 256 bits (${chave.length} caracteres)`);
{
  const r = await cru(P, { caminho: `/parear?k=${CODIGO}`, headers: { 'x-forwarded-proto': 'https' } });
  ok(/;\s*Secure/i.test(r.headers['set-cookie']?.[0] || ''), 'cookie Secure quando chega por HTTPS (Tailscale)');
}

// ---------------------------------------------------------------- canal dos agentes
const hook = (headers) => cru(P, { method: 'POST', caminho: '/ingest/hook', headers: { 'content-type': 'application/json', ...headers }, corpo: '{"hook_event_name":"Notification","session_id":"s"}' });
ok((await hook({})).status === 403, 'canal dos agentes sem segredo e recusado');
ok((await hook({ 'x-painel-secret': cfg.agentSecret.slice(0, -1) + (cfg.agentSecret.endsWith('a') ? 'b' : 'a') })).status === 403, 'segredo quase certo e recusado');
ok((await hook({ 'x-painel-secret': cfg.agentSecret + 'x' })).status === 403 && (await hook({ 'x-painel-secret': '' })).status === 403, 'segredo de outro tamanho ou vazio e recusado');
ok((await hook({ 'x-painel-secret': cfg.agentSecret, 'x-forwarded-for': '100.64.0.9' })).status === 403, 'segredo certo vindo pela rede (Tailscale) e recusado');
ok((await hook({ 'x-painel-secret': cfg.agentSecret })).status === 200, 'segredo certo direto do computador funciona');
ok(!(await wsAbre(P, { 'x-painel-secret': 'errado' }, '/agent')) && !(await wsAbre(P, { 'x-painel-secret': cfg.agentSecret, 'x-forwarded-for': '1.2.3.4' }, '/agent')), 'WebSocket dos agentes recusa segredo errado ou vindo pela rede');

// ---------------------------------------------------------------- caminhos para fora do app
const segredos = [cfg.agentSecret, cfg.vapid.privateKey];
const caminhos = ['/../data/config.json', '/..%2fdata%2fconfig.json', '/%2e%2e/%2e%2e/data/config.json', '/%252e%252e/data/config.json', '/..%5cdata%5cconfig.json', '/..\\data\\config.json',
  '/C:/Windows/win.ini', '/c:%5cwindows%5cwin.ini', '/%5c%5c127.0.0.1%5cc$%5cwindows%5cwin.ini', '/index.html::$DATA', '/app.js::$DATA', '/CON', '/NUL', '/AUX.txt', '/COM1', '/%00', '/index.html%00.js',
  '/%c0%ae%c0%ae/data/config.json', '/app.js/..%2f..%2fdata/config.json', '/.%2e/.%2e/package.json', '/api/arquivo/..%2f..%2fdata%2fconfig.json', '/api/img/..%2f..%2fdata%2fconfig.json'];
let vazou = [], quebrou = [];
for (const c of caminhos) {
  const r = await cru(P, { caminho: c, headers: { cookie } });
  if (segredos.some((s) => r.corpo.includes(s)) || r.corpo.includes('"agentSecret"') || r.corpo.includes('[fonts]') || r.corpo.includes('"name": "duckv"')) vazou.push(c);
  if (r.status === 0 || r.status >= 500) quebrou.push(`${c} (${r.status || r.erro})`);
}
ok(!vazou.length, `${caminhos.length} caminhos de travessia (inclusive Windows: ::$DATA, CON, UNC) nao vazam nada${vazou.length ? ': ' + vazou.join(' ') : ''}`);
ok(!quebrou.length, `nenhum caminho hostil derruba o servidor${quebrou.length ? ': ' + quebrou.join(' ') : ''}`);
ok((await cru(P, { caminho: '/api/arquivo/inventado', headers: { cookie } })).status === 404, 'arquivo com id inventado nao existe');

// ---------------------------------------------------------------- limites
{
  const grande = await cru(P, { method: 'POST', caminho: '/api/parear', headers: { 'content-type': 'application/json' }, corpo: '{"k":"' + 'x'.repeat(200 * 1024) + '"}' });
  ok(grande.status === 0 || grande.status >= 400, `corpo de 200 KB no pareamento e cortado (status ${grande.status || grande.erro})`);
  const muitos = {};
  for (let i = 0; i < 3000; i++) muitos[`x-h${i}`] = 'a';
  const r = await cru(P, { headers: muitos });
  ok(r.status === 431 || r.status === 400 || r.status === 0, `3000 cabecalhos sao recusados (status ${r.status || r.erro})`);
  const codigoWs = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${P}/ws`, { headers: { cookie } });
    ws.on('open', () => ws.send('x'.repeat(100 * 1024)));
    ws.on('close', (c) => resolve(c));
    ws.on('error', () => {});
    setTimeout(() => resolve(-1), 4000);
  });
  ok(codigoWs === 1009, `mensagem de 100 KB no WebSocket fecha a conexao (codigo ${codigoWs})`);
  ok((await fetch(`${hub.base}/api/state`, { headers: { cookie } })).status === 200, 'depois dos abusos o servidor continua atendendo');
}

// ---------------------------------------------------------------- poluicao de prototipo e vazamento
{
  await cru(P, { method: 'POST', caminho: '/api/parear', headers: { 'content-type': 'application/json' }, corpo: '{"__proto__":{"poluido":"sim"},"constructor":{"prototype":{"poluido":"sim"}},"k":"x"}' });
  const estado = await (await fetch(`${hub.base}/api/state`, { headers: { cookie } })).text();
  ok(!estado.includes('poluido'), '__proto__ e constructor.prototype no corpo nao poluem o servidor');
  ok(!segredos.some((s) => estado.includes(s)) && !estado.includes(chave), 'o estado mandado ao celular nao tem segredo, chave VAPID privada nem chave do celular');
  const aparelhos = fs.readFileSync(path.join(hub.tmp, 'aparelhos.json'), 'utf8');
  ok(!aparelhos.includes(chave), 'no disco fica so o resumo (hash) da chave do celular');
  ok(!segredos.some((s) => hub.saida.includes(s)) && !hub.saida.includes(chave), 'a janela do duckV nunca mostra segredo nem chave');
}

// ---------------------------------------------------------------- cabecalhos de seguranca em toda resposta
for (const [nome, r] of [['404', await cru(P, { caminho: '/nao-existe' })], ['421', await cru(P, { headers: { host: EVIL } })], ['401', await cru(P, { caminho: '/api/state' })], ['pagina', await cru(P)]])
  ok(/frame-ancestors 'none'/.test(r.headers['content-security-policy'] || '') && r.headers['x-content-type-options'] === 'nosniff', `resposta ${nome} leva CSP e nosniff`);
hub.proc.kill();

// ================================================================ pareamento de verdade (com confirmacao no computador)
const P2 = 18772;
const h2 = novoHub(P2);
await esperarNoAr(h2);
await sleep(300);
const codigo = [...h2.saida.matchAll(/parear\?k=([\w-]+)/g)].at(-1)?.[1];
ok(codigo && codigo.length >= 32, `codigo do QR com pelo menos 192 bits (${codigo?.length} caracteres)`);
const pedir = () => fetch(`${h2.base}/api/parear`, { method: 'POST', body: JSON.stringify({ k: codigo, nome: 'Intruso' }) });
const pedidos = [];
for (let i = 0; i < 3; i++) pedidos.push(await (await pedir()).json());
ok((await pedir()).status === 429, 'quarto pedido aberto ao mesmo tempo e recusado (nao da para inundar a janela)');
const usados = new Set(pedidos.map((p) => p.sas));
const errados = ['0000', '1111', '2222', '3333', '4444', '5555'].filter((s) => !usados.has(s)).slice(0, 3);
for (const s of errados) {
  h2.proc.stdin.write(`${s}\n`);
  await sleep(150);
}
const estados = await Promise.all(pedidos.map(async (p) => (await (await fetch(`${h2.base}/api/parear/espera`, { method: 'POST', body: JSON.stringify({ espera: p.espera }) })).json()).estado));
ok(estados.every((e) => e === 'negado'), `tres numeros errados derrubam todos os pedidos abertos (${estados.join(', ')})`);
let erradosK = 0;
for (let i = 0; i < 30; i++) if ((await fetch(`${h2.base}/api/parear`, { method: 'POST', body: JSON.stringify({ k: codigo.slice(0, -1) + String(i % 10) }) })).status === 403) erradosK++;
ok(erradosK >= 29, 'codigos de QR quase certos sao sempre recusados');
h2.proc.kill();

for (const h of [hub, h2]) fs.rmSync(h.tmp, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nSeguranca: tudo certo.');
process.exit(process.exitCode || 0);
