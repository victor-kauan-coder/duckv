#!/usr/bin/env node
// Vigia do duckV como servico no Windows (o systemd e o launchd ja fazem isto sozinhos): liga o
// hub/server.mjs sem janela e, se ele cair, liga de novo, esperando cada vez mais (ate 1 minuto).
// Saida normal (codigo 0) nao religa. Tudo vai para data/servico.log.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG = path.join(ROOT, 'data', 'servico.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
const anotar = (t) => fs.appendFileSync(LOG, `[vigia ${new Date().toISOString()}] ${t}\n`);

// Variaveis de uma sessao de agente (instalado de dentro do duckV, por exemplo) nao podem vazar para o
// duckV que o vigia liga: PAINEL_PORT de outro duckV o faria brigar pela porta. As mesmas que o app limpa.
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^ELECTRON_|^NODE_OPTIONS$|^PAINEL_(?!DATA$|CONTAS$)|^CLAUDE_CODE_|^CLAUDECODE$/.test(k)) delete env[k];

let espera = 2000;
function ligar() {
  try {
    if (fs.statSync(LOG).size > 4 * 1024 * 1024) fs.renameSync(LOG, `${LOG}.1`);
  } catch {
    /* primeiro registro */
  }
  const saida = fs.openSync(LOG, 'a');
  const inicio = Date.now();
  const filho = spawn(process.execPath, [path.join(ROOT, 'hub', 'server.mjs'), '--sem-qr'], { cwd: ROOT, env, stdio: ['ignore', saida, saida], windowsHide: true });
  anotar(`duckV ligado (pid ${filho.pid})`);
  filho.on('exit', (codigo) => {
    fs.closeSync(saida);
    if (codigo === 0) return anotar('duckV desligou normalmente; o vigia para aqui.');
    // ficou de pe um bom tempo antes de cair: a espera volta ao comeco
    if (Date.now() - inicio > 120_000) espera = 2000;
    anotar(`duckV caiu (codigo ${codigo}); ligando de novo em ${Math.round(espera / 1000)} s`);
    setTimeout(ligar, espera);
    espera = Math.min(espera * 2, 60_000);
  });
}
ligar();
