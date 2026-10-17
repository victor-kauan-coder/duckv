#!/usr/bin/env node
// duckV como servico: sempre ligado, sem janela, liga ao entrar no computador e volta se cair.
// uso: node tools/servico.mjs instalar | remover | estado
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instalarServico, removerServico, estadoServico } from '../lib/servico.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [acao] = process.argv.slice(2);
const sistema = { win32: 'inicialização do Windows', darwin: 'LaunchAgent', linux: 'systemd do usuário' }[process.platform] || process.platform;

if (acao === 'instalar') {
  const r = instalarServico(ROOT);
  if (r.erro) {
    console.error(r.erro);
    process.exit(1);
  }
  console.log(`duckV instalado como serviço (${sistema}). Ele liga sozinho ao entrar no computador e volta se cair.`);
  console.log(`Registro: ${path.join(ROOT, 'data', 'servico.log')}`);
  console.log('Para parear um celular novo: rode "node tools/servico.mjs remover", abra o duckV num terminal, pareie e instale o serviço de novo.');
  if (r.aviso) console.log(`\nAtenção: ${r.aviso}`);
} else if (acao === 'remover') {
  removerServico(ROOT);
  console.log('Serviço do duckV removido. Ele não liga mais sozinho.');
} else if (acao === 'estado') {
  const e = estadoServico();
  console.log(e.instalado ? `Instalado como serviço (${sistema})${e.rodando ? ', rodando agora.' : ', mas parado agora.'}` : 'O duckV não está instalado como serviço.');
} else {
  console.error('uso: node tools/servico.mjs instalar | remover | estado');
  process.exit(2);
}
