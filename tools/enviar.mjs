#!/usr/bin/env node
// Manda arquivos do computador para o celular pelo duckV: eles aparecem na tela Arquivos do app,
// com aviso no celular, e na conversa da sessao que mandou (quando da para saber qual foi).
// uso: node tools/enviar.mjs <arquivo> [outro arquivo...] [--nota "texto que acompanha"]
import path from 'node:path';
import { hubConfig } from '../agent/common.mjs';

const args = process.argv.slice(2);
let nota = '';
const arquivos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--nota') nota = args[++i] || '';
  else arquivos.push(args[i]);
}
if (!arquivos.length) {
  console.error('uso: node tools/enviar.mjs <arquivo> [outro arquivo...] [--nota "texto"]');
  process.exit(2);
}
const cfg = hubConfig();
if (!cfg) {
  console.error('O duckV não está configurado neste computador. Rode o instalador primeiro.');
  process.exit(1);
}
const porta = process.env.PAINEL_PORT || cfg.port;
let falhou = false;
for (const a of arquivos) {
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/ingest/arquivo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-painel-secret': cfg.agentSecret },
      body: JSON.stringify({
        caminho: path.resolve(a),
        nota,
        instancia: process.env.PAINEL_INSTANCE || null,
        sessao: process.env.CLAUDE_CODE_SESSION_ID || null,
        conta: process.env.PAINEL_ACCOUNT || null,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `o duckV respondeu ${r.status}`);
    console.log(`Enviado ao celular: ${j.nome}`);
  } catch (e) {
    falhou = true;
    console.error(`Não consegui enviar ${a}: ${e.cause?.code === 'ECONNREFUSED' ? 'o duckV está desligado (abra o iniciar-duckv.cmd)' : e.message}`);
  }
}
process.exit(falhou ? 1 : 0);
