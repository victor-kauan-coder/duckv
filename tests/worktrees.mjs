// "Todas as contas" com um worktree por pato (hub/worktrees.mjs), de ponta a ponta pelo servidor: num
// repositorio git temporario, cada conta ganha o seu branch e a sua pasta; o resultado conta commits e
// linhas; juntar recusa com mudancas penduradas e depois faz o merge; limpar tira pastas e branches.
// Pasta sem git continua como antes (todos na mesma pasta). No lugar do agente, o terminal de mentira.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, '..');
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ident = ['-c', 'user.name=Pato de Teste', '-c', 'user.email=pato@teste.invalid', '-c', 'commit.gpgsign=false'];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-worktrees-'));
// repositorio dentro da pasta pessoal (folderAllowed so aceita de la), com um commit
const repo = fs.mkdtempSync(path.join(os.homedir(), 'duckv-worktrees-repo-'));
git(repo, 'init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'README.md'), '# Projeto\n');
git(repo, 'add', '.');
git(repo, ...ident, 'commit', '-q', '-m', 'primeiro');
const semGit = fs.mkdtempSync(path.join(os.homedir(), 'duckv-worktrees-semgit-'));

fs.writeFileSync(
  path.join(TMP, 'contas.json'),
  JSON.stringify([
    { id: 'conta1', nome: 'Trabalho', cor: '#ff7a1a', dir: path.join(TMP, 'c1') },
    { id: 'conta2', nome: 'Pessoal', cor: '#2b8a6e', dir: path.join(TMP, 'c2') },
  ]),
);
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const PORT = '18795';
const env = { ...process.env, PAINEL_CODIGO: 'codigo-de-teste-worktrees-0123456', PAINEL_PORT: PORT, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(AQUI, 'terminal-de-mentira.mjs')]) };
const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 100; i++) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/`);
    break;
  } catch {
    await sleep(150);
  }
}
const par = await fetch(`http://127.0.0.1:${PORT}/parear?k=codigo-de-teste-worktrees-0123456`, { redirect: 'manual' });
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie: par.headers.get('set-cookie').split(';')[0] } });
let estado = null;
let ref = 0;
const respostas = new Map();
ws.on('message', (r) => {
  const m = JSON.parse(r);
  if (m.t === 'state') estado = m;
  else if (m.ref) respostas.get(m.ref)?.(m);
});
await new Promise((r) => ws.on('open', r));
const pedir = (o) => new Promise((res) => (respostas.set((o.ref = ++ref), res), ws.send(JSON.stringify(o))));
const ate = async (cond, ms = 15000) => {
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
await ate(() => estado);

if (!estado.host.available) {
  ok(true, 'terminal embutido indisponível neste sistema: nada para testar');
} else {
  // ---------------------------------------------------------------- abrir isolado
  const r = await pedir({ t: 'equipe', cwd: repo, texto: 'Escreva um arquivo NOTAS com uma linha.' });
  ok(r.t === 'ack' && r.instances?.length === 2 && r.isolamento?.isolado === true, `equipe aberta num repositório git: cada pato isolado (${r.msg || ''})`);
  const eq = r.equipe;
  const branches = git(repo, 'branch', '--list', 'duckv/*').split('\n').map((s) => s.replace(/^[*+ ]+/, '').trim()).sort();
  ok(branches.join(',') === `duckv/${eq}-conta1,duckv/${eq}-conta2`, `um branch por conta (${branches.join(', ')})`);
  const dirPato = (conta) => path.join(repo, '.duckv', 'worktrees', `${eq}-${conta}`);
  ok(fs.existsSync(path.join(dirPato('conta1'), 'README.md')) && fs.existsSync(path.join(dirPato('conta2'), 'README.md')), 'cada pato tem a sua cópia do repositório em .duckv/worktrees');
  ok(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8').includes('.duckv/') && !fs.existsSync(path.join(repo, '.gitignore')), 'as cópias ficam fora do git pelo .git/info/exclude (o .gitignore não é tocado)');
  await ate(() => r.instances.every((id) => estado.instances.some((i) => i.id === id)));
  const insts = r.instances.map((id) => estado.instances.find((i) => i.id === id));
  const norm = (p) => path.resolve(String(p || '')).toLowerCase();
  ok(insts.every((i) => norm(i.cwd) === norm(dirPato(i.account))), 'cada sessão abre na pasta do seu pato');
  ok(insts.every((i) => i.equipe?.isolado && i.equipe.branch === `duckv/${eq}-${i.account}`), 'o estado diz o branch de cada pato');

  // ---------------------------------------------------------------- resultado
  fs.writeFileSync(path.join(dirPato('conta2'), 'NOTAS.md'), 'linha um\nlinha dois\n');
  git(dirPato('conta2'), 'add', '.');
  git(dirPato('conta2'), ...ident, 'commit', '-q', '-m', 'notas do pato 2');
  const res = await pedir({ t: 'equipeResultado', equipe: eq });
  const p2 = res.patos?.find((p) => p.conta === 'conta2');
  const p1 = res.patos?.find((p) => p.conta === 'conta1');
  ok(res.t === 'ack' && p2?.commits === 1 && p2.mais === 2 && p2.menos === 0 && p2.nome === 'Pessoal', 'o resultado conta os commits e as linhas de cada pato');
  ok(p1?.commits === 0 && res.principalLimpa === true, 'o pato que não fez nada aparece com 0 commits; a pasta principal está limpa');

  // ---------------------------------------------------------------- juntar
  fs.writeFileSync(path.join(repo, 'README.md'), '# Projeto (mexido)\n');
  const recusa = await pedir({ t: 'equipeJuntar', equipe: eq, conta: 'conta2' });
  ok(recusa.t === 'err' && /mudanças|commit/i.test(recusa.msg), `com mudanças penduradas na pasta principal, juntar recusa e explica (${recusa.msg})`);
  git(repo, 'checkout', '--', 'README.md');
  const vazio = await pedir({ t: 'equipeJuntar', equipe: eq, conta: 'conta1' });
  ok(vazio.t === 'err', `juntar um pato sem commits recusa (${vazio.msg})`);
  const junta = await pedir({ t: 'equipeJuntar', equipe: eq, conta: 'conta2' });
  ok(junta.t === 'ack' && fs.readFileSync(path.join(repo, 'NOTAS.md'), 'utf8').includes('linha dois'), 'juntar traz o trabalho do pato para a pasta principal');
  ok(git(repo, 'log', '-1', '--format=%p').split(' ').length === 2 && git(repo, 'rev-list', '--count', 'HEAD') === '3', `com um commit de merge de dois pais (--no-ff): ${git(repo, 'log', '-1', '--format=%s')}`);

  // ---------------------------------------------------------------- limpar
  const cedo = await pedir({ t: 'equipeLimpar', equipe: eq });
  ok(cedo.t === 'err' && /Encerre/.test(cedo.msg), 'limpar com as sessões vivas recusa');
  for (const id of r.instances) await pedir({ t: 'stop', instance: id });
  await ate(() => r.instances.every((id) => estado.instances.find((i) => i.id === id)?.status === 'ended'));
  await sleep(500);
  const limpa = await pedir({ t: 'equipeLimpar', equipe: eq });
  ok(limpa.t === 'ack' && !fs.existsSync(dirPato('conta1')) && !fs.existsSync(dirPato('conta2')), `limpar tira as cópias (${limpa.msg || ''})`);
  ok(git(repo, 'branch', '--list', 'duckv/*') === '' && git(repo, 'worktree', 'list').split('\n').length === 1, 'e os branches e os registros de worktree');

  // ---------------------------------------------------------------- sem git e isolar desligado
  const sg = await pedir({ t: 'equipe', cwd: semGit, texto: 'Faça uma lista de tarefas.' });
  ok(sg.t === 'ack' && sg.isolamento?.isolado === false && /git/i.test(sg.isolamento.porque || ''), `pasta sem git: todos na mesma pasta, e a resposta diz por quê (${sg.isolamento?.porque})`);
  await ate(() => sg.instances.every((id) => estado.instances.some((i) => i.id === id)));
  ok(sg.instances.every((id) => norm(estado.instances.find((i) => i.id === id).cwd) === norm(semGit)), 'as sessões abrem na própria pasta');
  const des = await pedir({ t: 'equipe', cwd: repo, texto: 'Sem cópias desta vez.', isolar: false });
  ok(des.t === 'ack' && des.isolamento?.isolado === false && git(repo, 'branch', '--list', 'duckv/*') === '', 'com isolar desligado, nenhuma cópia é criada');
  for (const id of [...sg.instances, ...des.instances]) await pedir({ t: 'stop', instance: id });
}

ws.close();
hub.kill();
await new Promise((r) => hub.once('exit', r));
await sleep(300);
for (const p of [repo, semGit, TMP]) fs.rmSync(p, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nWorktrees no Todas as contas: tudo certo.');
