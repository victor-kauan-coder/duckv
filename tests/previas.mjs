// Previas e arquivos de uma sessao: so o que apareceu nela, nada fora da pasta do projeto, nada escondido.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pv = await import(pathToFileURL(path.join(ROOT, 'hub/previas.mjs')).href);
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-previa-'));
fs.writeFileSync(path.join(proj, 'index.html'), '<h1>oi</h1>');
fs.writeFileSync(path.join(proj, '.env'), 'SEGREDO=1');
fs.writeFileSync(path.join(proj, 'app.ts'), 'codigo');
const inst = { cwd: proj };

// texto da conversa
pv.lerTexto(inst, 'Pronto! Local: http://localhost:5173/ e tambem http://127.0.0.1:8765', 8765);
ok(inst.previas.portas.includes(5173), 'porta de localhost na conversa vira previa');
ok(!inst.previas.portas.includes(8765), 'a porta do proprio duckV nunca vira previa');
pv.lerTexto(inst, 'http://localhost:22 e http://localhost:80', 8765);
ok(!inst.previas.portas.includes(22) && !inst.previas.portas.includes(80), 'portas de sistema ficam de fora');
pv.lerTexto(inst, 'Publiquei: https://claude.ai/code/artifact/abc123-def', 8765);
ok(inst.previas.artefatos[0] === 'https://claude.ai/code/artifact/abc123-def', 'link de artefato do claude.ai entra na lista');

// arquivos criados
ok(pv.lerArquivo(inst, path.join(proj, 'index.html')) && inst.previas.arquivos[0] === 'index.html', 'HTML criado no projeto entra na lista');
ok(!pv.lerArquivo(inst, path.join(proj, 'app.ts')), 'codigo-fonte nao entra na lista');
ok(!pv.lerArquivo(inst, path.join(os.tmpdir(), 'fora.html')), 'arquivo fora do projeto nao entra');
ok(pv.dentroDoProjeto(inst, '../fora.html') === null, 'caminho com .. e recusado');
ok(pv.dentroDoProjeto(inst, '.env') === null && pv.dentroDoProjeto(inst, 'node_modules/x/a.js') === null, '.env e node_modules sao recusados');

// servir da pasta
const res = () => {
  const r = { code: 0, body: '', writeHead(c) { r.code = c; return r; }, end(b) { r.body += b || ''; r.feito(); }, write(b) { r.body += b; return true; }, on() { return r; }, once() { return r; }, emit() { return true; }, removeListener() { return r; } };
  r.pronto = new Promise((f) => (r.feito = f));
  return r;
};
let r = res();
pv.servirDaPasta(r, inst, '.env', {});
ok(r.code === 404, '.env nao e servido');
r = res();
pv.servirDaPasta(r, inst, '..%2F..%2Fwindows%2Fwin.ini', {});
ok(r.code === 404, 'caminho para fora do projeto nao e servido');

// repasse para o servidor de desenvolvimento
const dev = http.createServer((q, s) => s.end(`pagina ${q.url} cookie=${q.headers.cookie || 'nenhum'}`)).listen(0);
await new Promise((f) => dev.once('listening', f));
const porta = dev.address().port;
const hub = http.createServer((q, s) => {
  const [, p, ...resto] = q.url.split('/');
  pv.repassar(q, s, inst, Number(p), '/' + resto.join('/'), {});
}).listen(0);
await new Promise((f) => hub.once('listening', f));
const base = `http://127.0.0.1:${hub.address().port}`;
let resp = await fetch(`${base}/${porta}/src/main.js?v=1`, { headers: { cookie: 'painel=chave-do-celular' } });
ok(resp.status === 404, 'porta que nao apareceu na sessao e recusada');
pv.lerTexto(inst, `rodando em http://localhost:${porta}`, 8765);
resp = await fetch(`${base}/${porta}/src/main.js?v=1`, { headers: { cookie: 'painel=chave-do-celular' } });
const txt = await resp.text();
ok(resp.status === 200 && txt.startsWith('pagina /src/main.js?v=1'), 'a previa repassa caminho e consulta');
ok(txt.endsWith('cookie=nenhum'), 'a chave do celular nao chega ao servidor de desenvolvimento');

dev.close();
hub.close();
fs.rmSync(proj, { recursive: true, force: true });
