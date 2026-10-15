// App do duckV para o computador: a chave entregue pelo canal IPC, o que so ele pode fazer e o que
// nunca pode vazar para um celular ou para a rede. Roda contra um duckV de verdade numa pasta temporaria.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const P = 18781;
const CODIGO = 'codigo-de-teste-desktop-0123456789ab';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-desk-'));
fs.writeFileSync(path.join(tmp, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(tmp, 'c1') }]));
const base = `http://127.0.0.1:${P}`;
const env = {
  ...process.env,
  PAINEL_DATA: tmp,
  PAINEL_CONTAS: path.join(tmp, 'contas.json'),
  PAINEL_PORT: String(P),
  PAINEL_CODIGO: CODIGO,
  PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(ROOT, 'tests', 'terminal-de-mentira.mjs')]),
};
const hub = spawn(process.execPath, [path.join(ROOT, 'hub', 'server.mjs'), '--sem-qr', '--desktop'], { env, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
let saida = '';
hub.stdout.on('data', (d) => (saida += d));
hub.stderr.on('data', (d) => (saida += d));
const CHAVE = crypto.randomBytes(32).toString('base64url');
hub.send({ t: 'desktop', chave: CHAVE });
// Uma segunda chave mandada depois nao pode trocar a primeira.
const OUTRA = crypto.randomBytes(32).toString('base64url');
hub.send({ t: 'desktop', chave: OUTRA });

for (let i = 0; i < 80; i++) {
  try {
    await fetch(`${base}/`);
    break;
  } catch {
    await sleep(150);
  }
}

function pedido(caminho, headers = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: P, path: caminho, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: b }));
    });
    req.on('error', () => resolve({ status: 0, headers: {}, corpo: '' }));
    req.end();
  });
}
// Liga o WebSocket com uma chave e devolve um cliente com fila de mensagens e pedidos com resposta.
function cliente(chave) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${P}/ws`, { headers: { cookie: `painel=${chave}` } });
    const msgs = [];
    let ref = 0;
    const c = {
      ws,
      msgs,
      mandar: (o) => ws.send(JSON.stringify(o)),
      pedir: (o, ms = 3000) =>
        new Promise((r) => {
          const id = ++ref + 1000;
          const t = setTimeout(() => r(null), ms);
          const f = (raw) => {
            const m = JSON.parse(raw);
            if (m.ref === id) {
              clearTimeout(t);
              ws.off('message', f);
              r(m);
            }
          };
          ws.on('message', f);
          ws.send(JSON.stringify({ ...o, ref: id }));
        }),
      esperar: async (pred, ms = 6000) => {
        for (let i = 0; i < ms / 50; i++) {
          const m = msgs.find(pred);
          if (m) return m;
          await sleep(50);
        }
        return null;
      },
    };
    ws.on('message', (raw) => msgs.push(JSON.parse(raw)));
    ws.on('open', () => resolve(c));
    ws.on('error', () => resolve(null));
    ws.on('unexpected-response', () => resolve(null));
  });
}

// ---------------------------------------------------------------- a chave do app
ok((await pedido('/api/state', { cookie: `painel=${CHAVE}` })).status === 200, 'chave do app entra pela conexao do proprio computador');
ok((await pedido('/api/state', { cookie: `painel=${OUTRA}` })).status === 401, 'segunda chave mandada pelo IPC e ignorada');
ok((await pedido('/api/state', { cookie: `painel=${CHAVE}`, 'x-forwarded-for': '100.64.0.9' })).status === 401, 'chave do app nao vale quando chega pela rede (Tailscale)');
ok((await pedido('/api/state', { cookie: `painel=${CHAVE.slice(0, -1)}A` })).status === 401, 'chave parecida nao entra');
ok(!fs.readdirSync(tmp).some((f) => fs.readFileSync(path.join(tmp, f), 'utf8').includes(CHAVE)), 'a chave do app nao e gravada na pasta de dados');
ok(!(fs.existsSync(path.join(tmp, 'aparelhos.json')) && fs.readFileSync(path.join(tmp, 'aparelhos.json'), 'utf8').includes('desktop')), 'o app nao vira um aparelho salvo');

// Um celular pareado (pareamento automatico dos testes) para comparar.
const par = await fetch(`${base}/parear?k=${CODIGO}`, { redirect: 'manual' });
const chaveCel = (par.headers.get('set-cookie') || '').split(';')[0].slice('painel='.length);
const cel = await cliente(chaveCel);
const app = await cliente(CHAVE);
ok(!!cel && !!app, 'celular e app conectam no WebSocket');
const estCel = await cel.esperar((m) => m.t === 'state');
const estApp = await app.esperar((m) => m.t === 'state');
ok(estApp?.desktop?.link?.includes(CODIGO) && Array.isArray(estApp.desktop.qr) && estApp.desktop.qr.length > 20, 'o app recebe o link e o QR de pareamento');
ok(estCel && !('desktop' in estCel) && !JSON.stringify(estCel).includes(CODIGO), 'o celular nao recebe o codigo de pareamento nem a lista de aparelhos');

// ---------------------------------------------------------------- pedidos que so o app pode fazer
const semResposta = async (o) => (await cel.pedir(o, 1200)) === null;
ok(await semResposta({ t: 'parear', numeros: '1234' }), 'celular nao consegue responder pareamento');
ok(await semResposta({ t: 'parearNovoCodigo' }), 'celular nao consegue trocar o codigo de pareamento');
ok(await semResposta({ t: 'aparelhoTirar', id: 'x' }), 'celular nao consegue desconectar aparelhos');
ok(await semResposta({ t: 'terminalDoSistema', account: 'conta1', cwd: os.homedir() }), 'celular nao consegue abrir janelas de terminal no computador');
ok(await semResposta({ t: 'cru', instance: 'x', on: true }), 'celular nao recebe a saida crua do terminal');

// O app abre uma sessao com o terminal de mentira e liga o terminal de verdade.
const ini = await app.pedir({ t: 'start', account: 'conta1', cwd: os.homedir(), cols: 80, rows: 24 }, 8000);
ok(ini?.t === 'ack' && ini.instance, 'o app abre uma sessao');
const inst = ini?.instance;
await sleep(800);

// ---------------------------------------------------------------- botao de pergunta na notificacao do celular
// O terminal de mentira abre perguntando se confia na pasta (opcoes 1 e 2).
const tecla = (key, chave = chaveCel) => fetch(`${base}/api/tecla`, { method: 'POST', headers: { cookie: `painel=${chave}` }, body: JSON.stringify({ instance: inst, key }) }).then((r) => r.status);
ok((await tecla('1', 'chave-falsa')) === 401, 'notificacao: sem chave de celular nao responde pergunta');
ok((await tecla('7')) === 409, 'notificacao: opcao que nao esta na tela e recusada');
ok((await tecla('\r')) === 409, 'notificacao: tecla qualquer (Enter) e recusada');
ok((await tecla('1')) === 200, 'notificacao: opcao que esta na tela e respondida');
await sleep(600);
ok((await tecla('1')) === 409, 'notificacao: a mesma pergunta nao responde duas vezes');
const cru = await app.pedir({ t: 'cru', instance: inst, on: true, cols: 90, rows: 26 });
ok(cru?.t === 'ack', 'o app liga o terminal de verdade da sessao');
ok(!!(await app.esperar((m) => m.t === 'cru' && m.instance === inst && m.inicio)), 'o terminal comeca com a tela atual');
// Controle: a tecla crua do app chega ao programa (a pasta ja foi aceita pela notificacao; digita e Enter).
app.mandar({ t: 'cruEntrada', instance: inst, data: 'ECO-DO-APP' });
await sleep(300);
app.mandar({ t: 'cruEntrada', instance: inst, data: '\r' });
await sleep(800);
const doApp = app.msgs.filter((m) => m.t === 'cru' && m.instance === inst).map((m) => m.data || '').join('');
ok(doApp.includes('got: "ECO-DO-APP"'), 'tecla crua do app chega ao programa do terminal');
// Celular manda tecla crua: nada pode chegar ao terminal.
cel.mandar({ t: 'cruEntrada', instance: inst, data: 'ECO-DO-CELULAR\r' });
app.mandar({ t: 'cruEntrada', instance: inst, data: 'x'.repeat(9000) }); // grande demais: ignorado
await sleep(1200);
const crus = app.msgs.filter((m) => m.t === 'cru' && m.instance === inst).map((m) => m.data || '').join('');
ok(!crus.includes('ECO-DO-CELULAR'), 'tecla crua mandada pelo celular nao chega ao terminal');
ok(!crus.includes('x'.repeat(9000)), 'entrada crua acima do limite e ignorada');
ok(!cel.msgs.some((m) => m.t === 'cru'), 'o celular nunca recebe a saida crua');

// Varias conversas abertas ao mesmo tempo (paineis lado a lado) so no app.
app.mandar({ t: 'open', instance: inst, junto: true });
ok(!!(await app.esperar((m) => m.t === 'history' && m.instance === inst)), 'o app abre uma conversa num painel sem fechar as outras');

// ---------------------------------------------------------------- pareamento pela janela
await sleep(300);
const pagina = await pedido('/desktop.html');
ok(pagina.status === 200 && /style-src 'self' 'unsafe-inline'/.test(pagina.headers['content-security-policy'] || ''), 'so a pagina do app aceita estilo criado pelo script (xterm)');
ok(/script-src 'self';/.test(pagina.headers['content-security-policy'] || ''), 'a pagina do app continua sem script de fora ou embutido');
ok(!/unsafe-inline/.test((await pedido('/index.html')).headers['content-security-policy'] || ''), 'a pagina do celular continua sem estilo embutido');
ok((await pedido('/vendor/xterm.js')).status === 200, 'o xterm.js e servido');
for (const c of ['/vendor/../package.json', '/vendor/%2e%2e/package.json', '/vendor/xterm.js/../../package.json', '/node_modules/ws/package.json', '/vendor/'])
  ok((await pedido(c)).status === 404, `nada mais de node_modules sai pelo servidor: ${c}`);

for (const c of [cel, app]) c?.ws.close();
hub.kill();
await sleep(300);
fs.rmSync(tmp, { recursive: true, force: true });
if (process.exitCode) console.log(saida.slice(-2000));
