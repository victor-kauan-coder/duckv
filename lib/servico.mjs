// duckV como servico: liga sozinho ao entrar no computador, sem janela, e volta se cair. Serve para
// deixar o duckV sempre ligado num computador que fica de pe (um mini PC, um notebook velho, uma VPS
// com Tailscale), sem depender do app nem de um terminal aberto.
//   Linux:   unidade do systemd do usuario (~/.config/systemd/user/duckv.service).
//   macOS:   LaunchAgent (~/Library/LaunchAgents/io.github.duckv.servico.plist).
//   Windows: valor "duckV" na chave Run do usuario (liga ao entrar, sem pedir administrador), que
//            abre tools/vigia-servico.mjs escondido pelo wscript.
// O servico usa o Node.js e a pasta do duckV de quando foi instalado; logs em data/servico.log.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const HOME = os.homedir();
const NOME = 'duckv';
const ROTULO_MAC = 'io.github.duckv.servico';
const CHAVE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALOR_RUN = 'duckV';
export const UNIDADE_LINUX = path.join(HOME, '.config', 'systemd', 'user', `${NOME}.service`);
export const PLIST_MAC = path.join(HOME, 'Library', 'LaunchAgents', `${ROTULO_MAC}.plist`);

const roda = (bin, args) => spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });

// ------------------------------------------------------------------ conteudo de cada sistema
// Argumento de ExecStart do systemd: entre aspas duplas, com \ e " escapados e % dobrado
// (o systemd troca %x por variaveis).
const argSystemd = (a) => `"${String(a).replace(/[\\"]/g, (c) => `\\${c}`).replace(/%/g, '%%')}"`;
export function unidadeLinux({ node, root }) {
  return [
    '[Unit]',
    'Description=duckV (suas contas e sessoes de agentes de codigo)',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    `ExecStart=${[node, path.posix.join(root, 'hub', 'server.mjs'), '--sem-qr'].map(argSystemd).join(' ')}`,
    // WorkingDirectory nao aceita aspas (o caminho vai inteiro, espacos inclusive); so o % e especial
    `WorkingDirectory=${String(root).replace(/%/g, '%%')}`,
    'Restart=on-failure',
    'RestartSec=5',
    `StandardOutput=append:${path.posix.join(root, 'data', 'servico.log')}`,
    `StandardError=append:${path.posix.join(root, 'data', 'servico.log')}`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function plistMac({ node, root }) {
  const log = path.posix.join(root, 'data', 'servico.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${ROTULO_MAC}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(path.posix.join(root, 'hub', 'server.mjs'))}</string>
    <string>--sem-qr</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
}

// Windows: o Agendador abre um wscript que roda o vigia sem janela. Dentro do VBScript, aspas
// duplas viram "" (a unica regra de escape da linguagem).
const vbs = (s) => String(s).replace(/"/g, '""');
export function lancadorWindows({ node, root }) {
  const cmd = `"${node}" "${path.win32.join(root, 'tools', 'vigia-servico.mjs')}"`;
  return `' duckV como servico: roda o vigia (que liga o duckV e o religa se cair) sem abrir janela.\r\nCreateObject("WScript.Shell").Run "${vbs(cmd)}", 0, False\r\n`;
}
const lancadorVbs = (root) => path.join(root, 'data', 'servico.vbs');
// Os vigias do duckV rodando agora (achados pela linha de comando do node).
function vigiaWindows() {
  const ps = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*vigia-servico.mjs*' } | ForEach-Object { $_.ProcessId }";
  return (roda('powershell', ['-NoProfile', '-Command', ps]).stdout || '').split(/\s+/).filter((x) => /^\d+$/.test(x));
}

// ------------------------------------------------------------------ instalar, remover, estado
export function instalarServico(root, node = process.execPath) {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  if (process.platform === 'linux') {
    fs.mkdirSync(path.dirname(UNIDADE_LINUX), { recursive: true });
    fs.writeFileSync(UNIDADE_LINUX, unidadeLinux({ node, root }));
    const r1 = roda('systemctl', ['--user', 'daemon-reload']);
    const r2 = roda('systemctl', ['--user', 'enable', '--now', `${NOME}.service`]);
    if (r1.status !== 0 || r2.status !== 0) return { erro: `O systemd do usuário não aceitou o serviço: ${(r2.stderr || r1.stderr || '').trim() || 'sem detalhes'}` };
    // Sem "linger", o systemd do usuario para quando a pessoa sai da sessao (numa VPS, ao fechar o SSH).
    const linger = roda('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger']).stdout?.includes('Linger=yes');
    return { ok: true, aviso: linger ? null : `Para o duckV continuar ligado depois de sair da sessão (numa VPS, ao fechar o SSH), rode uma vez: sudo loginctl enable-linger ${os.userInfo().username}` };
  }
  if (process.platform === 'darwin') {
    fs.mkdirSync(path.dirname(PLIST_MAC), { recursive: true });
    roda('launchctl', ['unload', PLIST_MAC]);
    fs.writeFileSync(PLIST_MAC, plistMac({ node, root }));
    const r = roda('launchctl', ['load', '-w', PLIST_MAC]);
    if (r.status !== 0) return { erro: `O launchctl não aceitou o serviço: ${(r.stderr || '').trim() || 'sem detalhes'}` };
    return { ok: true };
  }
  if (process.platform === 'win32') {
    fs.writeFileSync(lancadorVbs(root), lancadorWindows({ node, root }));
    const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
    // Uma tarefa do Agendador "ao entrar" pede administrador; a chave Run do usuario nao.
    const r = roda('reg', ['add', CHAVE_RUN, '/v', VALOR_RUN, '/t', 'REG_SZ', '/d', `"${wscript}" "${lancadorVbs(root)}"`, '/f']);
    if (r.status !== 0) return { erro: `O Windows não aceitou ligar o duckV ao entrar: ${(r.stderr || r.stdout || '').trim() || 'sem detalhes'}` };
    // e liga agora, sem esperar a proxima entrada (se ja nao estiver ligado)
    if (!vigiaWindows().length) spawn(wscript, [lancadorVbs(root)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return { ok: true };
  }
  return { erro: `Sistema sem modo serviço: ${process.platform}.` };
}

export function removerServico(root) {
  if (process.platform === 'linux') {
    roda('systemctl', ['--user', 'disable', '--now', `${NOME}.service`]);
    fs.rmSync(UNIDADE_LINUX, { force: true });
    roda('systemctl', ['--user', 'daemon-reload']);
  } else if (process.platform === 'darwin') {
    roda('launchctl', ['unload', '-w', PLIST_MAC]);
    fs.rmSync(PLIST_MAC, { force: true });
  } else if (process.platform === 'win32') {
    roda('reg', ['delete', CHAVE_RUN, '/v', VALOR_RUN, '/f']);
    if (root) fs.rmSync(lancadorVbs(root), { force: true });
    // O wscript termina na hora e o vigia segue sozinho: encerra o vigia com o duckV que ele ligou.
    for (const pid of vigiaWindows()) roda('taskkill', ['/PID', pid, '/T', '/F']);
  }
  return { ok: true };
}

/** O servico esta instalado? e rodando? (o que cada sistema souber dizer) */
export function estadoServico() {
  if (process.platform === 'linux') {
    const instalado = fs.existsSync(UNIDADE_LINUX);
    const ativo = instalado && roda('systemctl', ['--user', 'is-active', `${NOME}.service`]).stdout?.trim() === 'active';
    return { instalado, rodando: ativo };
  }
  if (process.platform === 'darwin') {
    const instalado = fs.existsSync(PLIST_MAC);
    return { instalado, rodando: instalado && roda('launchctl', ['list', ROTULO_MAC]).status === 0 };
  }
  if (process.platform === 'win32') {
    const instalado = roda('reg', ['query', CHAVE_RUN, '/v', VALOR_RUN]).status === 0;
    return { instalado, rodando: vigiaWindows().length > 0 };
  }
  return { instalado: false, rodando: false };
}
