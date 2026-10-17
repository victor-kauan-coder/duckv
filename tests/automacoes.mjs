// Automacoes agendadas (hub/automacoes.mjs): o cron e os presets, a proxima execucao, a validacao, a
// execucao que abre uma sessao, o historico e a hora perdida com o computador desligado. Com um relogio
// de mentira, entao nada espera de verdade; e uma ida e volta pelo servidor, com o terminal de mentira.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lerCron, proximaExecucao, quandoEmTexto, criarAutomacoes } from '../hub/automacoes.mjs';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, '..');
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-automacoes-'));
// hora local: sexta-feira, 16 de outubro de 2026, 10:00
const SEXTA_10H = new Date(2026, 9, 16, 10, 0, 0).getTime();
const em = (d, h, m = 0) => new Date(2026, 9, d, h, m, 0).getTime();

// ---------------------------------------------------------------- cron
ok(!lerCron('*/15 8-18 * * 1-5').erro, 'cron com passo, intervalo e dias úteis é aceito');
ok(!lerCron('0 9 1,15 * *').erro, 'cron com lista é aceito');
const e1 = lerCron('0 25 * * *');
ok(e1.erro && /hora/i.test(e1.erro), `hora fora do lugar diz qual campo está errado (${e1.erro})`);
ok(/5 campos|cinco/i.test(lerCron('0 9 * *').erro || ''), 'cron com menos de 5 campos explica o formato');
ok(!!lerCron('a b c d e').erro && !!lerCron('').erro, 'texto que não é cron é recusado');

// ---------------------------------------------------------------- próxima execução
ok(proximaExecucao({ tipo: 'diario', hora: '08:30' }, SEXTA_10H) === em(17, 8, 30), 'todo dia às 8:30, visto às 10h: amanhã às 8:30');
ok(proximaExecucao({ tipo: 'diario', hora: '18:00' }, SEXTA_10H) === em(16, 18), 'todo dia às 18h, visto às 10h: hoje às 18h');
ok(proximaExecucao({ tipo: 'dias-uteis', hora: '09:00' }, SEXTA_10H) === em(19, 9), 'dias úteis às 9h, visto na sexta às 10h: segunda às 9h');
ok(proximaExecucao({ tipo: 'semanal', dia: 3, hora: '20:00' }, SEXTA_10H) === em(21, 20), 'toda quarta às 20h: na próxima quarta');
ok(proximaExecucao({ tipo: 'cron', cron: '*/15 * * * *' }, SEXTA_10H) === em(16, 10, 15), 'cron a cada 15 min: 10:15 (a hora exata atual não conta)');
ok(proximaExecucao({ tipo: 'cron', cron: '0 0 30 2 *' }, SEXTA_10H) === null, '30 de fevereiro nunca acontece: sem próxima execução');
ok(quandoEmTexto({ tipo: 'dias-uteis', hora: '09:00' }) === 'De segunda a sexta às 09:00' && /quarta-feira/.test(quandoEmTexto({ tipo: 'semanal', dia: 3, hora: '20:00' })), 'o quando vira uma frase para a tela');

// ---------------------------------------------------------------- o módulo, com relógio de mentira
let t = SEXTA_10H;
const abertas = [];
const novo = (nome = 'a.json') =>
  criarAutomacoes({
    arquivo: path.join(TMP, nome),
    abrir: (o) => (o.conta === 'quebrada' ? { err: 'A conta não está instalada.' } : (abertas.push(o), { id: `sessao-${abertas.length}` })),
    pastaOk: (p) => (p === 'C:/projetos/loja' || p === 'C:/projetos/sumiu-depois' ? p : null),
    contas: () => ['conta1', 'quebrada'],
    agora: () => t,
    automatico: false,
  });
let A = novo();
const base = { nome: 'Testes da manhã', quando: { tipo: 'diario', hora: '10:05' }, conta: 'conta1', pasta: 'C:/projetos/loja', texto: 'Rode os testes e corrija o que falhar.' };
for (const [campo, extra, porque] of [
  ['texto', { texto: 'oi' }, 'texto curto demais'],
  ['quando', { quando: { tipo: 'cron', cron: '99 * * * *' } }, 'cron inválido'],
  ['pasta', { pasta: 'C:/fora/das/permitidas' }, 'pasta fora das permitidas'],
  ['conta', { conta: 'nao-existe' }, 'conta que não existe'],
]) {
  const r = A.criar({ ...base, ...extra });
  ok(r.err && r.campo === campo, `${porque} é recusado e aponta o campo (${r.campo}: ${r.err})`);
}
const criada = A.criar(base);
ok(!criada.err && criada.automacao.proxima === em(16, 10, 5) && criada.automacao.ativa, 'criar marca a próxima execução (hoje às 10:05)');
const id = criada.automacao.id;
ok(A.listar().length === 1 && A.listar()[0].quandoTexto === 'Todo dia às 10:05', 'a lista mostra a automação com o quando em texto');

t = em(16, 10, 5, 30) + 30_000;
A.conferir();
ok(abertas.length === 1 && abertas[0].texto === base.texto && abertas[0].cwd === 'C:/projetos/loja' && abertas[0].conta === 'conta1', 'na hora, abre a sessão com o texto, a pasta e a conta');
const h1 = A.historico(id).historico;
ok(h1.length === 1 && h1[0].instancia === 'sessao-1', 'a execução entra no histórico com a sessão aberta');
ok(A.listar()[0].proxima === em(17, 10, 5), 'e a próxima passa para amanhã');

// computador desligado na hora: não roda atrasado, entra como perdida
t = em(17, 14, 0);
A.conferir();
ok(abertas.length === 1, 'quatro horas depois da hora marcada (computador desligado), nada roda atrasado');
const h2 = A.historico(id).historico[0]; // a mais nova vem primeiro
ok(h2.perdida === true && h2.marcada === em(17, 10, 5), 'a hora que passou fica no histórico como perdida');
ok(A.listar()[0].proxima === em(18, 10, 5), 'e a próxima é a de amanhã');

// pausar, rodar agora, editar, conta quebrada, apagar
ok(A.pausar(id, false).automacao.ativa === false && A.listar()[0].proxima === null, 'pausar tira a próxima execução');
t = em(18, 10, 6);
A.conferir();
ok(abertas.length === 1, 'pausada, não roda na hora');
const agoraJa = A.rodarAgora(id);
ok(!agoraJa.err && abertas.length === 2 && A.historico(id).historico[0].manual === true, 'rodar agora abre mesmo pausada e marca como manual');
ok(A.editar(id, { ...base, conta: 'quebrada' }).automacao.conta === 'quebrada', 'editar troca a conta');
A.rodarAgora(id);
ok(/não está instalada/.test(A.historico(id).historico[0].erro || ''), 'conta que não abre fica no histórico com o motivo');
ok(fs.existsSync(path.join(TMP, 'a.json')) && novo().listar().length === 1, 'guardado em disco: volta igual ao ligar de novo');
ok(!A.apagar(id).err && A.listar().length === 0, 'apagar tira a automação');

// ao ligar, a hora que passou com o duckV desligado vira perdida
t = em(19, 8, 0);
const B = novo('b.json');
const b = B.criar({ ...base, quando: { tipo: 'diario', hora: '08:30' } }).automacao;
t = em(20, 9, 0);
const B2 = novo('b.json');
ok(B2.historico(b.id).historico[0]?.perdida === true && abertas.length === 2, 'ligar depois da hora (o duckV estava desligado) anota perdida e não roda');

// ---------------------------------------------------------------- as telas
// O que as telas precisam ter: a pagina web e o app do computador falam as mesmas mensagens e escrevem
// os mesmos estados (proxima, perdida, pausada), sem travessao no texto.
const paginaJs = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');
const janelaJs = fs.readFileSync(path.join(ROOT, 'app/desktop.js'), 'utf8');
for (const [onde, js] of [['a pagina web', paginaJs], ['a janela do computador', janelaJs]]) {
  ok(["'automacoes'", "t: 'automacaoCriar'", "t: 'automacaoEditar'", "t: 'automacaoApagar'", "t: 'automacaoPausar'", "t: 'automacaoRodar'", "t: 'automacaoHistorico'"].every((m) => js.includes(m)), `${onde} fala todas as mensagens das automacoes`);
  ok(/o computador estava desligado/.test(js) && /Ainda não rodou/.test(js), `${onde} escreve a execucao perdida e a que nunca rodou`);
  ok(/Todo dia/.test(js) && /Dias úteis/.test(js) && /Uma vez por semana/.test(js) && /Cron/.test(js), `${onde} oferece os tres presets e o cron`);
  ok(/Automática/.test(js), `${onde} deixa a conta automatica`);
}
ok(!/[\u2013\u2014]/.test((paginaJs.match(/'[^']*'/g) || []).join('')), 'nenhum travessao no texto da pagina web');
ok(/location.hash = '#\/automacoes'/.test(paginaJs), 'as Opcoes da pagina web levam as automacoes');

// ---------------------------------------------------------------- ida e volta pelo servidor
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const PORT = '18794';
const proj = fs.mkdtempSync(path.join(os.homedir(), 'duckv-automacoes-proj-'));
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(TMP, 'c1') }]));
const env = { ...process.env, PAINEL_CODIGO: 'codigo-de-teste-automacoes-0123456', PAINEL_PORT: PORT, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(AQUI, 'terminal-de-mentira.mjs')]) };
const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 100; i++) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/`);
    break;
  } catch {
    await sleep(150);
  }
}
const par = await fetch(`http://127.0.0.1:${PORT}/parear?k=codigo-de-teste-automacoes-0123456`, { redirect: 'manual' });
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
const r1 = await pedir({ t: 'automacaoCriar', automacao: { nome: 'Revisão diária', quando: { tipo: 'dias-uteis', hora: '07:45' }, conta: null, pasta: proj, texto: 'Revise o que mudou ontem.' } });
ok(r1.t === 'ack' && r1.automacao.proxima > Date.now(), 'pelo servidor: criar responde com a próxima execução');
await sleep(300);
ok(estado.automacoes?.some((a) => a.id === r1.automacao.id), 'a automação aparece no estado para todos os aparelhos');
const r2 = await pedir({ t: 'automacaoRodar', id: r1.automacao.id });
ok(r2.t === 'ack' && r2.instance, `rodar agora abre a sessão (conta automática) (${r2.instance || r2.msg})`);
await sleep(400);
ok(estado.instances.some((i) => i.id === r2.instance && i.hosted && i.cwd === proj), 'a sessão aberta pela automação está no estado, na pasta certa');
const r3 = await pedir({ t: 'automacaoHistorico', id: r1.automacao.id });
ok(r3.t === 'ack' && r3.historico[0].instancia === r2.instance, 'o histórico mostra a sessão aberta');
ok((await pedir({ t: 'automacaoCriar', automacao: { nome: 'x', quando: { tipo: 'diario', hora: '25:00' }, pasta: proj, texto: 'abc def' } })).campo === 'quando', 'hora impossível é recusada pelo servidor');
await pedir({ t: 'stop', instance: r2.instance });
ws.close();
hub.kill();
await new Promise((r) => hub.once('exit', r));
fs.rmSync(proj, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nAutomações agendadas: tudo certo.');
