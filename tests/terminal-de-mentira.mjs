// Programa de teste que imita a aparencia de um terminal interativo. Nao e o Claude Code.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const HOOK = process.env.FAKE_HOOK;
process.stdin.setRawMode?.(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
process.stdout.write('\x1b[?2004h');
let sel = 0, line = '', log = [], modo = 0, confia = false, ocupado = false;
// o rodape como o do Claude Code, que o hub le para saber o modo
const modos = ['? for shortcuts · shift+tab to cycle', '⏵⏵ accept edits on (shift+tab to cycle)', '⏸ plan mode on (shift+tab to cycle)'];
const args = process.argv.slice(2).join(' ');
// O marcador da caixa de mensagem de cada agente (FAKE_AGENTE vem da demonstracao): e por ele que o
// duckV sabe que a caixa esta na tela e pode digitar a mensagem.
const MARCA = { codex: '›', opencode: '┃' }[process.env.FAKE_AGENTE] || '>';
let modelo = (/--model (\S+)/.exec(args) || [])[1] || 'padrao';
function draw() {
  const w = process.stdout.columns || 60;
  if (!confia) {
    // imita a pergunta de confianca na pasta que o Claude Code faz ao abrir
    const linha = (t) => '│ ' + t.padEnd(Math.max(0, w - 4)) + ' │';
    process.stdout.write(['\x1b[2J\x1b[H╭' + '─'.repeat(w - 2) + '╮', linha('Do you trust the files in this folder?'), linha(''), linha('❯ 1. Yes, proceed'), linha('  2. No, exit'), '╰' + '─'.repeat(w - 2) + '╯', '  Enter to confirm'].join('\r\n'));
    return;
  }
  const out = ['\x1b[2J\x1b[H'];
  out.push(`FAKE CLAUDE ${w}x${process.stdout.rows} args=[${args}]`);
  out.push('╭' + '─'.repeat(w - 2) + '╮');
  out.push('│ Terminal de demonstracao' + ' '.repeat(Math.max(0, w - 27)) + '│');
  out.push('│ modelo: ' + modelo.padEnd(Math.max(0, w - 11)) + '│');
  out.push('╰' + '─'.repeat(w - 2) + '╯');
  ['Opcao A', 'Opcao B', 'Opcao C'].forEach((o, i) => out.push(`${i === sel ? '❯' : ' '} ${o}`));
  for (const l of log.slice(-6)) out.push(l);
  if (ocupado) out.push('  trabalhando... (esc to interrupt)');
  out.push('');
  // A caixa vazia mostra o convite, como nos agentes de verdade: uma caixa so com o marcador nao
  // seria reconhecida como caixa de mensagem.
  out.push(`${MARCA} ${line || (TRABALHA ? 'escreva uma mensagem' : '')}`);
  const prompt = out.length;
  out.push('');
  out.push(`  ${modos[modo]}`);
  process.stdout.write(out.join('\r\n') + `\x1b[${prompt};${3 + line.length}H`);
}
// ------------------------------------------------------------ fingir que trabalha (so na demonstracao)
// Com FAKE_TRABALHA=1 (tools/simular.mjs), a sessao aberta pelo app nao fica parada: a primeira
// mensagem vira conversa num arquivo de historico de mentira e o estado e a atividade vao mudando,
// como numa sessao de verdade. Nos testes esta parte nao roda.
const TRABALHA = process.env.FAKE_TRABALHA === '1';
const INSTANCIA = process.env.PAINEL_INSTANCE || '';
let trabalhando = false;
// Na demonstracao a pergunta da pasta sai da frente: a sessao tem de comecar a trabalhar sozinha.
if (TRABALHA) confia = true;
const SESSAO = `fake-${INSTANCIA || process.pid}`;
const CONVERSA = path.join(process.env.PAINEL_DATA || os.tmpdir(), 'conversas-de-mentira', `${SESSAO}.jsonl`);
const PASSOS = [
  ['Read', 'frete.js'], ['Grep', 'calcularFrete'], ['Edit', 'frete.js'], ['Bash', 'Roda os testes'],
  ['Read', 'pedido.test.js'], ['Write', 'CHANGELOG.md'], ['Bash', 'Confere o formato do codigo'], ['Edit', 'equipe.md'],
];
const FALAS = [
  'Terminei esta parte e anotei o que fiz.',
  'Este trecho esta pronto. Vou conferir o resto antes de seguir.',
  'Fiz o que estava combinado aqui e deixei anotado.',
];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = (a, b) => a + Math.floor(Math.random() * (b - a));
const sorteio = (l) => l[Math.floor(Math.random() * l.length)];
let seq = 0;
let ctx = 12000;
function linha(o) {
  try {
    fs.mkdirSync(path.dirname(CONVERSA), { recursive: true });
    fs.appendFileSync(CONVERSA, `${JSON.stringify({ uuid: `${SESSAO}-${++seq}`, timestamp: new Date().toISOString(), ...o })}\n`);
  } catch { /* demonstracao: se nao der para escrever, segue sem conversa */ }
}
const fala = (texto, ferramentas = []) => {
  ctx += 1800;
  linha({
    type: 'assistant',
    message: {
      id: `msg-${SESSAO}-${seq}`,
      role: 'assistant',
      content: [...(texto ? [{ type: 'text', text: texto }] : []), ...ferramentas.map((f, i) => ({ type: 'tool_use', id: `tu-${SESSAO}-${seq}-${i}`, ...f }))],
      usage: { input_tokens: 40, output_tokens: entre(600, 1800), cache_creation_input_tokens: 2400, cache_read_input_tokens: ctx },
    },
  });
};
function aviso(nome, extra = {}) {
  return new Promise((pronto) => {
    if (!HOOK) return pronto();
    const c = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'ignore', 'ignore'] });
    c.on('close', pronto);
    c.on('error', pronto);
    c.stdin.end(JSON.stringify({ hook_event_name: nome, session_id: SESSAO, transcript_path: CONVERSA, cwd: process.cwd(), ...extra }));
  });
}
// Uma rodada de trabalho: a atividade troca a cada poucos segundos, a sessao termina e depois volta.
async function fingirTrabalho(texto) {
  linha({ type: 'user', message: { role: 'user', content: texto } });
  await aviso('UserPromptSubmit');
  fala('Entendi a tarefa. Vou comecar pelos arquivos que ela toca.');
  for (;;) {
    const passos = entre(5, 11);
    ocupado = true;
    draw();
    for (let i = 0; i < passos; i++) {
      const [ferramenta, resumo] = sorteio(PASSOS);
      await aviso('PreToolUse', { tool_name: ferramenta, tool_summary: resumo });
      if (i % 3 === 2) fala('', [{ name: ferramenta, input: { description: resumo, file_path: resumo, pattern: resumo } }]);
      await dormir(entre(2200, 4400));
    }
    const ultima = sorteio(FALAS);
    fala(ultima);
    ocupado = false;
    log.push(`pronto: ${ultima}`);
    draw();
    await aviso('Stop', { last_assistant_message: ultima });
    await dormir(entre(9000, 20000));
  }
}

function submit(text) {
  if (text.startsWith('/model ')) { modelo = text.slice(7); log.push(`Model set to ${modelo}`); }
  else if (text === 'perm') {
    const c = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => (out += d)); c.on('close', () => { log.push(`decision: ${out || '(nenhuma)'}`); draw(); });
    c.stdin.end(JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 'fake', tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'rm -rf build', description: 'Apaga a pasta build' } }));
    log.push('asking permission...');
  } else {
    log.push(`got: ${JSON.stringify(text)}`);
    if (TRABALHA && !trabalhando) {
      trabalhando = true;
      fingirTrabalho(text).catch(() => {});
    }
  }
}
process.stdin.on('data', (d) => {
  if (d === '\x03') process.exit(0);
  // Ctrl+U apaga a linha, como no Claude Code
  if (d.includes('\x15')) {
    line = '';
    d = d.slice(d.lastIndexOf('\x15') + 1);
    if (!d) return draw();
  }
  if (!confia) {
    if (d === '1' || d === '\r') {
      confia = true;
      // Com FAKE_SESSIONSTART=1 avisa o comeco da sessao, com o id da conversa, como o Claude Code faz
      // (tests/retomar.mjs). O --resume, quando vem, vira o id: a conversa continua a mesma.
      if (process.env.FAKE_SESSIONSTART === '1') aviso('SessionStart', { session_id: (/--resume (\S+)/.exec(args) || [])[1] || SESSAO });
    } else if (d === '2' || d === '\x1b') process.exit(0);
    return draw();
  }
  if (d === '\x1b[A') sel = (sel + 2) % 3;
  else if (d === '\x1b[B') sel = (sel + 1) % 3;
  else if (d === '\x1b[Z' || d === '\x1bm') { modo = (modo + 1) % 3; log.push('shift-tab'); }
  else if (d === '\x1b') log.push('esc');
  else if (d.startsWith('\x1b[200~')) line += d.replace('\x1b[200~', '').replace('\x1b[201~', '');
  else if (d.startsWith('\x1b')) { /* resposta do terminal: ignora */ }
  else if (d === '\r') { submit(line); line = ''; }
  else if (d === '\x7f') line = line.slice(0, -1);
  else line += d;
  draw();
});
process.stdout.on('resize', draw);
draw();
