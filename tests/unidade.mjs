// Testes das pecas de seguranca que nao precisam do servidor: quem pode falar com o duckV (Host),
// o filtro do que o celular digita, a conferencia de caminhos das previas e expressoes regulares
// que leem texto vindo dos agentes. Inclui fuzzing com semente fixa (o mesmo sorteio a cada vez).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const { hostPermitido } = await imp('hub/rede.mjs');
const { textoPerigoso } = await imp('hub/filtro.mjs');
const { agenteDe, catalogo } = await imp('hub/agentes.mjs');
const pv = await imp('hub/previas.mjs');
const { parseEntry } = await imp('hub/transcript.mjs');
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const WIN = process.platform === 'win32';
// Sorteio repetivel (mulberry32): uma falha encontrada aqui volta igual na proxima execucao.
function sorteio(semente) {
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tempo = (f) => { const t0 = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - t0) / 1e6; };

// ---------------------------------------------------------------- Host (DNS rebinding)
for (const h of ['localhost:8765', '127.0.0.1:8765', '127.0.0.1', '[::1]:8765', 'LOCALHOST:8765', '100.101.102.103:443'])
  ok(hostPermitido(h), `Host aceito: ${h}`);
for (const h of ['evil.test', 'evil.test:8765', 'localhost.evil.test:8765', '127.0.0.1.nip.io:8765', 'evil@127.0.0.1', 'a b', 'localhost\r\nX: 1', '', null, undefined, 'x'.repeat(400), 'localhost:8765/../', 'pc.local'])
  ok(!hostPermitido(h), `Host recusado (rebinding ou malformado): ${JSON.stringify(h)?.slice(0, 40)}`);
ok(hostPermitido('pc.rede.ts.net', { tailnet: 'pc.rede.ts.net' }) && hostPermitido('PC.rede.ts.net', { tailnet: 'pc.rede.ts.net' }), 'nome do computador no Tailscale e aceito');
ok(hostPermitido('pc', { tailnet: 'pc.rede.ts.net' }), 'nome curto do MagicDNS e aceito');
ok(!hostPermitido('outro.rede.ts.net', { tailnet: 'pc.rede.ts.net' }), 'outro computador do Tailscale e recusado');
ok(hostPermitido('pc.local:8765', { lan: true }) && !hostPermitido('pc.local:8765'), '.local so com --lan');
{
  const r = sorteio(42);
  const pecas = ['localhost', '127.0.0.1', 'evil', '.test', ':', '8765', '@', '[', ']', '::1', '%', '/', '\\', '\u0000', 'é', ' ', '.', '-'];
  let estourou = 0, falsoAceito = 0;
  for (let i = 0; i < 5000; i++) {
    let h = '';
    for (let n = 1 + Math.floor(r() * 6); n--; ) h += pecas[Math.floor(r() * pecas.length)];
    try {
      if (hostPermitido(h) && /evil|\.test/.test(h)) falsoAceito++;
    } catch {
      estourou++;
    }
  }
  ok(estourou === 0 && falsoAceito === 0, `fuzzing do Host: 5000 entradas sem erro e sem aceitar nome de fora (${estourou} erros, ${falsoAceito} aceitos)`);
}

// ---------------------------------------------------------------- filtro do que o celular digita
const claude = agenteDe('claude');
for (const t of ['!rm -rf /', '   !whoami', '\n!dir', '\t!ls', '!'])
  ok(!!textoPerigoso(t, claude), `bloqueado: ${JSON.stringify(t)}`);
for (const t of ['/permissions', '/PERMISSIONS', '  /yolo', '/approvals', '/config', '/bashes', '/qualquer-coisa'])
  ok(!!textoPerigoso(t, claude), `comando de barra fora da lista bloqueado: ${t.trim()}`);
for (const t of ['/model sonnet', '/MODEL opus', '/compact', 'explique o arquivo', 'use o comando !ls no README', 'a/b/c'])
  ok(textoPerigoso(t, claude) === null, `liberado: ${JSON.stringify(t)}`);
ok(textoPerigoso('/minha-skill', claude, [{ nome: '/minha-skill', bloqueado: null }]) === null, 'skill instalada passa');
ok(!!textoPerigoso('/faxina', claude, [{ nome: '/faxina', bloqueado: 'roda sozinho' }]), 'skill que roda comandos sozinha fica bloqueada');
ok(catalogo().every((a) => !!textoPerigoso('!ls', agenteDe(a.id)) && !!textoPerigoso('/permissions', agenteDe(a.id)) === !agenteDe(a.id).comandos.some(([n]) => n === '/permissions')), 'todos os agentes barram ! e comandos fora da lista');

// ---------------------------------------------------------------- caminhos das previas
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-unid-'));
fs.mkdirSync(path.join(proj, 'sub'));
fs.writeFileSync(path.join(proj, 'index.html'), 'ok');
const inst = { cwd: proj };
const recusados = ['../fora.html', 'sub/../../fora.html', '.env', 'a/.git/config', 'node_modules/x/index.html', path.join(os.tmpdir(), 'fora.html'), '', '.'];
if (WIN) recusados.push('..\\fora.html', 'sub\\..\\..\\fora.html', 'C:\\Windows\\win.ini', 'c:/windows/win.ini', '\\\\servidor\\pasta\\x.html', '\\\\?\\C:\\Windows\\win.ini', 'D:fora.html');
for (const c of recusados) ok(pv.dentroDoProjeto(inst, c) === null, `caminho recusado: ${JSON.stringify(c)}`);
ok(pv.dentroDoProjeto(inst, 'sub/../index.html') === 'index.html', 'caminho com .. que continua dentro e normalizado');
{
  const r = sorteio(7);
  const pecas = ['..', '.', '/', '\\', 'sub', 'index.html', '.git', 'node_modules', 'C:', '%2e', '\u0000', 'é', '~', ' ', ':', '$DATA', 'CON', 'NUL'];
  let fugas = 0, erros = 0;
  for (let i = 0; i < 8000; i++) {
    let c = '';
    for (let n = 1 + Math.floor(r() * 7); n--; ) c += pecas[Math.floor(r() * pecas.length)];
    try {
      const rel = pv.dentroDoProjeto(inst, c);
      if (rel === null) continue;
      const alvo = path.resolve(proj, rel);
      if (!alvo.startsWith(proj + path.sep) || rel.split('/').some((p) => p.startsWith('.') || p === 'node_modules')) fugas++;
    } catch {
      erros++;
    }
  }
  ok(fugas === 0 && erros === 0, `fuzzing de caminhos: 8000 entradas, nenhuma escapa da pasta do projeto (${fugas} fugas, ${erros} erros)`);
}
// servirDaPasta com nomes armadilha do Windows e do sistema de arquivos: sempre 404, nunca estoura.
function resposta() {
  const r = { status: 0, corpo: '', writeHead(c) { r.status = c; return r; }, end(b) { if (b) r.corpo += b; }, on() { return r; }, once() { return r; }, emit() {}, write() { return true; }, destroy() {} };
  return r;
}
for (const nome of ['index.html::$DATA', 'index.html.', 'index.html ', 'CON', 'NUL.html', 'AUX.html', 'COM1.html', 'index.html%00.png', 'index.html\u0000.png', '%2e%2e/fora.html', '..%2ffora.html', '..%5cfora.html', 'INDEX~1.HTM']) {
  const r = resposta();
  let erro = null;
  try {
    pv.servirDaPasta(r, inst, encodeURIComponent(nome).replace(/%25/g, '%'), {});
  } catch (e) {
    erro = e;
  }
  // INDEX~1.HTM e o nome curto do proprio index.html (quando o disco tem nomes 8.3): pode abrir, e o mesmo arquivo.
  const mesmoIndex = r.status === 200 && /^index(\.html|~1\.htm)$/i.test(nome.trim().replace(/\.$/, ''));
  ok(!erro && (r.status === 404 || mesmoIndex), `arquivo armadilha nao vaza nem quebra: ${JSON.stringify(nome)} (status ${r.status || 'stream'})`);
}
// Windows com nomes curtos 8.3 ligados: .segredos ganha um apelido como SEGRED~1, que nao comeca com ponto.
if (WIN) {
  fs.mkdirSync(path.join(proj, '.segredos'));
  fs.writeFileSync(path.join(proj, '.segredos', 'chave.json'), '{"segredo":"SEGREDO"}');
  const lista = spawnSync('cmd.exe', ['/d', '/c', 'dir', '/x', '/a', proj], { encoding: 'utf8' }).stdout || '';
  const curto = lista.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find((p) => p.at(-1) === '.segredos' && /~\d/.test(p.at(-2) || ''))?.at(-2);
  if (curto) {
    const r = resposta();
    pv.servirDaPasta(r, inst, `${curto}/chave.json`, {});
    ok(r.status === 404 && !r.corpo.includes('SEGREDO'), `pasta escondida pelo nome curto 8.3 (${curto}) continua escondida`);
  } else ok(true, 'nomes curtos 8.3 desligados neste disco (o caso e testado onde estiverem ligados)');
}
// Atalho (link simbolico) para uma pasta vizinha de nome parecido: o prefixo igual nao basta.
{
  const vizinha = proj + '-segredos';
  fs.mkdirSync(vizinha, { recursive: true });
  fs.writeFileSync(path.join(vizinha, 'segredo.html'), 'SEGREDO');
  let criou = true;
  try {
    fs.symlinkSync(vizinha, path.join(proj, 'atalho'), WIN ? 'junction' : 'dir');
  } catch {
    criou = false;
  }
  if (criou) {
    const r = resposta();
    pv.servirDaPasta(r, inst, 'atalho/segredo.html', {});
    ok(r.status === 404 && !r.corpo.includes('SEGREDO'), 'atalho para pasta vizinha (C:\\proj-segredos) e recusado');
  } else ok(true, 'atalho para pasta vizinha: sistema nao deixou criar o atalho (pulado)');
}

// ---------------------------------------------------------------- expressoes regulares com texto hostil (ReDoS)
{
  const hostis = [
    'http://localhost:' + '1'.repeat(200000),
    'http://localhost:'.repeat(20000),
    'https://claude.ai/artifact/' + 'a'.repeat(200000),
    'https://claude.ai/code/artifact/'.repeat(8000),
    ('<x>').repeat(30000),
  ];
  const pior = Math.max(...hostis.map((t) => tempo(() => pv.lerTexto({ cwd: proj }, t, 8765))));
  ok(pior < 250, `previas leem 200 KB de texto hostil rapido (${pior.toFixed(1)} ms no pior caso)`);
  const conteudos = ['<system-reminder>'.repeat(20000), '<pasted_content id="a">'.repeat(15000), '<command-name>'.repeat(20000), '<a>'.repeat(30000) + 'x', 'Task #' + '9'.repeat(100000)];
  const piorT = Math.max(...conteudos.map((c) => tempo(() => parseEntry({ type: 'user', uuid: 'u', timestamp: '2026-10-14T00:00:00Z', message: { role: 'user', content: c } }))));
  ok(piorT < 500, `leitura da conversa aguenta mensagens hostis grandes (${piorT.toFixed(1)} ms no pior caso)`);
  const { semBlocos, dentroDe } = await imp('lib/texto.mjs');
  const piorB = Math.max(tempo(() => semBlocos('<a>'.repeat(200000))), tempo(() => semBlocos('<a1><a2><a3>'.repeat(50000), { mesmoNome: false })), tempo(() => dentroDe('<user_input>'.repeat(200000), 'user_input')));
  ok(piorB < 500, `limpeza de marcacoes (titulos, Cline) aguenta 600 KB hostis (${piorB.toFixed(1)} ms)`);
  ok(semBlocos('<ide_opened_file>a</ide_opened_file>Oi') === 'Oi' && semBlocos('x<a>1</b>y<c>2</c>z') === 'x<a>1</b>yz' && semBlocos('<a>sem fim') === '<a>sem fim', 'blocos internos saem, marcacoes sem par ficam');
  ok(dentroDe('<user_input mode="act">ola</user_input>', 'user_input') === 'ola' && dentroDe('<user_inputs>x</user_input>', 'user_input') === null, 'mensagem do Cline tirada do <user_input>');
}

fs.rmSync(proj, { recursive: true, force: true });
fs.rmSync(proj + '-segredos', { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nUnidade: tudo certo.');
