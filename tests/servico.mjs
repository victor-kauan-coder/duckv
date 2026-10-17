// duckV como servico (lib/servico.mjs): o conteudo de cada sistema com caminhos dificeis (aspas, %, &,
// espaco, acento), sem instalar nada de verdade; e o app pergunta antes de sair com sessoes abertas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unidadeLinux, plistMac, lancadorWindows, estadoServico } from '../lib/servico.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};

const root = '/home/ana/projetos/duck "V" 100% & <teste> çã';
const node = '/opt/node 22/bin/node';

// ---------------------------------------------------------------- Linux (systemd do usuario)
const u = unidadeLinux({ node, root });
const exec = /^ExecStart=(.*)$/m.exec(u)?.[1] || '';
ok(exec.startsWith('"/opt/node 22/bin/node" '), 'systemd: o Node vai entre aspas (caminho com espaço)');
ok(exec.includes('duck \\"V\\" 100%% & <teste> çã/hub/server.mjs'), 'systemd: aspas escapadas e % dobrado no caminho do servidor');
ok(exec.endsWith(' "--sem-qr"'), 'systemd: liga sem o QR no terminal (não há terminal)');
ok(/^Restart=on-failure$/m.test(u) && /^RestartSec=5$/m.test(u), 'systemd: volta sozinho se cair');
ok(/^WantedBy=default\.target$/m.test(u), 'systemd: liga com a sessão do usuário');
ok(/^StandardOutput=append:.*servico\.log$/m.test(u), 'systemd: registro em data/servico.log');

// ---------------------------------------------------------------- macOS (LaunchAgent)
const p = plistMac({ node, root });
const valores = [...p.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
ok(valores.includes('/opt/node 22/bin/node') && valores.includes('--sem-qr'), 'macOS: o Node e o --sem-qr são argumentos separados');
ok(valores.some((v) => v.includes('duck &quot;V&quot; 100% &amp; &lt;teste&gt; çã')) && !valores.some((v) => /&(?!amp;|lt;|gt;|quot;)/.test(v)), 'macOS: o caminho vai escapado para XML (nada de & ou < cru)');
ok(/<key>KeepAlive<\/key><dict><key>SuccessfulExit<\/key><false\/><\/dict>/.test(p) && /<key>RunAtLoad<\/key><true\/>/.test(p), 'macOS: liga ao entrar e volta se cair (não religa depois de sair normal)');

// ---------------------------------------------------------------- Windows (Agendador + wscript)
const w = lancadorWindows({ node: 'C:\\Program Files\\nodejs\\node.exe', root: 'C:\\Users\\Ana "V"\\duckv' });
ok(/Run "(.*)", 0, False/.test(w), 'Windows: roda sem janela (estilo 0) e não espera');
const cmdVbs = /Run "(.*)", 0, False/.exec(w)?.[1] || '';
ok(cmdVbs === '""C:\\Program Files\\nodejs\\node.exe"" ""C:\\Users\\Ana ""V""\\duckv\\tools\\vigia-servico.mjs""', 'Windows: aspas dobradas como o VBScript manda');
ok(w.includes('\r\n'), 'Windows: o .vbs usa quebra de linha do Windows');
ok(fs.existsSync(path.join(ROOT, 'tools', 'vigia-servico.mjs')), 'Windows: o vigia que liga e religa o duckV existe');
const vigia = fs.readFileSync(path.join(ROOT, 'tools', 'vigia-servico.mjs'), 'utf8');
ok(/codigo === 0\) return/.test(vigia) && /Math\.min\(espera \* 2, 60_000\)/.test(vigia), 'Windows: o vigia não religa depois de sair normal e espera cada vez mais entre quedas');
ok(/\^PAINEL_\(\?!DATA\$\|CONTAS\$\)/.test(vigia) && /cwd: ROOT, env,/.test(vigia), 'o vigia limpa as variáveis de outro duckV (PAINEL_PORT) antes de ligar o servidor');

// ---------------------------------------------------------------- estado (sem instalar)
const e = estadoServico();
ok(typeof e.instalado === 'boolean' && typeof e.rodando === 'boolean', `estado do serviço neste sistema: ${e.instalado ? 'instalado' : 'não instalado'}`);

// ---------------------------------------------------------------- sair do app com sessões abertas
const main = fs.readFileSync(path.join(ROOT, 'desktop', 'main.cjs'), 'utf8');
ok(/label: 'Sair do duckV', click: pedirParaSair/.test(main), 'sair pela bandeja pergunta antes, se houver sessões abertas');
ok(/'Esconder na bandeja', 'Sair mesmo assim', 'Cancelar'/.test(main) && /defaultId: 0/.test(main), 'a escolha padrão é esconder na bandeja (nada encerra sem querer)');
ok(/ev\.sender !== janela\.webContents/.test(main.slice(main.indexOf("ipcMain.on('duckv:sessoes'"))), 'só a janela do duckV informa quantas sessões estão abertas');
