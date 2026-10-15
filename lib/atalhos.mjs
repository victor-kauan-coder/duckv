// Atalhos do duckV em cada sistema: um na area de trabalho (ou no menu) e, se a pessoa quiser,
// um que liga o duckV ao entrar no computador. O duckV sempre abre numa janela de terminal,
// porque o pareamento pede os 4 numeros do celular nela.
//   Windows: duckV.lnk na Area de Trabalho e na pasta Inicializar.
//   Linux:   duckv.desktop no menu de aplicativos, na area de trabalho e em ~/.config/autostart.
//   macOS:   duckV.command na Mesa e um LaunchAgent que abre o Terminal ao entrar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const WIN = process.platform === 'win32';
export const MAC = process.platform === 'darwin';
const HOME = os.homedir();

/** O programa que liga o duckV numa janela: iniciar-duckv.cmd no Windows, iniciar-duckv.sh nos outros. */
export const lancador = (root) => path.join(root, WIN ? 'iniciar-duckv.cmd' : 'iniciar-duckv.sh');

const tem = (bin) => spawnSync('sh', ['-c', 'command -v "$1"', 'sh', bin], { encoding: 'utf8' }).status === 0;

// ------------------------------------------------------------------ Windows
const pastaEspecial = (nome) => spawnSync('powershell', ['-NoProfile', '-Command', `[Environment]::GetFolderPath('${nome}')`], { encoding: 'utf8' }).stdout.trim();
function lnk(arquivo, root, alvo = lancador(root)) {
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);$s.TargetPath=$env:ALVO;$s.WorkingDirectory=$env:PASTA;$s.Description='duckV';$s.Save()`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { env: { ...process.env, LNK: arquivo, ALVO: alvo, PASTA: root } });
}

// ------------------------------------------------------------------ Linux
/** Pasta da area de trabalho do usuario (xdg-user-dir respeita o idioma: "Área de trabalho", "Desktop"...). */
function desktopLinux() {
  const r = spawnSync('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' });
  const p = r.status === 0 ? r.stdout.trim() : '';
  return p && p !== HOME ? p : path.join(HOME, 'Desktop');
}
// Valor de Exec num .desktop: cada argumento entre aspas, com " ` $ \ escapados (especificacao freedesktop).
const execArg = (a) => `"${String(a).replace(/["`$\\]/g, (c) => `\\${c}`)}"`;
/** O terminal que existir neste Linux, com o argumento que manda executar um programa. */
export function terminalLinux() {
  for (const [bin, ...pre] of [['x-terminal-emulator', '-e'], ['gnome-terminal', '--'], ['konsole', '-e'], ['xfce4-terminal', '-x'], ['mate-terminal', '-x'], ['tilix', '-e'], ['kitty'], ['alacritty', '-e'], ['wezterm', 'start', '--'], ['foot'], ['xterm', '-e']]) {
    if (tem(bin)) return [bin, ...pre];
  }
  return null;
}
function entradaDesktop(root, autostart) {
  const term = autostart ? terminalLinux() : null;
  // No menu e na area de trabalho, Terminal=true deixa o ambiente grafico escolher o terminal.
  // Na inicializacao isso nem sempre e respeitado, entao o terminal vai explicito no Exec.
  const exec = term ? [...term, lancador(root)].map(execArg).join(' ') : execArg(lancador(root));
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=duckV',
    'Comment=Seus agentes de codigo, no celular',
    `Exec=${exec}`,
    `Path=${root}`,
    `Icon=${path.join(root, 'app', 'icons', 'icone-192.png')}`,
    `Terminal=${term ? 'false' : 'true'}`,
    'Categories=Development;',
    ...(autostart ? ['X-GNOME-Autostart-enabled=true'] : []),
    '',
  ].join('\n');
}
const menuLinux = () => path.join(HOME, '.local', 'share', 'applications', 'duckv.desktop');
const autostartLinux = () => path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'autostart', 'duckv.desktop');
function gravar(arquivo, texto, modo = 0o644) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, texto, { mode: modo });
  fs.chmodSync(arquivo, modo);
}

// ------------------------------------------------------------------ macOS
const commandMac = () => path.join(HOME, 'Desktop', 'duckV.command');
const agenteMac = () => path.join(HOME, 'Library', 'LaunchAgents', 'io.github.duckv.plist');
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sh = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

// ------------------------------------------------------------------ API

/** Cria o atalho principal. Devolve uma frase para mostrar a pessoa, ou null se nao deu. */
export function criarAtalho(root) {
  if (WIN) {
    lnk(path.join(pastaEspecial('Desktop'), 'duckV.lnk'), root);
    return 'Criei o atalho "duckV" na area de trabalho.';
  }
  if (MAC) {
    gravar(commandMac(), `#!/bin/sh\ncd ${sh(root)} && exec ./iniciar-duckv.sh\n`, 0o755);
    return 'Criei o atalho "duckV.command" na Mesa: dois cliques abrem o duckV no Terminal.';
  }
  gravar(menuLinux(), entradaDesktop(root, false));
  const desk = desktopLinux();
  if (fs.existsSync(desk)) {
    const f = path.join(desk, 'duckv.desktop');
    gravar(f, entradaDesktop(root, false), 0o755);
    // GNOME so abre atalhos da area de trabalho marcados como confiaveis.
    spawnSync('gio', ['set', f, 'metadata::trusted', 'true'], { stdio: 'ignore' });
    return 'Criei o atalho "duckV" no menu de aplicativos e na area de trabalho.';
  }
  return 'Criei o atalho "duckV" no menu de aplicativos.';
}

/** Liga o duckV ao entrar no computador. */
export function ligarComSistema(root) {
  if (WIN) return lnk(path.join(pastaEspecial('Startup'), 'duckV.lnk'), root);
  if (MAC) {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.github.duckv</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/open</string><string>-a</string><string>Terminal</string><string>${xml(lancador(root))}</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
    return gravar(agenteMac(), plist);
  }
  gravar(autostartLinux(), entradaDesktop(root, true));
}

/** O duckV ja liga sozinho com o sistema? */
export function ligaComSistema() {
  if (WIN) return ['duckV.lnk', 'claudeV.lnk'].some((n) => fs.existsSync(path.join(pastaEspecial('Startup'), n)));
  return fs.existsSync(MAC ? agenteMac() : autostartLinux());
}

/** Apaga todos os atalhos que a instalacao criou (inclusive os do nome antigo, claudeV). */
export function removerAtalhos() {
  if (WIN) {
    for (const nome of ['duckV.lnk', 'claudeV.lnk']) for (const p of ['Desktop', 'Startup']) fs.rmSync(path.join(pastaEspecial(p), nome), { force: true });
    return;
  }
  const arquivos = MAC ? [commandMac(), agenteMac()] : [menuLinux(), autostartLinux(), path.join(desktopLinux(), 'duckv.desktop')];
  for (const f of arquivos) fs.rmSync(f, { force: true });
}

/** Apaga so os atalhos do nome antigo (claudeV) no Windows. */
export function removerAntigos() {
  if (WIN) for (const p of ['Desktop', 'Startup']) fs.rmSync(path.join(pastaEspecial(p), 'claudeV.lnk'), { force: true });
}

// ------------------------------------------------------------------ app com janela propria
/** O programa que abre o app do duckV (janela propria, Electron): abrir-app.cmd ou abrir-app.sh. */
export const lancadorApp = (root) => path.join(root, WIN ? 'abrir-app.cmd' : 'abrir-app.sh');
const menuApp = () => path.join(HOME, '.local', 'share', 'applications', 'duckv-app.desktop');

/** Atalho do app "duckV App" (area de trabalho e menu). O atalho do terminal continua existindo. */
export function criarAtalhoApp(root) {
  if (WIN) {
    lnk(path.join(pastaEspecial('Desktop'), 'duckV App.lnk'), root, lancadorApp(root));
    lnk(path.join(pastaEspecial('Programs'), 'duckV App.lnk'), root, lancadorApp(root));
    return 'Criei o atalho "duckV App" na area de trabalho e no menu Iniciar.';
  }
  if (MAC) return 'No macOS, abra o app com ./abrir-app.sh nesta pasta.';
  const entrada = ['[Desktop Entry]', 'Type=Application', 'Name=duckV', 'Comment=Suas contas e sessoes de agentes de codigo numa janela', `Exec=${execArg(lancadorApp(root))}`, `Path=${root}`, `Icon=${path.join(root, 'app', 'icons', 'icone-512.png')}`, 'Terminal=false', 'Categories=Development;', 'StartupWMClass=duckV', ''].join('\n');
  gravar(menuApp(), entrada);
  return 'Criei o atalho "duckV" no menu de aplicativos (janela propria).';
}
export function removerAtalhoApp() {
  if (WIN) for (const p of ['Desktop', 'Programs']) fs.rmSync(path.join(pastaEspecial(p), 'duckV App.lnk'), { force: true });
  else if (!MAC) fs.rmSync(menuApp(), { force: true });
}
