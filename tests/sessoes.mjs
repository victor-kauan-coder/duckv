// Teste das sessoes abertas pelo celular. No lugar do Claude Code roda um
// programa de terminal de mentira, entao nada gasta o seu limite.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-teste-'));
const require = createRequire(path.join(ROOT, 'x.js'));
const WebSocket = (await import(pathToFileURL(require.resolve('ws')).href)).default;
const PORT = '18766';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
// Pasta do projeto temporaria, dentro da pasta pessoal (folderAllowed so aceita de la); apagada no fim.
const proj = fs.mkdtempSync(path.join(os.homedir(), 'duckv-teste-proj-'));
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(TMP, 'c1') }]));
const env = { ...process.env, PAINEL_CODIGO: 'codigo-de-teste-0123456789', PAINEL_PORT: PORT, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), FAKE_HOOK: path.join(ROOT, 'agent/hook.mjs'), PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, path.join(AQUI, 'terminal-de-mentira.mjs')]) };
const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
await sleep(6500);
const cfg = JSON.parse(fs.readFileSync(path.join(TMP, 'config.json'), 'utf8'));
const pair = await fetch(`http://127.0.0.1:${PORT}/parear?k=codigo-de-teste-0123456789`, { redirect: 'manual' });
const cookie = pair.headers.get('set-cookie').split(';')[0];
const phone = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie } });
let state = null, screen = null; const replies = new Map(); let ref = 0;
phone.on('message', (r) => { const m = JSON.parse(r); if (m.t === 'state') state = m; else if (m.t === 'screen') screen = m; else if (m.ref) replies.get(m.ref)?.(m); });
await new Promise((r) => phone.on('open', r));
const ask = (o) => new Promise((res) => { o.ref = ++ref; replies.set(o.ref, res); phone.send(JSON.stringify(o)); });
const text = () => (screen?.lines || []).join('\n');
// Espera a condicao acontecer (ate 15 s), em vez de um tempo fixo: o terminal do Windows nos
// servidores do GitHub e bem mais lento que num computador comum.
const ate = async (cond, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (cond()) return true; } catch {} await sleep(100); } return false; };
const plano = () => text().replace(/\n/g, '');
await sleep(300);
// Linux com musl (Alpine): o terminal embutido nao existe pronto; o app precisa ser avisado, e o duckV nao pode cair.
if (process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime) {
  ok(state.host.available === false && /musl/.test(state.host.error || ''), 'Linux com musl: o app e avisado de que as sessoes pelo celular nao estao disponiveis');
  const r = await ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet' });
  ok(r.t === 'err' && /musl/.test(r.msg || ''), 'abrir sessao no musl responde com o motivo, sem derrubar o duckV');
  ok((await fetch(`http://127.0.0.1:${PORT}/api/state`, { headers: { cookie } })).status === 200, 'o duckV continua no ar');
  phone.close(); hub.kill();
  console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nSessoes abertas pelo celular (musl): tudo certo.');
  process.exit(process.exitCode || 0);
}
ok(state.host.available === true && state.host.models.includes('sonnet'), 'terminal virtual disponivel e lista de modelos enviada');
ok((await ask({ t: 'start', account: 'conta1', cwd: '/etc', model: 'sonnet' })).t === 'err', 'pasta fora das permitidas e recusada');
ok((await ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet; rm -rf /' })).t === 'err', 'modelo com caracteres estranhos e recusado');
ok((await ask({ t: 'start', account: 'conta1', cwd: proj, mode: 'bypassPermissions' })).t === 'err', 'modo sem permissoes nao pode ser aberto pelo celular');
// No Windows o agente abre pelo cmd.exe, que interpreta & | % ^ ! < > nos argumentos (CVE-2024-27980,
// "BatBadBut"). Nada que vem do celular pode chegar cru na linha de comando.
for (const [campo, valor] of [['effort', 'high & calc'], ['effort', 'high|whoami'], ['mode', 'acceptEdits & calc'], ['model', 'sonnet%PATH%'], ['model', 'claude-x"&calc&"'], ['resume', '..\\x & calc'], ['resume', 'abc123%COMSPEC%']])
  ok((await ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet', [campo]: valor })).t === 'err', `${campo} com metacaracteres do cmd.exe e recusado: ${valor}`);
const ls = await ask({ t: 'ls', path: os.homedir() });
ok(ls.t === 'ack' && ls.dirs.includes(path.basename(proj)), 'lista de pastas para escolher');
const st = await ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet', effort: 'high', mode: 'acceptEdits', name: 'Teste & "x"', cols: 52, rows: 24 });
ok(st.t === 'ack' && st.instance, `sessao aberta pelo celular (${st.instance || st.msg})`);
const id = st.instance;
// ao abrir, o programa pergunta se confia na pasta: a pergunta vira botoes
await ate(() => state.instances.find((i) => i.id === id)?.pergunta);
let inst = state.instances.find((i) => i.id === id);
ok(inst.pergunta?.opcoes.length === 2 && /trust/.test(inst.pergunta.titulo) && inst.pergunta.opcoes[0].rotulo === 'Yes, proceed', 'pergunta do terminal chega como botoes');
await ask({ t: 'key', instance: id, key: '1' }); await ate(() => state.instances.find((i) => i.id === id).pergunta === null && /shift\+tab/.test(state.instances.find((i) => i.id === id).rodape));
inst = state.instances.find((i) => i.id === id);
ok(inst.pergunta === null && /shift\+tab/.test(inst.rodape), 'responder pelo botao fecha a pergunta e o rodape do modo e lido');
phone.send(JSON.stringify({ t: 'term', instance: id, on: true, cols: 52, rows: 24 }));
await ate(() => /FAKE CLAUDE 52x24/.test(text()) && /--name Teste x/.test(plano()));
ok(/FAKE CLAUDE 52x24/.test(text()), 'tela do terminal chega ao celular no tamanho pedido');
ok(/--model sonnet --effort high --permission-mode acceptEdits --name Teste x/.test(text().replace(/\n/g, '')), 'modelo, esforco, modo e nome passados na abertura');
inst = state.instances.find((i) => i.id === id);
ok(inst.hosted && inst.canSend && inst.account === 'conta1', 'sessao marcada como controlavel');
await ask({ t: 'send', instance: id, text: '/model opus' }); await ate(() => /Model set to opus/.test(text()));
ok(/Model set to opus/.test(text()), 'comando /model digitado e executado');
const bang = await ask({ t: 'send', instance: id, text: '!whoami' });
ok(bang.t === 'err', 'comando com ! e recusado pelo celular');
const perms = await ask({ t: 'send', instance: id, text: '/permissions' });
ok(perms.t === 'err', 'comando de barra fora da lista e recusado');
for (const [nome, cab] of [['resumir', 'description: Resume o projeto'], ['faxina', 'description: Limpa tudo\nallowed-tools: Bash(rm:*)']]) {
  fs.mkdirSync(path.join(TMP, 'c1', 'skills', nome), { recursive: true });
  fs.writeFileSync(path.join(TMP, 'c1', 'skills', nome, 'SKILL.md'), `---\nname: ${nome}\n${cab}\n---\nCorpo da skill.\n`);
}
const lista = await ask({ t: 'comandos', instance: id });
const achar = (n) => lista.itens?.find((x) => x.nome === n);
ok(achar('/model')?.desc && achar('/resumir')?.tipo === 'skill' && achar('/resumir').desc === 'Resume o projeto', 'lista do "/" traz comandos do agente e skills com descricao');
ok(!!achar('/faxina')?.bloqueado && !achar('/resumir').bloqueado, 'skill que libera o terminal sozinha aparece marcada');
ok((await ask({ t: 'send', instance: id, text: '/faxina' })).t === 'err', 'skill que libera o terminal e recusada pelo celular');
const pelaNotificacao = await fetch(`http://127.0.0.1:${PORT}/api/send`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ instance: id, text: '/resumir' }) });
await ate(() => /resumir/.test(text()));
ok(pelaNotificacao.status === 200 && /resumir/.test(text()), 'resposta da notificacao chega a sessao por HTTP');
const semSessao = await fetch(`http://127.0.0.1:${PORT}/api/send`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ instance: 'nao-existe', text: 'oi' }) });
ok(semSessao.status === 409 && (await semSessao.json()).erro, 'resposta da notificacao para sessao que sumiu devolve o erro');
await ask({ t: 'key', instance: id, key: 'down' }); await ate(() => /❯ Opcao B/.test(text()));
ok(/❯ Opcao B/.test(text()), 'seta para baixo move a selecao');
await ask({ t: 'key', instance: id, key: 'shift-tab' }); await sleep(300); await ask({ t: 'key', instance: id, key: 'esc' }); await ate(() => /shift-tab/.test(text()) && /esc/.test(text()));
ok(/shift-tab/.test(text()) && /esc/.test(text()), 'Shift+Tab e Esc chegam ao programa');
ok((await ask({ t: 'modo', instance: id, mode: 'plan' })).t === 'ack', 'modo escolhido direto e confirmado pelo rodape');
await ate(() => state.instances.find((i) => i.id === id).permMode === 'plan' && /plan mode on/.test(text()));
ok(state.instances.find((i) => i.id === id).permMode === 'plan' && /plan mode on/.test(text()), 'o modo trocado chega ao celular');
ok((await ask({ t: 'modo', instance: id, mode: 'manual' })).t === 'ack' && /for shortcuts/.test(text()), 'volta para perguntar sempre');
ok((await ask({ t: 'modo', instance: id, mode: 'bypassPermissions' })).t === 'err', 'pular todas as permissoes nao e aceito pelo celular');
await ask({ t: 'send', instance: id, text: 'linha um\nlinha dois' }); await ate(() => /got: "linha um\\nlinha dois"/.test(text()));
ok(/got: "linha um\\nlinha dois"/.test(text()), 'texto com varias linhas e colado inteiro');
phone.send(JSON.stringify({ t: 'term', instance: id, on: true, cols: 70, rows: 20 })); await ate(() => /FAKE CLAUDE 70x20/.test(text()));
ok(/FAKE CLAUDE 70x20/.test(text()), 'terminal redimensiona com a tela do celular');
// permissao: gancho espera a resposta do celular
await ask({ t: 'send', instance: id, text: 'perm' }); await ate(() => state.instances.find((i) => i.id === id).perms.length === 1);
inst = state.instances.find((i) => i.id === id);
ok(inst.status === 'waiting' && inst.perms.length === 1 && inst.perms[0].tool === 'Bash' && /rm -rf build/.test(inst.perms[0].preview), 'pedido de permissao da sessao aparece com o comando');
ok(!/decision:/.test(text()), 'o Claude Code fica esperando a resposta');
const v = await ask({ t: 'verdict', instance: id, request_id: inst.perms[0].id, behavior: 'deny', note: 'use a pasta dist' }); await ate(() => /"behavior":"deny"/.test(plano()) && /use a pasta dist/.test(plano()));
ok(v.t === 'ack' && /"behavior":"deny"/.test(text().replace(/\n/g, '')) && /PermissionRequest/.test(text().replace(/\n/g, '')), 'recusar no celular devolve a decisao ao Claude Code');
ok(/use a pasta dist/.test(text().replace(/\n/g, '')), 'o recado da recusa chega ao Claude Code');
await ask({ t: 'send', instance: id, text: 'perm' }); await ate(() => state.instances.find((i) => i.id === id).perms.length === 1);
inst = state.instances.find((i) => i.id === id);
await ask({ t: 'verdict', instance: id, request_id: inst.perms[0].id, behavior: 'allow' }); await ate(() => /"behavior":"allow"/.test(plano()));
ok(/"behavior":"allow"/.test(text().replace(/\n/g, '')), 'aceitar no celular devolve a decisao ao Claude Code');
ok(state.host.folders[0] === fs.realpathSync(proj), 'pasta usada vira sugestao');
// opcoes guardadas no computador
ok((await ask({ t: 'prefs', op: 'conta', id: 'conta1', nome: 'Trabalho', cor: '#C4420A', padroes: { model: 'opus', effort: 'high', mode: 'plan', cwd: proj } })).t === 'ack', 'opcoes da conta sao aceitas');
await sleep(300);
const c1 = state.accounts.find((a) => a.id === 'conta1');
ok(c1.nome === 'Trabalho' && c1.cor === '#c4420a' && c1.padroes.model === 'opus' && c1.padroes.mode === 'plan', 'nome, cor e padroes da conta aparecem no app');
ok((await ask({ t: 'prefs', op: 'conta', id: 'conta1', padroes: { mode: 'bypassPermissions' } })).t === 'err', 'padrao com modo sem permissoes e recusado');
ok((await ask({ t: 'prefs', op: 'conta', id: 'conta1', cor: 'red' })).t === 'err', 'cor invalida e recusada');
await ask({ t: 'prefs', op: 'avisos', fim: false, limiar: 95 });
await ask({ t: 'prefs', op: 'rapidas', lista: ['Pode continuar.', '', 'x'.repeat(500)] }); await sleep(300);
ok(state.prefs.avisos.fim === false && state.prefs.avisos.limiar === 95 && state.prefs.avisos.perm === true, 'opcoes de aviso guardadas');
ok(state.prefs.rapidas.length === 2 && state.prefs.rapidas[1].length === 200, 'mensagens rapidas guardadas, vazias fora e longas cortadas');
// Primeira mensagem ao abrir: passa pelo filtro antes de abrir e espera a caixa de mensagem aparecer.
const quantas = state.instances.length;
const comBang = await ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet', texto: '!whoami' });
await sleep(400);
ok(comBang.t === 'err' && state.instances.length === quantas, 'texto perigoso na abertura e recusado sem abrir sessao');
const comTexto = await ask({ t: 'start', account: 'conta1', cwd: proj, model: 'sonnet', texto: 'comece pelos testes', cols: 52, rows: 24 });
ok(comTexto.t === 'ack' && comTexto.instance, `sessao aberta ja com a primeira mensagem (${comTexto.msg || ''})`);
const id2 = comTexto.instance;
await ate(() => state.instances.find((i) => i.id === id2)?.pergunta);
ok(!/got: "comece pelos testes"/.test(plano()), 'a primeira mensagem espera na fila enquanto a pergunta da pasta esta aberta');
await ask({ t: 'key', instance: id2, key: '1' });
phone.send(JSON.stringify({ t: 'term', instance: id2, on: true, cols: 52, rows: 24 }));
await ate(() => /got: "comece pelos testes"/.test(plano()));
ok(/got: "comece pelos testes"/.test(plano()), 'a primeira mensagem e digitada quando a caixa de mensagem aparece');
ok(state.instances.find((i) => i.id === id2)?.name === 'comece pelos testes', 'sem nome escolhido, a sessao se chama pela primeira mensagem');
await ask({ t: 'stop', instance: id2 });
const stop = await ask({ t: 'stop', instance: id }); await ate(() => state.instances.find((i) => i.id === id).status === 'ended');
inst = state.instances.find((i) => i.id === id);
ok(stop.t === 'ack' && inst.status === 'ended' && !inst.hosted, 'encerrar pelo celular fecha a sessao');
phone.close(); hub.kill(); fs.rmSync(proj, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
console.log(process.exitCode ? '\nAlgum teste falhou.' : '\nSessoes abertas pelo celular: tudo certo.');
process.exit(process.exitCode || 0);
