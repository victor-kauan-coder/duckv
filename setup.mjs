#!/usr/bin/env node
// Instalacao do claudeV: prepara as pastas das contas, liga o Claude Code de
// cada conta ao claudeV e cria os atalhos. Pode ser executado de novo sem problema.
//   node setup.mjs            instala ou atualiza
//   node setup.mjs --remover  desfaz o que a instalacao configurou
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import webpush from 'web-push';
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
  console.error(`O claudeV precisa do Node.js 20 ou mais novo (este e o ${process.versions.node}). Baixe em https://nodejs.org`);
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
    aviso = 'ja tem uma linha de status propria; o claudeV nao vai receber o uso desta conta enquanto ela estiver la.';
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

// ------------------------------------------------------------------ execucao

if (!remover) {
  ensureConfig(() => webpush.generateVAPIDKeys());
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    writeJson(ACCOUNTS_FILE, defaultAccounts().map(({ id, nome, cor, dir }) => ({ id, nome, cor, dir })));
    console.log('Criei o arquivo contas.json com tres contas. Voce pode mudar nomes e cores nele.');
  }
}

const temClaude = claude('--version').status === 0;
if (!temClaude) {
  console.log('\nNao encontrei o comando "claude". Instale o Claude Code e rode a instalacao de novo.');
  console.log('Enquanto isso, as pastas e os atalhos serao preparados, mas o canal nao sera registrado.\n');
}

const contas = loadAccounts();
const pendencias = [];
for (const conta of contas) {
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
    console.log(`${conta.nome}: configuracao do claudeV retirada (canal ${canal}). O login e o historico da conta continuam em ${conta.dir}`);
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
  console.log('\nPronto. Para apagar tudo, feche o claudeV e exclua esta pasta.');
} else {
  const ext = WIN ? '.cmd' : '.sh';
  console.log(`
Instalacao concluida. Proximos passos:

1. Entre em cada conta uma unica vez: abra ${contas.map((c) => c.id + ext).join(', ')},
   e em cada janela digite /login e entre com a conta correspondente.
2. Ligue o claudeV: ${WIN ? 'iniciar-claudev.cmd' : 'npm start'}
3. No celular, aponte a camera para o codigo que aparece na janela.

O passo a passo completo, incluindo o acesso de fora de casa, esta no LEIAME.md.
`);
}
