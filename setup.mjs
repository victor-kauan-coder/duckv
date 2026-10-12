#!/usr/bin/env node
// Instalacao do duckV: prepara as pastas das contas, liga o Claude Code de
// cada conta ao duckV e cria os atalhos. Pode ser executado de novo sem problema.
//   node setup.mjs            instala ou atualiza
//   node setup.mjs --remover  desfaz o que a instalacao configurou
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import webpush from 'web-push';
import { agenteDe } from './hub/agentes.mjs';
import { ROOT, ACCOUNTS_FILE, ensureConfig, loadAccounts, defaultAccounts, readJson, writeJson } from './lib/config.mjs';

const remover = process.argv.includes('--remover');
const WIN = process.platform === 'win32';
const fwd = (p) => p.replace(/\\/g, '/');
const HOOK = path.join(ROOT, 'agent', 'hook.mjs');
const STATUS = path.join(ROOT, 'agent', 'statusline.mjs');
const CHANNEL = path.join(ROOT, 'agent', 'channel.mjs');
// node pelo caminho absoluto: um node.cmd plantado na pasta do projeto nao roda no lugar dele.
const NODE = fwd(process.execPath);
const hookCmd = `"${NODE}" "${fwd(HOOK)}"`;
const statusCmd = `"${NODE}" "${fwd(STATUS)}"`;
const nosso = (cmd) => typeof cmd === 'string' && /agent\/(hook|statusline)\.mjs/.test(fwd(cmd));

// Eventos do Claude Code que o painel acompanha. Nenhum deles decide nada:
// os programas so avisam o painel e saem.
const EVENTOS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PermissionDenied',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'StopFailure',
];

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`O duckV precisa do Node.js 20 ou mais novo (este e o ${process.versions.node}). Baixe em https://nodejs.org`);
  process.exit(1);
}

function claude(args, dir) {
  const env = { ...process.env };
  if (dir) env.CLAUDE_CONFIG_DIR = dir;
  else delete env.CLAUDE_CONFIG_DIR;
  return spawnSync(`claude ${args}`, { shell: true, env, encoding: 'utf8', timeout: 60000 });
}

function ajustarSettings(conta) {
  const file = path.join(conta.dir, 'settings.json');
  const s = readJson(file, {}) || {};
  let aviso = null;
  if (remover) {
    if (nosso(s.statusLine?.command)) delete s.statusLine;
  } else if (!s.statusLine || nosso(s.statusLine.command)) {
    s.statusLine = { type: 'command', command: statusCmd };
  } else {
    aviso = 'ja tem uma linha de status propria; o duckV nao vai receber o uso desta conta enquanto ela estiver la.';
  }
  const hooks = s.hooks && typeof s.hooks === 'object' ? s.hooks : {};
  for (const ev of EVENTOS) {
    const grupos = (Array.isArray(hooks[ev]) ? hooks[ev] : [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !nosso(h.command)) }))
      .filter((g) => g.hooks.length);
    if (!remover) {
      // Quase todos rodam em segundo plano. SessionEnd roda na hora (a sessao esta
      // fechando) e PermissionRequest tambem, porque nas sessoes abertas pelo
      // celular ele espera a sua resposta; nas demais ele volta em milissegundos.
      const h = { type: 'command', command: hookCmd, timeout: 10 };
      if (ev === 'PermissionRequest') h.timeout = 1800;
      else if (ev !== 'SessionEnd') h.async = true;
      grupos.push({ hooks: [h] });
    }
    if (grupos.length) hooks[ev] = grupos;
    else delete hooks[ev];
  }
  if (Object.keys(hooks).length) s.hooks = hooks;
  else delete s.hooks;
  if (remover && !fs.existsSync(file)) return aviso;
  writeJson(file, s);
  return aviso;
}

function atalho(conta) {
  const nome = conta.nome.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || conta.id;
  if (WIN) {
    const linhas = [
      '@echo off',
      'chcp 65001 >nul',
      'setlocal',
      'set "NoDefaultCurrentDirectoryInExePath=1"',
      `set "PAINEL_ACCOUNT=${conta.id}"`,
      `set "PAINEL_ACCOUNT_NAME=${nome}"`,
      `set "PAINEL_INSTANCE=${conta.id}-%RANDOM%%RANDOM%%RANDOM%"`,
      conta.padrao ? 'rem Esta conta usa a pasta padrao do Claude Code.' : `set "CLAUDE_CONFIG_DIR=${conta.dir}"`,
      `title ${nome} - Claude Code`,
      'if not "%~1"=="" goto pastaInformada',
      'set "PASTA="',
      'set /p "PASTA=Pasta do projeto (Enter usa a pasta atual): "',
      'if not defined PASTA goto abrir',
      'set "PASTA=%PASTA:"=%"',
      'cd /d "%PASTA%" || goto semPasta',
      'goto abrir',
      ':pastaInformada',
      'cd /d "%~1" || goto semPasta',
      ':abrir',
      `echo ${nome}: abrindo o Claude Code em %CD%`,
      'echo Na pergunta sobre canais de desenvolvimento, escolha "I am using this for local development".',
      'claude --dangerously-load-development-channels server:painel %2 %3 %4 %5 %6 %7 %8 %9',
      'if errorlevel 1 pause',
      'exit /b',
      ':semPasta',
      'echo Pasta nao encontrada.',
      'pause',
      'exit /b 1',
      '',
    ];
    const file = path.join(ROOT, `${conta.id}.cmd`);
    fs.writeFileSync(file, linhas.join('\r\n'), 'utf8');
    return file;
  }
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  const linhas = [
    '#!/bin/sh',
    `export PAINEL_ACCOUNT=${q(conta.id)}`,
    `export PAINEL_ACCOUNT_NAME=${q(nome)}`,
    `export PAINEL_INSTANCE="${conta.id}-$$-$(date +%s)"`,
    conta.padrao ? '# Esta conta usa a pasta padrao do Claude Code.' : `export CLAUDE_CONFIG_DIR=${q(conta.dir)}`,
    'if [ -n "$1" ]; then cd "$1" || exit 1; shift; fi',
    'exec claude --dangerously-load-development-channels server:painel "$@"',
    '',
  ];
  const file = path.join(ROOT, `${conta.id}.sh`);
  fs.writeFileSync(file, linhas.join('\n'), { mode: 0o755 });
  return file;
}

// Atalhos do Windows (.lnk) para o duckV: na area de trabalho e, se voce quiser, ao entrar no Windows.
const pastaEspecial = (nome) => spawnSync('powershell', ['-NoProfile', '-Command', `[Environment]::GetFolderPath('${nome}')`], { encoding: 'utf8' }).stdout.trim();
const atalhoDesktop = () => path.join(pastaEspecial('Desktop'), 'duckV.lnk');
const atalhoInicio = () => path.join(pastaEspecial('Startup'), 'duckV.lnk');
function criarAtalho(lnk) {
  const alvo = path.join(ROOT, 'iniciar-duckv.cmd');
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);$s.TargetPath=$env:ALVO;$s.WorkingDirectory=$env:PASTA;$s.Description='duckV';$s.Save()`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { env: { ...process.env, LNK: lnk, ALVO: alvo, PASTA: ROOT } });
}

// Atalho de uma conta de outro agente (Codex, Gemini CLI, OpenCode, Cline): abre o agente na pasta
// pedida, com a pasta da conta e os argumentos seguros de sempre (aprovacao manual, sem modo sem sandbox).
function atalhoAgente(conta) {
  const ag = agenteDe(conta.agente);
  const nome = conta.nome.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || conta.id;
  const env = ag.env(conta.dir, conta.padrao);
  const args = ag.args({}).map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
  if (WIN) {
    const linhas = [
      '@echo off',
      'chcp 65001 >nul',
      'setlocal',
      'set "NoDefaultCurrentDirectoryInExePath=1"',
      ...Object.entries(env).map(([k, v]) => `set "${k}=${v}"`),
      `title ${nome} - ${ag.nome}`,
      'if not "%~1"=="" (cd /d "%~1" || goto semPasta) else (',
      '  set "PASTA="',
      '  set /p "PASTA=Pasta do projeto (Enter usa a pasta atual): "',
      ')',
      'if defined PASTA cd /d "%PASTA:"=%" || goto semPasta',
      `echo ${nome}: abrindo o ${ag.nome} em %CD%`,
      `${ag.bin} ${args}`,
      'if errorlevel 1 pause',
      'exit /b',
      ':semPasta',
      'echo Pasta nao encontrada.',
      'pause',
      'exit /b 1',
      '',
    ];
    const file = path.join(ROOT, `${conta.id}.cmd`);
    fs.writeFileSync(file, linhas.join('\r\n'), 'utf8');
    return file;
  }
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  const linhas = ['#!/bin/sh', ...Object.entries(env).map(([k, v]) => `export ${k}=${q(v)}`), 'if [ -n "$1" ]; then cd "$1" || exit 1; shift; fi', `exec ${ag.bin} ${args} "$@"`, ''];
  const file = path.join(ROOT, `${conta.id}.sh`);
  fs.writeFileSync(file, linhas.join('\n'), { mode: 0o755 });
  return file;
}

// ------------------------------------------------------------------ execucao

if (!remover) {
  ensureConfig(() => webpush.generateVAPIDKeys());
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    writeJson(ACCOUNTS_FILE, defaultAccounts().map(({ id, nome, cor, dir }) => ({ id, nome, cor, dir })));
    console.log('Criei o arquivo contas.json com tres contas. Voce pode mudar nomes e cores nele.');
  }
}

// Perguntas S/N do assistente. Sem teclado (rodando por outro programa), a resposta e sempre nao.
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
async function pergunta(texto, padrao = true) {
  if (!rl) return false;
  const r = (await rl.question(`${texto} ${padrao ? '(S/n)' : '(s/N)'} `)).trim().toLowerCase();
  return r ? r.startsWith('s') : padrao;
}
const rodar = (cmd, env = process.env) => spawnSync(cmd, { shell: true, stdio: 'inherit', env }).status === 0;

let temClaude = remover || claude('--version').status === 0;
if (!temClaude && (await pergunta('\nFalta o Claude Code. Instalar agora?'))) {
  rodar('npm install -g @anthropic-ai/claude-code');
  temClaude = claude('--version').status === 0;
}
if (!temClaude && !remover) {
  console.log('\nSem o Claude Code, as pastas e os atalhos serao preparados, mas o canal nao sera registrado.');
  console.log('Instale com "npm install -g @anthropic-ai/claude-code" e rode a instalacao de novo.\n');
}

const contas = loadAccounts();
const pendencias = [];
for (const conta of contas) {
  // Contas de outros agentes: so a pasta preparada e o atalho; os ganchos e o canal sao do Claude Code.
  if (conta.agente !== 'claude') {
    if (remover) {
      for (const ext of ['cmd', 'sh']) fs.rmSync(path.join(ROOT, `${conta.id}.${ext}`), { force: true });
      console.log(`${conta.nome}: atalho retirado. O login e o historico continuam em ${conta.dir}`);
    } else {
      fs.mkdirSync(conta.dir, { recursive: true });
      if (!conta.padrao) agenteDe(conta.agente).preparar?.(conta.dir);
      console.log(`${conta.nome} (${agenteDe(conta.agente).nome}): pasta ${conta.dir} | atalho ${path.basename(atalhoAgente(conta))}`);
    }
    continue;
  }
  if (!remover) fs.mkdirSync(conta.dir, { recursive: true });
  else if (!fs.existsSync(conta.dir)) continue;
  const aviso = ajustarSettings(conta);
  if (aviso) pendencias.push(`${conta.nome}: ${aviso}`);

  let canal = 'nao registrado';
  if (temClaude) {
    const dir = conta.padrao ? null : conta.dir;
    claude('mcp remove -s user painel', dir);
    if (remover) canal = 'removido';
    else {
      const r = claude(`mcp add -s user painel -- "${process.execPath}" "${CHANNEL}"`, dir);
      canal = r.status === 0 ? 'registrado' : 'FALHOU';
      if (r.status !== 0) pendencias.push(`${conta.nome}: nao consegui registrar o canal. ${String(r.stderr || r.stdout || '').trim().split('\n').pop()}`);
    }
  }
  if (remover) {
    for (const ext of ['cmd', 'sh']) fs.rmSync(path.join(ROOT, `${conta.id}.${ext}`), { force: true });
    console.log(`${conta.nome}: configuracao do duckV retirada (canal ${canal}). O login e o historico da conta continuam em ${conta.dir}`);
  } else {
    const file = atalho(conta);
    console.log(`${conta.nome}: pasta ${conta.dir} | canal ${canal} | atalho ${path.basename(file)}`);
  }
}

if (pendencias.length) {
  console.log('\nPontos de atencao:');
  for (const p of pendencias) console.log(`- ${p}`);
}

if (remover) {
  if (WIN) for (const nome of ['duckV.lnk', 'claudeV.lnk']) for (const p of ['Desktop', 'Startup']) fs.rmSync(path.join(pastaEspecial(p), nome), { force: true });
  console.log('\nPronto. Para apagar tudo, feche o duckV e exclua esta pasta.');
} else {
  // Login de cada conta: abre a pagina de entrada no navegador deste computador, uma conta por vez.
  // Da para pular e entrar depois pelo celular, no botao "Entrar nesta conta".
  if (temClaude) {
    for (const conta of contas.filter((c) => c.agente === 'claude')) {
      const st = claude('auth status', conta.padrao ? null : conta.dir);
      let email = null;
      try {
        const j = JSON.parse(st.stdout);
        if (j.loggedIn) email = j.email || 'conectada';
      } catch {
        /* versao antiga sem JSON */
      }
      if (email) {
        console.log(`${conta.nome}: ja entrou (${email}).`);
        continue;
      }
      if (!(await pergunta(`\nEntrar agora na ${conta.nome}? O navegador abre para voce escolher a conta Claude.`))) continue;
      const env = { ...process.env };
      if (!conta.padrao) env.CLAUDE_CONFIG_DIR = conta.dir;
      console.log('Se a pagina mostrar um codigo, copie e cole aqui.');
      rodar('claude auth login', env);
    }
  }

  // Tailscale: o caminho seguro para o celular falar com este computador de qualquer lugar.
  const temTailscale = spawnSync(WIN ? 'where tailscale || if exist "%ProgramFiles%\\Tailscale\\tailscale.exe" echo ok' : 'command -v tailscale', { shell: true, encoding: 'utf8' }).stdout.trim() !== '';
  if (!temTailscale && WIN && (await pergunta('\nInstalar o Tailscale? Ele liga o celular a este computador de forma segura, de qualquer lugar.'))) {
    if (rodar('winget install -e --id Tailscale.Tailscale')) {
      console.log('\nAbra o Tailscale (icone perto do relogio) e entre com uma conta. No celular, instale o app Tailscale e entre com a mesma conta.');
    }
  }

  if (WIN) {
    // O nome antigo (claudeV) apontava para iniciar-claudev.cmd, que nao existe mais.
    const ligavaComWindows = fs.existsSync(path.join(pastaEspecial('Startup'), 'claudeV.lnk'));
    for (const p of ['Desktop', 'Startup']) fs.rmSync(path.join(pastaEspecial(p), 'claudeV.lnk'), { force: true });
    if (ligavaComWindows) criarAtalho(atalhoInicio());
    criarAtalho(atalhoDesktop());
    console.log('\nCriei o atalho "duckV" na area de trabalho.');
    if (await pergunta('Ligar o duckV junto com o Windows?', false)) {
      criarAtalho(atalhoInicio());
      console.log('Pronto: o duckV liga sozinho quando voce entra no Windows.');
    }
  }

  console.log(`
Instalacao concluida.

1. ${WIN ? 'Abra o atalho "duckV" na area de trabalho' : 'Ligue o duckV: npm start'} e deixe a janela aberta.
2. No celular, instale o app duckV (duckV.apk na pagina de Releases), toque em "Escanear codigo"
   e aponte para o codigo da janela.
3. O celular mostra 4 numeros: digite-os na janela do duckV e aperte Enter. Pronto.

Contas que ficaram sem login podem entrar pelo proprio celular, no botao "Entrar nesta conta".
`);
  if (WIN && (await pergunta('Abrir o duckV agora?'))) spawnSync('start "duckV" "' + path.join(ROOT, 'iniciar-duckv.cmd') + '"', { shell: true });
}
rl?.close();
