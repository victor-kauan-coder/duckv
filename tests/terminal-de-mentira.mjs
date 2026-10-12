// Programa de teste que imita a aparencia de um terminal interativo. Nao e o Claude Code.
import { spawn } from 'node:child_process';
const HOOK = process.env.FAKE_HOOK;
process.stdin.setRawMode?.(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
process.stdout.write('\x1b[?2004h');
let sel = 0, line = '', log = [], modo = 0, confia = false;
// o rodape como o do Claude Code, que o hub le para saber o modo
const modos = ['? for shortcuts · shift+tab to cycle', '⏵⏵ accept edits on (shift+tab to cycle)', '⏸ plan mode on (shift+tab to cycle)'];
const args = process.argv.slice(2).join(' ');
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
  out.push('');
  out.push(`> ${line}`);
  const prompt = out.length;
  out.push('');
  out.push(`  ${modos[modo]}`);
  process.stdout.write(out.join('\r\n') + `\x1b[${prompt};${3 + line.length}H`);
}
function submit(text) {
  if (text.startsWith('/model ')) { modelo = text.slice(7); log.push(`Model set to ${modelo}`); }
  else if (text === 'perm') {
    const c = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => (out += d)); c.on('close', () => { log.push(`decision: ${out || '(nenhuma)'}`); draw(); });
    c.stdin.end(JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: 'fake', tool_name: 'Bash', tool_use_id: 'tu1', tool_input: { command: 'rm -rf build', description: 'Apaga a pasta build' } }));
    log.push('asking permission...');
  } else log.push(`got: ${JSON.stringify(text)}`);
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
    if (d === '1' || d === '\r') confia = true;
    else if (d === '2' || d === '\x1b') process.exit(0);
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
